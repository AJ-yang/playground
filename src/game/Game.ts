import { dist2 } from '../core/vec2'
import type { Vec2 } from '../core/vec2'
import { Rng } from '../core/rng'
import { getEnemyDef } from '../data/enemies'
import { getTowerDef, buildCost, MAX_SLOW, TOWER_ORDER } from '../data/towers'
import { EARLY_CALL_GOLD_PER_SECOND } from '../data/waves'
import type { StageDef } from '../data/stages'
import { Enemy } from './Enemy'
import { Effects } from './Effects'
import { Grid } from './Grid'
import { Path } from './Path'
import { Projectile } from './Projectile'
import { Tower } from './Tower'
import { WaveManager } from './WaveManager'
import { TARGET_PRIORITY_ORDER, type GamePhase } from './types'

export const TILE_SIZE = 40

/** 건설 시도 결과 — UI가 실패 사유를 그대로 보여줄 수 있게 문자열을 돌려준다. */
export type BuildResult = { ok: true } | { ok: false; reason: string }

export interface GameOptions {
  seed?: number
  /** 이번 판에 건설할 수 있는 타워. 생략하면 전부 허용한다. */
  availableTowers?: readonly string[]
  /** 난이도 체력 배율. 1이 기준. */
  hpScale?: number
}

/**
 * 한 스테이지의 상태 전체를 소유하는 오케스트레이터.
 *
 * 규칙: 상태 변경은 반드시 이 클래스를 거친다. 렌더러와 UI는 여기를
 * 읽기만 하고, 입력은 명령 메서드(tryBuild/upgrade/sell/...)로만 들어온다.
 * 이 경계를 지키면 나중에 리플레이·세이브·네트워크 동기화를 붙일 때
 * 손댈 곳이 이 파일 하나로 좁혀진다.
 */
export class Game {
  readonly stage: StageDef
  readonly grid: Grid
  /** 맵의 경로들. 적은 각자 하나를 배정받아 달린다. */
  readonly paths: Path[]
  readonly waves: WaveManager
  readonly effects = new Effects()
  /** 이번 판에 건설 가능한 타워 ID */
  readonly availableTowers: readonly string[]
  /** 난이도 체력 배율. 적을 만들 때만 쓴다. */
  readonly hpScale: number
  private readonly rng: Rng
  /**
   * 연출 전용 난수. **시뮬레이션 난수와 반드시 분리한다.**
   *
   * 같은 스트림을 쓰면 그림용 값을 하나 뽑는 것만으로 이후 모든 시뮬레이션
   * 난수가 한 칸씩 밀려, 렌더링만 바꿨는데 밸런스 수치가 달라진다.
   * 실제로 좌우 흩뿌림을 넣자마자 임계값 근처 전략의 클리어율이 흔들렸다.
   */
  private readonly cosmeticRng: Rng

  readonly enemies: Enemy[] = []
  readonly towers: Tower[] = []
  readonly projectiles: Projectile[] = []

  gold: number
  lives: number
  /** 외부에서는 읽기만 한다. 변경은 setPhase()를 거친다. */
  phase: GamePhase = 'prep'

  /** 통계 */
  totalKills = 0
  totalLeaked = 0
  goldEarned = 0
  goldSpent = 0
  /** 조기 소환으로 얻은 누적 보너스 골드 */
  earlyCallBonus = 0

  /**
   * 생명이 깎인 직후 잠깐 1에서 0으로 떨어지는 값. 화면 전체를 붉게 번쩍이는
   * 연출에 쓴다. 유출은 게임에서 가장 중요한 사건인데 화면 구석의 숫자가
   * 조용히 1 줄어드는 것만으로는 전혀 눈에 띄지 않았다.
   */
  damageFlash = 0

  /** 건설 대기 중인 타워 ID (null이면 건설 모드 아님) */
  selectedBuildId: string | null = null
  /** 선택된(정보 패널이 열린) 타워 */
  selectedTower: Tower | null = null
  /** 마우스가 올라간 타일 */
  hoverTile: Vec2 | null = null

  private nextEntityId = 1

  constructor(stage: StageDef, options: GameOptions = {}) {
    this.stage = stage
    this.rng = new Rng(options.seed ?? 20240816)
    this.cosmeticRng = new Rng((options.seed ?? 20240816) ^ 0x5f3759df)
    this.availableTowers = options.availableTowers ?? TOWER_ORDER
    this.hpScale = options.hpScale ?? 1
    this.waves = new WaveManager(stage.waves)

    const level = stage.level
    this.grid = new Grid(level.cols, level.rows, TILE_SIZE)
    this.paths = level.routes.map((route) => new Path(route, TILE_SIZE))
    this.gold = stage.startGold
    this.lives = stage.startLives

    // 모든 경로가 지나는 타일은 건설 불가. 경로끼리 겹쳐도 문제없다.
    for (let i = 0; i < level.routes.length; i++) {
      for (const tile of this.paths[i]!.occupiedTiles(level.routes[i]!)) {
        this.grid.setKind(tile.x, tile.y, 'path')
      }
    }
    for (const tile of level.blocked) {
      // 경로 타일을 실수로 덮어쓰지 않도록 확인한다.
      if (this.grid.kindAt(tile.x, tile.y) === 'buildable') {
        this.grid.setKind(tile.x, tile.y, 'blocked')
      }
    }
  }

  get isOver(): boolean {
    return this.phase === 'victory' || this.phase === 'defeat'
  }

  /** 첫 번째 경로. 마을 표식처럼 "대표 경로" 하나가 필요할 때 쓴다. */
  get mainPath(): Path {
    return this.paths[0]!
  }

  canUse(towerId: string): boolean {
    return this.availableTowers.includes(towerId)
  }

  // ────────────────────────────── 명령 (UI → 게임) ──────────────────────────────

  selectBuild(towerId: string | null): void {
    if (towerId !== null && !this.canUse(towerId)) return
    this.selectedBuildId = towerId
    if (towerId !== null) this.selectedTower = null
  }

  /** 타일 클릭 처리. 건설 모드면 건설, 아니면 타워 선택/해제. */
  clickTile(col: number, row: number): BuildResult | null {
    const existing = this.grid.towerIdAt(col, row)
    if (existing !== undefined) {
      this.selectedTower = this.towers.find((t) => t.id === existing) ?? null
      this.selectedBuildId = null
      return null
    }

    if (this.selectedBuildId) {
      return this.tryBuild(this.selectedBuildId, col, row)
    }

    this.selectedTower = null
    return null
  }

  tryBuild(towerId: string, col: number, row: number): BuildResult {
    if (this.isOver) return { ok: false, reason: '게임이 끝났습니다' }
    if (!this.canUse(towerId)) return { ok: false, reason: '아직 해금되지 않은 타워입니다' }
    if (!this.grid.inBounds(col, row)) return { ok: false, reason: '맵 밖입니다' }

    const kind = this.grid.kindAt(col, row)
    if (kind === 'path') return { ok: false, reason: '경로 위에는 지을 수 없습니다' }
    if (kind === 'blocked') return { ok: false, reason: '지형이 막혀 있습니다' }
    if (!this.grid.canBuild(col, row)) return { ok: false, reason: '이미 타워가 있습니다' }

    const cost = buildCost(towerId)
    if (this.gold < cost) return { ok: false, reason: `골드가 ${cost - this.gold} 부족합니다` }

    const center = this.grid.center(col, row)
    const tower = new Tower(this.nextEntityId++, towerId, col, row, center)
    this.towers.push(tower)
    this.grid.occupy(col, row, tower.id)
    this.gold -= cost
    this.goldSpent += cost

    this.effects.blast(center, TILE_SIZE * 0.7, getTowerDef(towerId).accent, 0.28)
    this.selectedTower = tower
    this.refreshCommandAuras()
    return { ok: true }
  }

  upgradeTower(tower: Tower): BuildResult {
    if (this.isOver) return { ok: false, reason: '게임이 끝났습니다' }
    if (tower.isMaxLevel) return { ok: false, reason: '이미 최대 레벨입니다' }

    const cost = tower.upgradeCost!
    if (this.gold < cost) return { ok: false, reason: `골드가 ${cost - this.gold} 부족합니다` }

    this.gold -= cost
    this.goldSpent += cost
    tower.upgrade()
    this.refreshCommandAuras()
    this.effects.blast(tower.pos, TILE_SIZE * 0.9, tower.def.accent, 0.3)
    // 건물 위로 띄운다. 타워 좌표에 그대로 띄우면 글자가 지붕을 가려
    // 무엇을 올렸는지가 안 보인다.
    this.effects.text(
      { x: tower.pos.x, y: tower.pos.y - TILE_SIZE * 0.75 },
      `Lv.${tower.level}`,
      tower.def.accent,
    )
    return { ok: true }
  }

  sellTower(tower: Tower): BuildResult {
    const refund = tower.sellValue()
    this.gold += refund
    this.grid.vacate(tower.col, tower.row)
    const index = this.towers.indexOf(tower)
    if (index >= 0) this.towers.splice(index, 1)
    if (this.selectedTower === tower) this.selectedTower = null

    this.refreshCommandAuras()
    this.effects.burst(tower.pos, '#c9a227', 8, 70)
    this.effects.text(tower.pos, `+${refund}G`, '#f0c674')
    return { ok: true }
  }

  /**
   * 기고(旗鼓)의 지휘 범위를 다시 계산해 각 타워에 박아 둔다.
   *
   * 타워 집합이 바뀔 때만 부른다 — 매 프레임 돌면 O(타워²)가 시뮬레이션
   * 핫 패스에 들어간다. 타워는 웨이브 중에 늘지 않으므로 이걸로 충분하다.
   *
   * **중첩되지 않는다.** 감속·중독과 같은 규칙으로, 겹쳐도 가장 강한 하나만
   * 적용한다 — 서포터를 도배해 곱셈을 쌓는 퇴화 전략을 막기 위함이다.
   * 기고끼리는 서로를 지휘하지 않는다(자기 증폭 고리를 만들지 않는다).
   */
  private refreshCommandAuras(): void {
    const banners = this.towers.filter((t) => t.stats.auraFireRate > 0)
    for (const tower of this.towers) {
      let best = 0
      if (tower.stats.auraFireRate === 0) {
        for (const banner of banners) {
          const reach = banner.stats.auraRange * TILE_SIZE
          if (dist2(tower.pos, banner.pos) > reach ** 2) continue
          if (banner.stats.auraFireRate > best) best = banner.stats.auraFireRate
        }
      }
      tower.fireRateBonus = best
    }
  }

  upgradeSelected(): BuildResult {
    const tower = this.selectedTower
    if (!tower) return { ok: false, reason: '선택된 타워가 없습니다' }
    return this.upgradeTower(tower)
  }

  sellSelected(): BuildResult {
    const tower = this.selectedTower
    if (!tower) return { ok: false, reason: '선택된 타워가 없습니다' }
    return this.sellTower(tower)
  }

  cycleSelectedTargeting(): void {
    this.selectedTower?.cycleTargetPriority(TARGET_PRIORITY_ORDER)
  }

  /** 다음 웨이브 조기 소환. 남은 준비 시간만큼 보너스 골드를 준다. */
  callNextWave(): void {
    if (this.isOver || this.waves.running) return
    const skipped = this.waves.start()
    const bonus = Math.floor(skipped * EARLY_CALL_GOLD_PER_SECOND)
    if (bonus > 0) {
      this.gold += bonus
      this.goldEarned += bonus
      this.earlyCallBonus += bonus
      const spawn = this.mainPath.positionAt(0)
      this.effects.text({ x: spawn.x + 40, y: spawn.y }, `조기 소환 +${bonus}G`, '#f0c674', 1.4)
    }
    this.setPhase('wave')
  }

  // ────────────────────────────── 시뮬레이션 ──────────────────────────────

  /**
   * 상태 전이의 단일 창구.
   *
   * 승리·패배는 종착 상태다. 한번 확정되면 같은 프레임의 뒤쪽 단계나
   * 다음 프레임이 절대 되돌릴 수 없어야 한다 — 이 가드가 없으면 마지막
   * 적이 유출되며 생명이 0이 된 직후 웨이브 클리어 처리가 phase를 'prep'으로
   * 덮어써서, 생명 0인 채로 게임이 계속되는 상태가 만들어진다.
   */
  private setPhase(next: GamePhase): void {
    if (this.phase === 'victory' || this.phase === 'defeat') return
    this.phase = next
  }

  update(dt: number): void {
    this.effects.update(dt)
    // 게임이 끝난 뒤에도 번쩍임은 자연스럽게 잦아들어야 한다.
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2)
    if (this.isOver) return

    this.updateWaves(dt)
    this.updateEnemies(dt)
    // 이번 스텝에 패배가 확정됐다면 즉시 멈춘다.
    if (this.isOver) return
    this.updateTowers(dt)
    this.updateProjectiles(dt)
    this.cleanup()
    this.checkWaveCompletion()
  }

  private updateWaves(dt: number): void {
    const due = this.waves.update(dt)
    this.setPhase(this.waves.running ? 'wave' : 'prep')

    for (const spawn of due) {
      const def = getEnemyDef(spawn.enemy)
      const path = this.paths[spawn.route] ?? this.mainPath
      // 같은 타이밍에 여러 마리가 겹쳐 보이지 않도록 살짝 흩뿌린다.
      // 진행 방향(jitter)만으로는 부족해 길 폭 안에서 좌우(lateral)로도 민다 —
      // 이쪽은 렌더링 전용이라 사거리 판정에는 영향이 없다.
      const jitter = this.rng.range(0, TILE_SIZE * 0.6)
      const lateral = this.cosmeticRng.range(-TILE_SIZE * 0.22, TILE_SIZE * 0.22)
      this.enemies.push(
        new Enemy(this.nextEntityId++, def, path, jitter, lateral, this.hpScale),
      )
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      enemy.update(dt, TILE_SIZE)

      // 중독 피해도 건 타워의 기여도로 잡는다. 그러지 않으면 지속 피해 타워의
      // 딜 점유율이 실제보다 훨씬 낮게 보여 밸런스 판단을 그르친다.
      if (enemy.poisonTickDamage > 0 && enemy.poisonSourceTowerId >= 0) {
        const source = this.towers.find((t) => t.id === enemy.poisonSourceTowerId)
        if (source) source.damageDealt += enemy.poisonTickDamage
      }

      // 중독으로 죽은 적은 쏜 타워가 없으므로 여기서 보상을 정산한다.
      if (!enemy.alive && enemy.killedByPoison) {
        this.rewardKill(enemy, undefined)
        continue
      }

      if (enemy.leaked) {
        this.lives -= enemy.def.leak
        this.totalLeaked++
        // 여러 마리가 연속으로 새면 번쩍임이 겹쳐 더 강해진다.
        this.damageFlash = Math.min(1.4, this.damageFlash + 0.55 + enemy.def.leak * 0.12)
        const end = enemy.path.positionAt(enemy.path.totalLength)
        this.effects.text(end, `-${enemy.def.leak}`, '#ff6b6b', 1.2)
        if (this.lives <= 0) {
          this.lives = 0
          this.setPhase('defeat')
        }
      }
    }
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      const shot = tower.update(dt, this.enemies, TILE_SIZE)
      if (shot) {
        shot.sourceTowerId = tower.id
        this.projectiles.push(shot)
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of this.projectiles) {
      if (projectile.dead) continue
      projectile.update(dt)
      if (projectile.impacted) this.resolveImpact(projectile)
    }
  }

  /** 착탄 판정. 데미지·감속·중독·보상이 전부 여기서 결정된다. */
  private resolveImpact(projectile: Projectile): void {
    projectile.dead = true
    const spec = projectile.spec
    const source = this.towers.find((t) => t.id === projectile.sourceTowerId)

    const hit = (enemy: Enemy): void => {
      const dealt = enemy.takeDamage(spec.damage, spec.damageType)
      if (source) source.damageDealt += dealt
      // 거마작은 말을 막는 물건이라 기마에게 더 깊게 걸린다. 상한을 두는 이유는
      // 완전 정지가 적을 사거리 밖에서 영원히 세워두는 퇴행 전략을 만들기 때문이다.
      const slow =
        enemy.def.flying && spec.cavalrySlow > 0
          ? Math.min(MAX_SLOW, spec.slowAmount + spec.cavalrySlow)
          : spec.slowAmount
      enemy.applySlow(slow, spec.slowDuration)
      enemy.applyPoison(spec.poisonDps, spec.poisonDuration, projectile.sourceTowerId)
      if (!enemy.alive && !enemy.leaked) this.rewardKill(enemy, source)
    }

    if (spec.splashRadius > 0) {
      const radiusSq = spec.splashRadius ** 2
      for (const enemy of this.enemies) {
        if (!enemy.alive || enemy.distance < 0) continue
        if (enemy.flyingBlocked(source ? source.def.targetsAir : true)) continue
        if (dist2(enemy.pos, projectile.pos) <= radiusSq) hit(enemy)
      }
      this.effects.blast(projectile.pos, spec.splashRadius, spec.color, 0.3)
    } else {
      const target = spec.target
      if (target && target.alive) hit(target)
      this.effects.blast(projectile.pos, 7, spec.color, 0.16)
    }
  }

  private rewardKill(enemy: Enemy, source: Tower | undefined): void {
    this.gold += enemy.def.bounty
    this.goldEarned += enemy.def.bounty
    this.totalKills++
    if (source) source.kills++
    this.effects.burst(enemy.pos, enemy.def.color, enemy.def.boss ? 26 : 7, enemy.def.boss ? 190 : 90)
    if (enemy.def.bounty >= 30) {
      this.effects.text(enemy.pos, `+${enemy.def.bounty}G`, '#f0c674', 0.8)
    }
  }

  private cleanup(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i]!.alive) this.enemies.splice(i, 1)
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i]!.dead) this.projectiles.splice(i, 1)
    }
  }

  private checkWaveCompletion(): void {
    if (!this.waves.running) return
    if (!this.waves.spawnFinished || this.enemies.length > 0) return

    const reward = this.waves.currentWave.reward
    this.gold += reward
    this.goldEarned += reward
    const mid = this.mainPath.positionAt(this.mainPath.totalLength * 0.5)
    this.effects.text(mid, `웨이브 클리어 +${reward}G`, '#8bd450', 1.6)

    if (this.waves.isFinalWave) {
      this.setPhase('victory')
      this.waves.running = false
      return
    }
    this.waves.completeWave()
    this.setPhase('prep')
  }

  // ────────────────────────────── 조회 헬퍼 ──────────────────────────────

  /**
   * 생명 위기도 0~1. 0이면 여유, 1이면 곧 패배.
   *
   * 남은 생명 비율이 60% 아래로 내려가야 켜진다 — 처음 한두 번 샜다고 화면이
   * 붉어지면 경고가 소음이 되고, 정작 위험할 때 눈에 들어오지 않는다.
   */
  get dangerLevel(): number {
    const ratio = this.lives / Math.max(1, this.stage.startLives)
    if (ratio >= 0.6) return 0
    return Math.min(1, (0.6 - ratio) / 0.6)
  }

  /** 현재 건설 모드에서 hoverTile에 지을 수 있는지 여부. */
  get hoverBuildable(): boolean {
    if (!this.selectedBuildId || !this.hoverTile) return false
    return (
      this.grid.canBuild(this.hoverTile.x, this.hoverTile.y) &&
      this.gold >= buildCost(this.selectedBuildId)
    )
  }
}
