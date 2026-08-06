import { dist2 } from '../core/vec2'
import type { Vec2 } from '../core/vec2'
import { Rng } from '../core/rng'
import { getEnemyDef } from '../data/enemies'
import { getTowerDef, buildCost, TOWER_ORDER } from '../data/towers'
import { EARLY_CALL_GOLD_PER_SECOND, TOTAL_WAVES } from '../data/waves'
import type { LevelDef } from '../data/levels'
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

/**
 * 게임 상태 전체를 소유하는 오케스트레이터.
 *
 * 규칙: 상태 변경은 반드시 이 클래스를 거친다. 렌더러와 UI는 여기를
 * 읽기만 하고, 입력은 명령 메서드(tryBuild/upgrade/sell/...)로만 들어온다.
 * 이 경계를 지키면 나중에 리플레이·세이브·네트워크 동기화를 붙일 때
 * 손댈 곳이 이 파일 하나로 좁혀진다.
 */
export class Game {
  readonly level: LevelDef
  readonly grid: Grid
  readonly path: Path
  readonly waves = new WaveManager()
  readonly effects = new Effects()
  private readonly rng: Rng

  readonly enemies: Enemy[] = []
  readonly towers: Tower[] = []
  readonly projectiles: Projectile[] = []

  gold: number
  lives: number
  phase: GamePhase = 'prep'

  /** 통계 */
  totalKills = 0
  totalLeaked = 0
  goldEarned = 0

  /** 건설 대기 중인 타워 ID (null이면 건설 모드 아님) */
  selectedBuildId: string | null = null
  /** 선택된(정보 패널이 열린) 타워 */
  selectedTower: Tower | null = null
  /** 마우스가 올라간 타일 */
  hoverTile: Vec2 | null = null

  private nextEntityId = 1

  constructor(level: LevelDef, seed = 20240816) {
    this.level = level
    this.rng = new Rng(seed)
    this.grid = new Grid(level.cols, level.rows, TILE_SIZE)
    this.path = new Path(level.waypoints, TILE_SIZE)
    this.gold = level.startGold
    this.lives = level.startLives

    for (const tile of this.path.occupiedTiles(level.waypoints)) {
      this.grid.setKind(tile.x, tile.y, 'path')
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

  // ────────────────────────────── 명령 (UI → 게임) ──────────────────────────────

  selectBuild(towerId: string | null): void {
    if (towerId !== null && !TOWER_ORDER.includes(towerId)) return
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

    this.effects.blast(center, TILE_SIZE * 0.7, getTowerDef(towerId).accent, 0.28)
    this.selectedTower = tower
    return { ok: true }
  }

  upgradeSelected(): BuildResult {
    const tower = this.selectedTower
    if (!tower) return { ok: false, reason: '선택된 타워가 없습니다' }
    if (tower.isMaxLevel) return { ok: false, reason: '이미 최대 레벨입니다' }

    const cost = tower.upgradeCost!
    if (this.gold < cost) return { ok: false, reason: `골드가 ${cost - this.gold} 부족합니다` }

    this.gold -= cost
    tower.upgrade()
    this.effects.blast(tower.pos, TILE_SIZE * 0.9, tower.def.accent, 0.3)
    this.effects.text(tower.pos, `Lv.${tower.level}`, tower.def.accent)
    return { ok: true }
  }

  sellSelected(): BuildResult {
    const tower = this.selectedTower
    if (!tower) return { ok: false, reason: '선택된 타워가 없습니다' }

    const refund = tower.sellValue()
    this.gold += refund
    this.grid.vacate(tower.col, tower.row)
    const index = this.towers.indexOf(tower)
    if (index >= 0) this.towers.splice(index, 1)
    this.selectedTower = null

    this.effects.burst(tower.pos, '#c9a227', 8, 70)
    this.effects.text(tower.pos, `+${refund}G`, '#f0c674')
    return { ok: true }
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
      const spawn = this.path.positionAt(0)
      this.effects.text({ x: spawn.x + 40, y: spawn.y }, `조기 소환 +${bonus}G`, '#f0c674', 1.4)
    }
    this.phase = 'wave'
  }

  // ────────────────────────────── 시뮬레이션 ──────────────────────────────

  update(dt: number): void {
    this.effects.update(dt)
    if (this.isOver) return

    this.updateWaves(dt)
    this.updateEnemies(dt)
    this.updateTowers(dt)
    this.updateProjectiles(dt)
    this.cleanup()
    this.checkWaveCompletion()
  }

  private updateWaves(dt: number): void {
    const due = this.waves.update(dt)
    this.phase = this.waves.running ? 'wave' : 'prep'

    for (const enemyId of due) {
      const def = getEnemyDef(enemyId)
      // 같은 타이밍에 여러 마리가 겹쳐 보이지 않도록 살짝 흩뿌린다.
      const jitter = this.rng.range(0, TILE_SIZE * 0.6)
      this.enemies.push(new Enemy(this.nextEntityId++, def, this.path, jitter))
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      enemy.update(dt, this.path, TILE_SIZE)

      if (enemy.leaked) {
        this.lives -= enemy.def.leak
        this.totalLeaked++
        const end = this.path.positionAt(this.path.totalLength)
        this.effects.text(end, `-${enemy.def.leak}`, '#ff6b6b', 1.2)
        if (this.lives <= 0) {
          this.lives = 0
          this.phase = 'defeat'
        }
      }
    }
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      const shot = tower.update(dt, this.enemies, this.path, TILE_SIZE)
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

  /** 착탄 판정. 데미지·감속·보상이 전부 여기서 결정된다. */
  private resolveImpact(projectile: Projectile): void {
    projectile.dead = true
    const spec = projectile.spec
    const source = this.towers.find((t) => t.id === projectile.sourceTowerId)

    const hit = (enemy: Enemy): void => {
      const dealt = enemy.takeDamage(spec.damage, spec.damageType)
      if (source) source.damageDealt += dealt
      enemy.applySlow(spec.slowAmount, spec.slowDuration)
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
    const end = this.path.positionAt(this.path.totalLength * 0.5)
    this.effects.text(end, `웨이브 클리어 +${reward}G`, '#8bd450', 1.6)

    if (this.waves.isFinalWave) {
      this.phase = 'victory'
      this.waves.running = false
      return
    }
    this.waves.completeWave()
    this.phase = 'prep'
  }

  // ────────────────────────────── 조회 헬퍼 ──────────────────────────────

  /** HUD 표시용 진행률 (0~1). */
  get campaignProgress(): number {
    return Math.min(1, (this.waves.waveNumber - 1) / TOTAL_WAVES)
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
