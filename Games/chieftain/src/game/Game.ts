import { Rng } from '../core/rng'
import { clamp, dist, dist2, moveToward, norm, type Vec2 } from '../core/vec2'
import { CENTER, KEEP_P0, KEEP_P1, TILE_LAND } from '../data/fjord'
import { FJORD_NEUTRALS, type NeutralDef } from '../data/neutrals'
import { COMMANDED_BONUS, TUNING } from '../data/tuning'
import { UNITS, type UnitDef, type UnitKind } from '../data/units'
import { Board } from './Board'
import {
  NEUTRAL,
  NOBODY,
  type EndState,
  type Phase,
  type PlayerState,
  type Side,
  type Telemetry,
  type Unit,
} from './types'

/** 반경 밖 유닛이 스스로 판단을 다시 하는 주기. 즉각 반응하지 않는다는 뜻이다. */
const AUTONOMY_THINK = 1.5

/** 유닛이 스스로 달려드는 거리. 이보다 멀면 못 본 척한다. */
const AGGRO = 9

/**
 * 유닛이 서로 지키는 간격.
 *
 * 판정 반지름(`UNITS[].radius`)이 아니라 **눈에 보이는 몸 크기**를 기준으로
 * 민다(`Actors.VIEW_SCALE`와 같은 값). 판정 반지름으로만 밀면 열 명이 한 점에
 * 뭉쳐 주황색 덩어리가 되고, 그러면 방패벽이 줄지어 선 모습이 안 보인다 —
 * 이 게임에서 대열의 모양은 장식이 아니라 지휘 반경을 읽는 단서다.
 */
const BODY_SPACING = 1.75

export interface GameOptions {
  seed: number
  /** 사람이 잡는 쪽. v1은 항상 0이지만, PvP를 얹을 때 여기가 갈라진다. */
  humanSide: Side
}

/**
 * 판 전체.
 *
 * **렌더링을 전혀 모른다.** `update(dt)`만 부르면 판이 굴러가고, 그림은
 * 바깥에서 이 상태를 읽어 그린다. 지금은 화면이 하나뿐이라 이 분리가 낭비처럼
 * 보이지만, 나중에 락스텝을 얹으면 이 클래스만 두 클라이언트에서 똑같이
 * 돌면 되므로 그때 값을 한다(GDD 7.2).
 */
export class Game {
  readonly board: Board
  readonly rng: Rng
  readonly units: Unit[] = []
  readonly players: [PlayerState, PlayerState]
  readonly humanSide: Side

  phase: Phase = 'playing'
  end: EndState | null = null
  endTimer = 0

  /** 진영별로 지금 보이는 칸. 렌더러와 AI가 함께 읽는다. */
  visible: [Set<number>, Set<number>] = [new Set(), new Set()]

  telemetry: Telemetry = {
    descents: 0,
    timeInFirstPerson: 0,
    lastDescentAt: -1,
    elapsed: 0,
  }

  /** UI에 띄울 짧은 알림. 오래된 것부터 사라진다. */
  readonly log: { text: string; at: number }[] = []

  private nextId = 1

  constructor(opts: GameOptions) {
    this.rng = new Rng(opts.seed)
    this.humanSide = opts.humanSide
    this.board = new Board(opts.seed, KEEP_P0, KEEP_P1)

    this.players = [this.makePlayer(0, KEEP_P0), this.makePlayer(1, KEEP_P1)]
    this.spawnNeutralGuards()

    // 시작 병력. 아무것도 없이 시작하면 첫 30초가 빈 화면이 된다.
    for (const side of [0, 1] as Side[]) {
      this.spawnUnit(side, 'shield', this.players[side].keepTile)
      this.spawnUnit(side, 'axe', this.players[side].keepTile)
    }
    this.refreshVisibility()
  }

  // ────────────────────────────────────────────────────────────── 만들기

  private makePlayer(side: Side, keepTile: number): PlayerState {
    const d = this.board.defs[keepTile]!
    const home = { x: d.x, z: d.z }
    return {
      side,
      silver: TUNING.startingSilver,
      queue: [],
      rally: { ...home },
      rallyTile: keepTile,
      keepHp: TUNING.keepHp,
      keepTile,
      avatar: {
        side,
        // 아바타는 롱하우스 **밖**에 선다. 건물 안에서 시작하면 강림한 첫
        // 화면이 벽이라, 1인칭이 무엇을 보여주는지 알기도 전에 인상이 정해진다.
        pos: { x: d.x + (side === 0 ? 10 : -10), z: d.z + 6 },
        yaw: side === 0 ? 0 : Math.PI,
        moveTarget: null,
        driving: false,
      },
    }
  }

  private spawnNeutralGuards(): void {
    for (const tile of this.board.tiles) {
      const camp = tile.neutral
      if (!camp) continue
      const def = FJORD_NEUTRALS[camp.kind]
      for (let i = 0; i < def.guards; i++) {
        const u = this.makeGuard(def, tile.def.id, i)
        this.units.push(u)
        camp.guards.push(u.id)
      }
    }
  }

  private makeGuard(def: NeutralDef, tileId: number, index: number): Unit {
    const d = this.board.defs[tileId]!
    const a = (index / Math.max(1, def.guards)) * Math.PI * 2
    return {
      id: this.nextId++,
      faction: NEUTRAL,
      // 중립도 유닛 틀을 그대로 쓴다. 생김새만 다르고 규칙은 같다.
      kind: 'axe',
      pos: { x: d.x + Math.cos(a) * 5, z: d.z + Math.sin(a) * 5 },
      hp: def.guardHp,
      maxHp: def.guardHp,
      tile: tileId,
      path: [],
      destTile: -1,
      commanded: false,
      thinkIn: 0,
      anchorTile: tileId,
      facing: a,
    }
  }

  spawnUnit(side: Side, kind: UnitKind, tileId: number): Unit {
    const d = this.board.defs[tileId]!
    const a = this.rng.range(0, Math.PI * 2)
    const r = this.rng.range(2, 8)
    const u: Unit = {
      id: this.nextId++,
      faction: side,
      kind,
      pos: this.board.clampToLand(tileId, {
        x: d.x + Math.cos(a) * r,
        z: d.z + Math.sin(a) * r,
      }),
      hp: UNITS[kind].hp,
      maxHp: UNITS[kind].hp,
      tile: tileId,
      path: [],
      destTile: -1,
      commanded: false,
      thinkIn: 0,
      anchorTile: -1,
      facing: side === 0 ? 0 : Math.PI,
    }
    this.units.push(u)
    return u
  }

  // ────────────────────────────────────────────────────────────── 명령

  /**
   * 부대 집결 지점 (GDD 3.1).
   *
   * **반경 안 유닛은 이 점을 정확히 향하고, 밖 유닛은 칸까지만 안다.** 하나의
   * 명령이 두 종류로 갈리는 것이 지휘 반경 규칙의 전부다 — 별도의 "세밀 명령"
   * UI를 만들지 않은 것은 그래야 규칙이 설명 없이 드러나기 때문이다.
   */
  setRally(side: Side, point: Vec2): void {
    const p = this.players[side]
    const tile = this.board.tileAt(point)
    p.rallyTile = tile
    p.rally = this.board.clampToLand(tile, point)
    for (const u of this.units) {
      if (u.faction !== side) continue
      // 반경 안 유닛만 즉시 반응한다. 밖은 다음 자율 판단 때 알게 된다.
      u.thinkIn = u.commanded ? 0 : Math.min(u.thinkIn, AUTONOMY_THINK * 0.5)
      if (u.commanded) this.repath(u, tile, p.rally)
    }
  }

  /** 부감에서 내리는 아바타 이동 명령. 느리다(GDD 3.2). */
  commandAvatar(side: Side, point: Vec2): void {
    const a = this.players[side].avatar
    if (a.driving) return
    const tile = this.board.tileAt(point)
    a.moveTarget = this.board.clampToLand(tile, point)
  }

  /** 강림·복귀 (GDD 3.2). */
  setDriving(side: Side, on: boolean): void {
    const a = this.players[side].avatar
    if (a.driving === on) return
    a.driving = on
    if (on) {
      a.moveTarget = null
      if (side === this.humanSide) {
        this.telemetry.descents++
        this.telemetry.lastDescentAt = this.telemetry.elapsed
      }
    }
  }

  /** 1인칭에서 직접 모는 한 스텝. dir는 정규화된 진행 방향. */
  driveAvatar(side: Side, dir: Vec2, dt: number): void {
    const a = this.players[side].avatar
    if (!a.driving) return
    const step = TUNING.avatarSpeedDriven * dt
    const next = { x: a.pos.x + dir.x * step, z: a.pos.z + dir.z * step }
    // 물에는 못 들어간다. 축을 하나씩 시험해 벽을 따라 미끄러지게 한다.
    if (this.board.isWalkable(next)) {
      a.pos = next
      return
    }
    const slideX = { x: next.x, z: a.pos.z }
    if (this.board.isWalkable(slideX)) {
      a.pos = slideX
      return
    }
    const slideZ = { x: a.pos.x, z: next.z }
    if (this.board.isWalkable(slideZ)) a.pos = slideZ
  }

  enqueue(side: Side, kind: UnitKind): boolean {
    const p = this.players[side]
    const def = UNITS[kind]
    if (p.queue.length >= TUNING.maxQueue) return false
    if (this.countUnits(side) + p.queue.length >= TUNING.maxUnits) return false
    if (p.silver < def.cost) return false
    p.silver -= def.cost
    p.queue.push({ kind, remain: def.buildSeconds })
    return true
  }

  countUnits(side: Side): number {
    let n = 0
    for (const u of this.units) if (u.faction === side) n++
    return n
  }

  // ────────────────────────────────────────────────────────────── 진행

  update(dt: number): void {
    if (this.phase === 'over') {
      this.endTimer += dt
      return
    }
    this.telemetry.elapsed += dt
    for (const p of this.players) {
      if (p.avatar.driving && p.side === this.humanSide) {
        this.telemetry.timeInFirstPerson += dt
      }
    }

    this.updateAvatars(dt)
    this.markCommanded()
    this.updateUnits(dt)
    this.resolveOverlap()
    this.updateCamps()
    this.updateTiles(dt)
    this.updateEconomy(dt)
    this.refreshVisibility()
    this.checkEnd()
    this.trimLog()
  }

  private updateAvatars(dt: number): void {
    for (const p of this.players) {
      const a = p.avatar
      if (a.driving) continue
      if (!a.moveTarget) continue
      // 부감 명령은 다리를 거쳐 느리게 간다. 직접 모는 것보다 느린 이 차이가
      // 강림의 유일한 유인이다(GDD 3.2, tuning.ts).
      const from = this.board.tileAt(a.pos)
      const to = this.board.tileAt(a.moveTarget)
      const route = this.board.route(from, to, a.moveTarget)
      const next = route[0]!
      const step = TUNING.avatarSpeedCommanded * dt
      const moved = moveToward(a.pos, next, step)
      const d = { x: moved.x - a.pos.x, z: moved.z - a.pos.z }
      if (Math.hypot(d.x, d.z) > 1e-4) a.yaw = Math.atan2(d.x, d.z)
      a.pos = moved
      if (dist(a.pos, a.moveTarget) < 0.4) a.moveTarget = null
    }
  }

  /**
   * 지휘 반경 판정 (GDD 3.1).
   *
   * 매 틱 다시 계산한다. 아바타가 움직이면 지휘받는 부대도 즉시 바뀐다 —
   * "반경을 옮긴다"가 곧 "전력을 옮긴다"가 되는 것은 이 한 줄 때문이다.
   */
  private markCommanded(): void {
    const r2 = TUNING.commandRadius * TUNING.commandRadius
    for (const u of this.units) {
      if (u.faction === NEUTRAL) {
        u.commanded = false
        continue
      }
      const a = this.players[u.faction].avatar
      u.commanded = dist2(u.pos, a.pos) <= r2
    }
  }

  private updateUnits(dt: number): void {
    for (const u of this.units) {
      if (u.hp <= 0) continue
      u.tile = this.board.tileAt(u.pos)

      const target = this.pickTarget(u)
      if (target) {
        this.engage(u, target, dt)
        continue
      }

      if (u.faction !== NEUTRAL) {
        // 적 유닛이 없으면 성을 친다. 승리 조건은 본진 파괴다(GDD 4.4).
        const enemy = (1 - u.faction) as Side
        const ep = this.players[enemy]
        if (u.tile === ep.keepTile && ep.keepHp > 0) {
          ep.keepHp -= this.damageFrom(u) * dt
          if (ep.keepHp < 0) ep.keepHp = 0
          continue
        }
        this.autonomy(u, dt)
      }
      this.advance(u, dt)
    }
    // 죽은 것 치우기.
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i]!.hp <= 0) this.units.splice(i, 1)
    }
  }

  /** 사거리 안이나 근처의 적. 중립 수비대는 자기 칸을 벗어난 상대를 쫓지 않는다. */
  private pickTarget(u: Unit): Unit | null {
    let best: Unit | null = null
    let bestD = Infinity
    for (const o of this.units) {
      if (o.hp <= 0 || o.faction === u.faction) continue
      if (u.faction === NEUTRAL && o.tile !== u.anchorTile) continue
      if (o.faction === NEUTRAL && o.tile !== o.anchorTile) continue
      const d = dist(u.pos, o.pos)
      if (d > AGGRO) continue
      if (d < bestD) {
        bestD = d
        best = o
      }
    }
    return best
  }

  private engage(u: Unit, target: Unit, dt: number): void {
    const def = UNITS[u.kind]
    const d = dist(u.pos, target.pos)
    const reach =
      def.range + (def.radius + UNITS[target.kind].radius) * BODY_SPACING
    u.facing = Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z)
    if (d > reach) {
      const speed = def.speed * (u.commanded ? COMMANDED_BONUS.speed : 1)
      const next = moveToward(u.pos, target.pos, speed * dt)
      // 쫓아갈 때는 자기 칸을 벗어나지 않는다. 다리를 건너 흩어지면
      // 지휘 반경이 의미를 잃는다.
      u.pos = this.board.clampToLand(u.tile, next)
      return
    }
    const dmg = this.damageFrom(u) * this.damageMultiplierOn(target) * dt
    target.hp -= dmg
    if (target.faction === NEUTRAL && u.faction !== NEUTRAL) {
      const camp = this.board.at(target.anchorTile).neutral
      if (camp) camp.lastDamager = u.faction
    }
  }

  /** 도끼병은 반경 안에서 더 때린다(GDD 6.2 방패벽 보너스). */
  private damageFrom(u: Unit): number {
    const def: UnitDef = UNITS[u.kind]
    let dps = def.dps
    if (u.faction === NEUTRAL) {
      const camp = this.board.at(u.anchorTile).neutral
      if (camp) dps = FJORD_NEUTRALS[camp.kind].guardDps
    } else if (u.commanded && u.kind === 'axe') {
      dps *= COMMANDED_BONUS.axeAttack
    }
    return dps
  }

  /** 방패병은 반경 안에서 덜 맞는다. */
  private damageMultiplierOn(target: Unit): number {
    if (target.faction === NEUTRAL) return 1
    let m = UNITS[target.kind].damageTaken
    if (target.commanded && target.kind === 'shield') m /= COMMANDED_BONUS.shieldDefense
    return m
  }

  /**
   * 반경 밖 유닛의 자율 행동 (GDD 3.1).
   *
   * 집결 지점의 **칸까지만** 안다. 그리고 즉시 반응하지 않는다 —
   * `AUTONOMY_THINK` 주기로만 생각을 고친다. 이 굼뜸이 "지휘받지 못한 부대"의
   * 실제 감각이고, 아바타를 그쪽으로 보낼 이유가 된다.
   */
  private autonomy(u: Unit, dt: number): void {
    if (u.commanded) return
    u.thinkIn -= dt
    if (u.thinkIn > 0) return
    u.thinkIn = AUTONOMY_THINK

    const p = this.players[u.faction as Side]
    if (u.tile === p.rallyTile) {
      u.path = []
      u.destTile = -1
      return
    }
    this.repath(u, p.rallyTile)
  }

  private repath(u: Unit, destTile: number, finalPoint?: Vec2): void {
    if (u.tile === destTile && !finalPoint) {
      u.path = []
      u.destTile = -1
      return
    }
    u.destTile = destTile
    u.path = this.board.route(u.tile, destTile, finalPoint)
  }

  private advance(u: Unit, dt: number): void {
    const next = u.path[0]
    if (!next) return
    const def = UNITS[u.kind]
    const speed = def.speed * (u.commanded ? COMMANDED_BONUS.speed : 1)
    const moved = moveToward(u.pos, next, speed * dt)
    const d = { x: moved.x - u.pos.x, z: moved.z - u.pos.z }
    if (Math.hypot(d.x, d.z) > 1e-4) u.facing = Math.atan2(d.x, d.z)
    u.pos = moved
    if (dist(u.pos, next) < 0.5) u.path.shift()
  }

  /** 겹침 밀어내기. 대열이 한 점에 뭉치면 방패벽이 안 보인다. */
  private resolveOverlap(): void {
    const n = this.units.length
    for (let i = 0; i < n; i++) {
      const a = this.units[i]!
      if (a.hp <= 0) continue
      for (let j = i + 1; j < n; j++) {
        const b = this.units[j]!
        if (b.hp <= 0) continue
        const min = (UNITS[a.kind].radius + UNITS[b.kind].radius) * BODY_SPACING
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const push = (min - d) / 2
        const ux = dx / d
        const uz = dz / d
        a.pos = { x: a.pos.x - ux * push, z: a.pos.z - uz * push }
        b.pos = { x: b.pos.x + ux * push, z: b.pos.z + uz * push }
      }
    }
  }

  /** 캠프가 뚫렸는지 보고 보상을 준다 (GDD 4.3). */
  private updateCamps(): void {
    const alive = new Set(this.units.filter((u) => u.hp > 0).map((u) => u.id))
    for (const tile of this.board.tiles) {
      const camp = tile.neutral
      if (!camp || camp.cleared) continue
      camp.guards = camp.guards.filter((id) => alive.has(id))
      if (camp.guards.length > 0) continue

      camp.cleared = true
      const def = FJORD_NEUTRALS[camp.kind]
      const winner = camp.lastDamager
      if (winner === NOBODY) continue

      if (def.rewardSilver) {
        this.players[winner].silver += def.rewardSilver
        this.note(`${def.name} — 은 ${def.rewardSilver}`, winner)
      }
      if (def.rewardUnits) {
        for (const kind of def.rewardUnits) this.spawnUnit(winner, kind, tile.def.id)
        this.note(`${def.name}이 합류했다`, winner)
      }
      if (def.grantsOutpost) {
        this.note(`${def.name} — 점령하면 전초가 된다`, winner)
      }
    }
  }

  private updateTiles(dt: number): void {
    // 칸마다 양측 유닛 수를 세고 점령을 굴린다.
    const presence: [number, number][] = this.board.defs.map(() => [0, 0])
    for (const u of this.units) {
      if (u.hp <= 0 || u.faction === NEUTRAL) continue
      presence[u.tile]![u.faction]++
    }
    // 아바타도 그 자리에 있다. 무적이지만 땅을 밟고 서 있는 것은 사실이다.
    for (const p of this.players) {
      presence[this.board.tileAt(p.avatar.pos)]![p.side]++
    }
    for (const d of this.board.defs) {
      this.board.updateCapture(d.id, presence[d.id]!, dt)
    }
  }

  private updateEconomy(dt: number): void {
    for (const p of this.players) {
      const tiles = this.board.ownedBy(p.side)
      p.silver += (TUNING.silverBasePerSecond + tiles * TUNING.silverPerTilePerSecond) * dt

      const head = p.queue[0]
      if (!head) continue
      head.remain -= dt
      if (head.remain > 0) continue
      p.queue.shift()
      this.spawnUnit(p.side, head.kind, p.keepTile)
    }
  }

  private refreshVisibility(): void {
    for (const side of [0, 1] as Side[]) {
      const sources: { pos: Vec2; radius: number }[] = []
      const p = this.players[side]
      const keep = this.board.defs[p.keepTile]!
      sources.push({ pos: { x: keep.x, z: keep.z }, radius: TUNING.visionKeep })
      sources.push({ pos: p.avatar.pos, radius: TUNING.visionAvatar })
      for (const u of this.units) {
        if (u.faction !== side || u.hp <= 0) continue
        sources.push({ pos: u.pos, radius: TUNING.visionUnit })
      }
      for (const t of this.board.tiles) {
        if (t.outpost && t.owner === side) {
          sources.push({ pos: { x: t.def.x, z: t.def.z }, radius: TUNING.visionOutpost })
        }
      }
      this.visible[side] = this.board.computeVisible(sources, side)
    }
  }

  private checkEnd(): void {
    for (const p of this.players) {
      if (p.keepHp > 0) continue
      this.phase = 'over'
      this.end = { winner: (1 - p.side) as Side, reason: 'keep' }
      this.endTimer = 0
      return
    }
  }

  private note(text: string, side: Side): void {
    if (side !== this.humanSide) return
    this.log.push({ text, at: this.telemetry.elapsed })
  }

  private trimLog(): void {
    while (this.log.length > 0 && this.telemetry.elapsed - this.log[0]!.at > 5) {
      this.log.shift()
    }
  }

  // ────────────────────────────────────────────────────────────── 읽기용

  /** 이 진영이 지금 저 유닛을 볼 수 있는가. 안개 밖의 적은 그리지 않는다. */
  canSee(side: Side, u: Unit): boolean {
    return this.visible[side].has(u.tile)
  }

  /** 반경 안에 있는 아군 수. HUD가 이 숫자를 띄운다 —
   *  규칙을 설명하지 않고 숫자로 보여주는 것이 GDD 6.2의 방침이다. */
  commandedCount(side: Side): number {
    let n = 0
    for (const u of this.units) if (u.faction === side && u.commanded && u.hp > 0) n++
    return n
  }

  centerTile(): number {
    return CENTER
  }

  /** 아바타가 서 있는 칸 안에서의 상대 위치(0~1). 미니맵용. */
  normalized(p: Vec2): Vec2 {
    const half = (this.board.defs.length ** 0.5 * TILE_LAND) / 2
    return { x: clamp(p.x / half, -1, 1), z: clamp(p.z / half, -1, 1) }
  }

  /** 정규화된 방향 벡터를 만든다. 입력 처리에서 쓴다. */
  static dir(x: number, z: number): Vec2 {
    return norm({ x, z })
  }
}
