import { atan2, cos, hypot, sin } from '../core/det'
import { Rng } from '../core/rng'
import { clamp, dist, dist2, moveToward, norm, type Vec2 } from '../core/vec2'
import { CENTER, KEEP_P0, KEEP_P1, MAP_H, MAP_W } from '../data/land'
import { FJORD_NEUTRALS, type NeutralDef } from '../data/neutrals'
import { COMMANDED_BONUS, TILE, TUNING } from '../data/tuning'
import { UNITS, type UnitDef, type UnitKind } from '../data/units'
import { Board } from './Board'
import {
  NEUTRAL,
  NOBODY,
  type Building,
  type Corpse,
  type EndState,
  type Hit,
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

/** 타격 자국·시신이 사라지는 데 걸리는 초. */
const HIT_FADE = 0.28
const CORPSE_FADE = 2.4

/** 내지르는 연출과 번쩍임이 가라앉는 데 걸리는 초. */
const LUNGE_FADE = 0.22
const FLASH_FADE = 0.2

/** 집중 공격이 통하는 거리. 이보다 멀면 지목해도 못 알아듣는다. */
const FOCUS_RANGE = 16

/** 일꾼이 갈 곳을 다시 고르는 주기. 병사보다 자주 본다 — 도망쳐야 하기 때문이다. */
const WORKER_THINK = 0.8

/** 전진 기지 (GDD 4.3 확장). */
export const FORGE = {
  cost: 90,
  raiseSeconds: 8,
  /**
   * 체력.
   *
   * 처음엔 340이었는데 돌려보니 **13초 만에 무너졌다.** 은 90을 들이고 8초를
   * 기다린 것이 그렇게 죽으면 아무도 안 짓는다. 전선에 있는 것이라 언젠가는
   * 죽어야 맞지만, 죽이려면 **부대를 붙여 두고 시간을 써야** 하는 정도여야
   * 한다. 지금은 셋이 붙어 20초쯤 걸린다.
   */
  hp: 850,
  /** 초당 은 수입. 본진 기본 수입의 절반쯤. */
  silverPerSecond: 1.3,
  /**
   * 세우면 그 둘레가 보인다.
   *
   * 예전에는 `34 * 0.9`라고 적혀 있었다. 34는 사라진 옛 칸 크기였고, 지역이
   * 60으로 커진 뒤로는 자기가 선 지역조차 다 안 보이는 눈이 됐다. 지역
   * 크기에 묶어 둔다.
   */
  vision: TILE * 0.9,
} as const

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

  /** 플레이어가 세운 전진 기지. 본진은 여기 없다(PlayerState가 들고 있다). */
  readonly buildings: Building[] = []

  /** 판정에 관여하지 않는 흔적들 — 타격 자국과 시신. */
  readonly hits: Hit[] = []
  readonly corpses: Corpse[] = []

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
    // 지역 **중심**이 아니라 대표점을 쓴다. 중심은 물일 수 있다(`Board.anchor`).
    const home = this.board.anchor(keepTile)
    return {
      side,
      silver: TUNING.startingSilver,
      queue: [],
      rally: { ...home },
      rallyTile: keepTile,
      keepHp: TUNING.keepHp,
      keepTile,
      focusId: -1,
      avatar: {
        side,
        // 판이 시작될 때 신은 **판 위에 없다.** 이 자리는 아직 쓰이지 않는
        // 기본값이고, 첫 강림 때 사람이 찍는 곳으로 덮인다. 그래도 롱하우스
        // 밖으로 잡아 두는 이유는, 어떤 경로로든 여기서 몸이 생기면 첫 화면이
        // 벽이 되어서는 안 되기 때문이다.
        pos: this.board.clampToLand({
          x: home.x + (side === 0 ? 10 : -10),
          z: home.z + 6,
        }),
        yaw: side === 0 ? 0 : Math.PI,
        embodied: false,
        descendIn: 0,
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
    const d = this.board.anchor(tileId)
    const a = (index / Math.max(1, def.guards)) * Math.PI * 2
    return {
      id: this.nextId++,
      faction: NEUTRAL,
      // 중립도 유닛 틀을 그대로 쓴다. 생김새만 다르고 규칙은 같다.
      kind: 'axe',
      pos: this.board.clampToLand({ x: d.x + cos(a) * 9, z: d.z + sin(a) * 9 }),
      hp: def.guardHp,
      maxHp: def.guardHp,
      tile: tileId,
      path: [],
      destTile: -1,
      commanded: false,
      ordered: false,
      thinkIn: 0,
      anchorTile: tileId,
      facing: a,
      swingIn: 0,
      lunge: 0,
      flash: 0,
      guard: 0,
      fighting: false,
      focusId: -1,
    }
  }

  spawnUnit(side: Side, kind: UnitKind, tileId: number): Unit {
    const d = this.board.anchor(tileId)
    const a = this.rng.range(0, Math.PI * 2)
    const r = this.rng.range(3, 13)
    const u: Unit = {
      id: this.nextId++,
      faction: side,
      kind,
      pos: this.board.clampToLand({ x: d.x + cos(a) * r, z: d.z + sin(a) * r }),
      hp: UNITS[kind].hp,
      maxHp: UNITS[kind].hp,
      tile: tileId,
      path: [],
      destTile: -1,
      commanded: false,
      ordered: false,
      thinkIn: 0,
      anchorTile: -1,
      facing: side === 0 ? 0 : Math.PI,
      swingIn: 0,
      lunge: 0,
      flash: 0,
      guard: 0,
      fighting: false,
      focusId: -1,
    }
    this.units.push(u)
    return u
  }

  // ────────────────────────────────────────────────────────────── 명령

  /**
   * 부대 집결 지점.
   *
   * **모두가 정확히 듣는다.** 예전에는 반경 안 유닛만 이 점을 정확히 향하고
   * 밖은 칸까지만 알았는데, 신이 부감에서 사라진 지금 그 규칙을 그대로 두면
   * 아무도 명령을 안 듣는 게임이 된다. 지휘 반경은 이제 **명령을 듣느냐**가
   * 아니라 **얼마나 세느냐**를 가른다(GDD 3.1).
   *
   * 사람은 이제 부대를 골라 `commandUnits`로 움직인다. 이 함수는 AI가 쓰고,
   * 사람 쪽에서는 "명령 안 받은 유닛이 어디로 모이는가"의 기본값으로 남는다.
   */
  setRally(side: Side, point: Vec2): void {
    const p = this.players[side]
    p.focusId = this.enemyNear(side, point, 5.5)
    const tile = this.board.tileAt(point)
    p.rallyTile = tile
    p.rally = this.board.clampToLand(point)
    for (const u of this.units) {
      if (u.faction !== side) continue
      // 일꾼은 집결 명령을 안 듣는다. 부대와 같이 전선으로 걸어가면
      // 그냥 죽으러 가는 것이고, 그러면 아무도 일꾼을 안 뽑는다.
      if (UNITS[u.kind].civilian) continue
      // **집결 지점이 명령을 푼다.** 우클릭으로 세워 둔 부대는 재명령 전까지
      // 안 움직이므로(`advance`), 다시 자율 판단으로 돌려보낼 길이 하나는
      // 있어야 한다. 집결 지점을 새로 찍는 것이 그 길이다 — 예전에는 여기서
      // 명령받은 유닛을 건너뛰었는데, 이제는 그러면 영영 못 푼다.
      u.ordered = false
      u.thinkIn = 0
      this.repath(u, tile, p.rally)
    }
  }

  /**
   * 고른 부대에게 내리는 이동·공격 명령 (우클릭).
   *
   * **선택은 시뮬레이션 밖에 있다.** 어떤 유닛이 선택되어 있는지는 화면의
   * 사정이고 판정에 관여하지 않는다 — 여기 들어오는 것은 이미 확정된 id
   * 목록뿐이라, 락스텝에서 두 클라이언트가 서로 다른 것을 골라 놓고도 같은
   * 판을 굴릴 수 있다(GDD 7.2).
   */
  commandUnits(side: Side, ids: number[], point: Vec2): void {
    const p = this.players[side]
    const target = this.board.clampToLand(point)
    const tile = this.board.tileAt(target)

    // 짚은 곳에 적이 있으면 집중 공격까지 함께 지정한다. 버튼을 늘리지
    // 않으면서 "저기로"와 "저놈에게"를 한 동작에 담는다.
    const foe = this.enemyNear(side, target, 6.5)
    if (foe >= 0) p.focusId = foe

    // 한 점에 전부 몰아넣으면 서로 밀어내느라 대열이 터진다. 인원수에 맞춰
    // 고리 모양으로 벌려 세운다 — 순서는 id 순이라 두 클라이언트가 같다.
    const mine = ids
      .map((id) => this.units.find((u) => u.id === id))
      .filter((u): u is Unit => !!u && u.faction === side && u.hp > 0)
    if (mine.length === 0) return

    for (let i = 0; i < mine.length; i++) {
      const u = mine[i]!
      const spot = mine.length === 1 ? target : this.spread(target, i, mine.length)
      u.ordered = true
      u.thinkIn = 0
      u.focusId = foe
      this.repath(u, tile, spot)
    }
  }

  /**
   * 여럿을 한 점에 보낼 때 벌려 세우는 자리.
   *
   * `det`의 sin·cos만 쓴다 — 명령은 판정이므로 두 클라이언트가 비트까지
   * 같은 자리를 내야 한다(GDD 7.2).
   */
  private spread(center: Vec2, index: number, _count: number): Vec2 {
    const ring = Math.floor(index / 6)
    const slot = index % 6
    const r = 3.2 + ring * 3.2
    const a = (slot / 6) * Math.PI * 2 + ring * 0.5
    return this.board.clampToLand({
      x: center.x + cos(a) * r,
      z: center.z + sin(a) * r,
    })
  }

  /**
   * 여기에 내려갈 수 있는가.
   *
   * **지금 보이는 땅에만** 내려간다. 안개 속에 찍을 수 있으면 강림이 공짜
   * 정찰이 되고, 그러면 "부감 시야를 잃는다"는 강림의 유일한 대가가 되레
   * 이득으로 뒤집힌다(GDD 3.3).
   */
  canDescend(side: Side, point: Vec2): boolean {
    const a = this.players[side].avatar
    if (a.embodied || a.descendIn > 0) return false
    if (!this.board.isWalkable(point)) return false
    return this.visible[side].has(this.board.tileAt(point))
  }

  /**
   * 강림 (GDD 3.2).
   *
   * 그 자리에 몸이 생기고, 그 자리에 지휘 반경이 켜진다. 걸어가는 것이 아니라
   * **내려꽂히는 것**이라, 이 게임에서 반경을 옮기는 유일한 방법이 강림이 된다.
   */
  descend(side: Side, point: Vec2): boolean {
    if (!this.canDescend(side, point)) return false
    const a = this.players[side].avatar
    a.pos = this.board.clampToLand(point)
    a.embodied = true
    a.descendIn = 0
    if (side === this.humanSide) {
      this.telemetry.descents++
      this.telemetry.lastDescentAt = this.telemetry.elapsed
    }
    this.note('강림한다', side)
    return true
  }

  /** 승천. 몸이 사라지고 반경도 같이 꺼진다. */
  ascend(side: Side): void {
    const a = this.players[side].avatar
    if (!a.embodied) return
    a.embodied = false
    a.descendIn = TUNING.descendCooldown
  }

  /** 1인칭에서 직접 모는 한 스텝. dir는 정규화된 진행 방향. */
  driveAvatar(side: Side, dir: Vec2, dt: number): void {
    const a = this.players[side].avatar
    if (!a.embodied) return
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

  /** 그 지점 근처에 서 있는, 내가 볼 수 있는 적 유닛. 없으면 -1. */
  enemyNear(side: Side, point: Vec2, radius: number): number {
    let best = -1
    let bestD = radius
    for (const u of this.units) {
      if (u.hp <= 0 || u.faction === side) continue
      if (!this.visible[side].has(u.tile)) continue
      const d = dist(u.pos, point)
      if (d < bestD) {
        bestD = d
        best = u.id
      }
    }
    return best
  }

  /**
   * 전진 기지를 세운다 (아바타가 선 자리에).
   *
   * **아바타가 그 칸에 있어야 한다.** 이것이 이 기능을 그냥 RTS 부품이 아니라
   * 이 게임의 규칙으로 만드는 조건이다 — 앞으로 나가서 박아야 앞에서 병력이
   * 나오고, 앞으로 나가려면 강림하는 편이 빠르다(GDD 3.2). 건설이 강림의
   * 이유를 하나 더 만든다.
   *
   * 실패하면 왜 안 되는지 알린다. 조용히 아무 일도 안 일어나는 것이
   * 규칙 모르는 사람에게 가장 나쁘다.
   */
  build(side: Side): boolean {
    const p = this.players[side]
    const tileId = this.board.tileAt(p.avatar.pos)
    const tile = this.board.at(tileId)

    // **몸이 있어야 짓는다.** 이 검사가 없으면 부감에서 3을 눌렀을 때 아바타가
    // 마지막으로 서 있던 자리(판 시작 시 본진)로 판정이 나서, 카메라가 어디에
    // 있든 "본진에는 못 짓는다"가 뜬다 — 거절 사유가 실제 이유와 달라서 규칙을
    // 못 배운다. 아바타가 거기 서 있어야 한다는 것이 이 건물의 규칙이다(GDD 4.4).
    if (!p.avatar.embodied) return this.deny(side, '강림해서 그 자리에 서야 짓는다')
    if (tileId === p.keepTile) return this.deny(side, '본진에는 못 짓는다')
    if (tile.owner !== side) return this.deny(side, '내 땅에서만 짓는다')
    if (this.buildings.some((b) => b.tile === tileId)) {
      return this.deny(side, '이 칸에는 이미 있다')
    }
    if (p.silver < FORGE.cost) return this.deny(side, `은이 ${FORGE.cost} 필요하다`)

    p.silver -= FORGE.cost
    this.buildings.push({
      id: this.nextId++,
      side,
      tile: tileId,
      pos: this.board.clampToLand({ ...p.avatar.pos }),
      hp: FORGE.hp,
      maxHp: FORGE.hp,
      raising: FORGE.raiseSeconds,
    })
    this.note('전진 기지를 올린다', side)
    return true
  }

  private deny(side: Side, why: string): false {
    this.note(why, side)
    return false
  }

  /** 완성된 내 기지들. 생산과 시야가 여기서 나온다. */
  forgesOf(side: Side): Building[] {
    return this.buildings.filter((b) => b.side === side && b.raising <= 0 && b.hp > 0)
  }

  enqueue(side: Side, kind: UnitKind): boolean {
    const p = this.players[side]
    const def = UNITS[kind]
    if (p.queue.length >= TUNING.maxQueue) return false
    if (def.civilian) {
      if (this.countWorkers(side) + this.queued(side, true) >= TUNING.maxWorkers) return false
    } else if (this.countUnits(side) + this.queued(side, false) >= TUNING.maxUnits) {
      return false
    }
    if (p.silver < def.cost) return false
    p.silver -= def.cost
    p.queue.push({ kind, remain: def.buildSeconds })
    return true
  }

  /**
   * **병력만** 센다. 일꾼은 여기 안 들어간다.
   *
   * 상한을 따로 두는 이유는 GDD 4.6에 있다 — 같은 칸을 두고 다투게 하면
   * "일꾼 하나에 병사 하나"라는 뻣뻣한 교환만 남고, 진짜 결정인 **언제 은을
   * 경제로 돌릴 것인가**가 사라진다.
   */
  countUnits(side: Side): number {
    let n = 0
    for (const u of this.units) {
      if (u.faction === side && !UNITS[u.kind].civilian) n++
    }
    return n
  }

  countWorkers(side: Side): number {
    let n = 0
    for (const u of this.units) {
      if (u.faction === side && UNITS[u.kind].civilian) n++
    }
    return n
  }

  /** 큐에 들어 있는 것 중 일꾼(또는 병사)의 수. */
  private queued(side: Side, civilian: boolean): number {
    let n = 0
    for (const it of this.players[side].queue) {
      if (!!UNITS[it.kind].civilian === civilian) n++
    }
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
      if (p.avatar.embodied && p.side === this.humanSide) {
        this.telemetry.timeInFirstPerson += dt
      }
    }

    this.tickAvatars(dt)
    this.markCommanded()
    this.updateUnits(dt)
    this.resolveOverlap()
    this.updateCamps()
    this.updateBuildings(dt)
    this.updateTiles(dt)
    this.updateEconomy(dt)
    this.updateEffects(dt)
    this.refreshVisibility()
    this.checkEnd()
    this.trimLog()
  }

  /**
   * 강림 대기시간만 흐른다.
   *
   * 예전에는 여기서 아바타가 부감 명령을 따라 걸었다. 그 걸음이 통째로
   * 사라진 것이 이번 변경의 핵심이다 — 신은 판 위를 걸어다니지 않고,
   * 내려와 있는 동안에만 1인칭으로 움직인다.
   */
  private tickAvatars(dt: number): void {
    for (const p of this.players) {
      if (p.avatar.descendIn > 0) {
        p.avatar.descendIn = Math.max(0, p.avatar.descendIn - dt)
      }
    }
  }

  /**
   * 지휘 반경 판정 (GDD 3.1).
   *
   * 매 틱 다시 계산한다. 신이 움직이면 보너스를 받는 부대도 즉시 바뀐다 —
   * "반경을 옮긴다"가 곧 "전력을 옮긴다"가 되는 것은 이 한 줄 때문이다.
   */
  private markCommanded(): void {
    const r2 = TUNING.commandRadius * TUNING.commandRadius
    for (const u of this.units) {
      // 일꾼은 지휘 반경 보너스를 안 받는다. 그런데 `commanded`를 켜 두면
      // 발밑에 금색 링이 도는데, 그 링은 화면에서 **"이 유닛이 지금 보너스를
      // 받고 있다"**는 뜻이다. 안 받는 유닛에 켜면 링이 거짓말을 한다.
      if (u.faction === NEUTRAL || UNITS[u.kind].civilian) {
        u.commanded = false
        continue
      }
      const a = this.players[u.faction].avatar
      // **몸이 없으면 반경도 없다.** 이 한 줄이 이번 설계 변경의 전부다 —
      // 부감은 평범한 지휘이고, 반경은 내려온 자리에만 켜진다.
      u.commanded = a.embodied && dist2(u.pos, a.pos) <= r2
    }
  }

  private updateUnits(dt: number): void {
    for (const u of this.units) {
      if (u.hp <= 0) continue
      u.tile = this.board.tileAt(u.pos)
      // 교전 깃발은 매 틱 지우고, 실제로 사거리 안에서 칠 때만 다시 켠다.
      u.fighting = false

      // 일꾼은 표적을 고르지 않는다. 싸우는 코드를 통째로 건너뛴다 —
      // `dps`를 0으로 두는 것만으로는 붙어 서서 맞아 죽는 그림이 된다.
      if (UNITS[u.kind].civilian) {
        this.workerThink(u, dt)
        this.advance(u, dt)
        continue
      }

      const target = this.pickTarget(u)
      if (target) {
        this.engage(u, target, dt)
        continue
      }

      if (u.faction !== NEUTRAL) {
        // 적 유닛이 없으면 건물을 친다. 전진 기지가 먼저, 그다음이 본진이다 —
        // 앞에 세운 기지는 방패이자 미끼가 된다.
        const enemy = (1 - u.faction) as Side
        const ep = this.players[enemy]
        const forge = this.buildings.find(
          (b) => b.side === enemy && b.tile === u.tile && b.hp > 0,
        )
        if (forge) {
          this.hitBuilding(u, forge, dt)
          continue
        }
        if (u.tile === ep.keepTile && ep.keepHp > 0) {
          if (this.swingAt(u, dt, { x: this.board.defs[ep.keepTile]!.x, z: this.board.defs[ep.keepTile]!.z })) {
            ep.keepHp = Math.max(0, ep.keepHp - this.damageFrom(u) * UNITS[u.kind].swing)
          }
          continue
        }
        this.autonomy(u, dt)
      }
      this.advance(u, dt)
    }

    // 죽은 것 치우기 — 시신을 남긴다. 조용히 사라지면 이겼는지 졌는지 모른다.
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i]!
      if (u.hp > 0) continue
      this.corpses.push({
        pos: { ...u.pos },
        facing: u.facing,
        kind: u.kind,
        faction: u.faction,
        life: 1,
      })
      for (const p of this.players) if (p.focusId === u.id) p.focusId = -1
      this.units.splice(i, 1)
    }
  }

  /**
   * 표적 고르기.
   *
   * **지휘받는 유닛은 내가 지목한 놈부터 친다**(GDD 3.1). 반경 밖 유닛은
   * 지목을 못 듣고 알아서 가까운 놈을 친다 — 이것이 "세밀 명령 대 대략적
   * 지시"의 전투판 표현이고, 반경을 옮길 이유를 하나 더 만든다.
   */
  private pickTarget(u: Unit): Unit | null {
    if (u.faction !== NEUTRAL && u.commanded) {
      const focus = this.players[u.faction].focusId
      if (focus >= 0) {
        const t = this.units.find((o) => o.id === focus && o.hp > 0)
        if (t && t.faction !== u.faction && dist(u.pos, t.pos) <= FOCUS_RANGE) return t
      }
    }

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

  /**
   * 교전. **끊어 친다.**
   *
   * 예전에는 사거리 안에 있는 동안 매 프레임 조금씩 깎았다. 초당 피해량은
   * 같지만 화면에서는 아무 일도 일어나지 않았고, 그래서 지휘 반경 보너스도
   * 눈에 안 보였다. 지금은 `swing` 간격마다 한 대씩 들어가고, 그때마다
   * 내지르고 · 번쩍이고 · 불꽃이 튄다.
   */
  private engage(u: Unit, target: Unit, dt: number): void {
    const def = UNITS[u.kind]
    const d = dist(u.pos, target.pos)
    const reach = def.range + (def.radius + UNITS[target.kind].radius) * BODY_SPACING
    u.facing = atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z)

    if (d > reach) {
      const speed = def.speed * (u.commanded ? COMMANDED_BONUS.speed : 1)
      const next = moveToward(u.pos, target.pos, speed * dt)
      // 쫓아갈 때도 물에는 안 들어간다. 해안에 비스듬히 부딪히면 미끄러진다.
      u.pos = this.board.slide(u.pos, next)
      return
    }

    u.fighting = true
    u.swingIn -= dt
    if (u.swingIn > 0) return

    const swing = u.faction === NEUTRAL ? 0.85 : def.swing
    u.swingIn = swing
    u.lunge = 1

    // 방패벽이 실제로 막아낸 순간인가 — 반경 안의 방패병만 해당한다.
    const guarded =
      target.faction !== NEUTRAL && target.commanded && target.kind === 'shield'
    const dmg = this.damageFrom(u) * this.damageMultiplierOn(target) * swing
    target.hp -= dmg
    target.flash = 1
    if (guarded) target.guard = 1

    // 타격 자국은 두 몸 사이에 남긴다.
    this.hits.push({
      pos: { x: (u.pos.x + target.pos.x) / 2, z: (u.pos.z + target.pos.z) / 2 },
      life: 1,
      big: u.faction !== NEUTRAL && u.commanded && u.kind === 'axe',
      guarded,
    })

    if (target.faction === NEUTRAL && u.faction !== NEUTRAL) {
      const camp = this.board.at(target.anchorTile).neutral
      if (camp) camp.lastDamager = u.faction
    }
  }

  /** 건물을 친다. 유닛을 칠 때와 같은 리듬으로 끊어 친다. */
  private hitBuilding(u: Unit, b: Building, dt: number): void {
    u.facing = atan2(b.pos.x - u.pos.x, b.pos.z - u.pos.z)
    if (!this.swingAt(u, dt, b.pos)) return
    b.hp -= this.damageFrom(u) * UNITS[u.kind].swing
    if (b.hp <= 0) {
      b.hp = 0
      this.note('전진 기지가 무너졌다', b.side)
    }
  }

  /**
   * 스윙 타이머를 굴리고, 이번 틱에 실제로 때렸는지 알려준다.
   *
   * 유닛과 건물이 같은 함수를 쓰는 이유는 리듬이 같아야 하기 때문이다 —
   * 성을 칠 때만 갑자기 매끄럽게 깎이면 그게 더 이상하다.
   */
  private swingAt(u: Unit, dt: number, at: Vec2): boolean {
    u.fighting = true
    u.swingIn -= dt
    if (u.swingIn > 0) return false
    u.swingIn = UNITS[u.kind].swing
    u.lunge = 1
    this.hits.push({ pos: { ...at }, life: 1, big: false, guarded: false })
    return true
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
   * 명령을 안 받은 유닛의 자율 행동.
   *
   * 집결 지점의 **칸까지만** 안다. 그리고 즉시 반응하지 않는다 —
   * `AUTONOMY_THINK` 주기로만 생각을 고친다. 손으로 고르지 않은 부대가
   * 얼어붙지 않게 하는 최소한의 장치다.
   */
  private autonomy(u: Unit, dt: number): void {
    // 직접 명령을 받은 유닛은 건드리지 않는다. 안 그러면 우클릭으로 보낸
    // 부대가 1.5초 뒤에 제멋대로 집결 지점으로 돌아선다.
    if (u.ordered) return
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

  /**
   * 일꾼의 판단 (GDD 4.6).
   *
   * **정원이 안 찬 내 땅 중 본진에서 가장 가까운 칸**으로 간다. 적이 밟고 있는
   * 칸은 후보에서 빠지므로, 전선이 밀리면 일꾼이 알아서 뒤로 물러난다 —
   * 부감에서 일꾼을 하나하나 옮기게 만들면 강림할 손이 없어진다(GDD 6.5).
   *
   * 뒤에서부터 채우는 것은 의도다. 앞 칸을 일구려면 **그 칸을 먼저 안전하게
   * 만들어야** 하고, 그것이 곧 지휘 반경을 앞으로 옮기는 일이다.
   */
  private workerThink(u: Unit, dt: number): void {
    u.thinkIn -= dt
    if (u.thinkIn > 0) return
    u.thinkIn = WORKER_THINK

    const side = u.faction as Side
    const want = this.workerTile(u, side)
    if (want < 0) {
      // 일굴 땅이 없다. 본진으로 물러나 기다린다.
      const keep = this.players[side].keepTile
      if (u.tile !== keep) this.repath(u, keep)
      return
    }
    if (u.tile === want) {
      u.path = []
      // 목적지는 남겨 둔다 — 칸별 정원을 셀 때 여기 서 있는 것도 한 자리다.
      u.destTile = want
      return
    }
    this.repath(u, want)
  }

  /** 이 일꾼이 갈 칸. 없으면 -1. 칸 id 순으로 훑으므로 동점은 낮은 id가 이긴다. */
  private workerTile(u: Unit, side: Side): number {
    const taken = new Array<number>(this.board.defs.length).fill(0)
    for (const o of this.units) {
      if (o.hp <= 0 || o.id === u.id) continue
      if (o.faction !== side || !UNITS[o.kind].civilian) continue
      // 가는 중인 일꾼도 그 칸의 한 자리를 이미 차지한 것으로 센다.
      // 안 그러면 여섯이 전부 같은 칸으로 몰린다.
      taken[o.destTile >= 0 ? o.destTile : o.tile]!++
    }

    const hostile = new Set<number>()
    for (const o of this.units) {
      if (o.hp <= 0 || o.faction === side) continue
      hostile.add(o.tile)
    }

    let best = -1
    let bestD = Infinity
    const keep = this.players[side].keepTile
    for (const t of this.board.tiles) {
      const id = t.def.id
      if (t.owner !== side) continue
      if (hostile.has(id)) continue
      if (taken[id]! >= TUNING.workersPerTile) continue
      const d = this.board.tilePath(keep, id).length
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }

  /** 지금 실제로 땅을 일구고 있는 일꾼 수. 칸마다 정원까지만 센다. */
  private workedCount(side: Side): number {
    const on = new Array<number>(this.board.defs.length).fill(0)
    for (const u of this.units) {
      if (u.hp <= 0 || u.faction !== side || !UNITS[u.kind].civilian) continue
      if (this.board.at(u.tile).owner !== side) continue
      on[u.tile]!++
    }
    let n = 0
    for (let i = 0; i < on.length; i++) {
      n += Math.min(on[i]!, TUNING.workersPerTile)
    }
    return n
  }

  private repath(u: Unit, destTile: number, finalPoint?: Vec2): void {
    if (u.tile === destTile && !finalPoint) {
      u.path = []
      u.destTile = -1
      return
    }
    u.destTile = destTile
    // 지역 중심이 물일 수 있으므로 대표점을 쓴다(`Board.anchor`).
    u.path = this.board.route(u.pos, finalPoint ?? this.board.anchor(destTile))
  }

  private advance(u: Unit, dt: number): void {
    const next = u.path[0]
    if (!next) return
    const def = UNITS[u.kind]
    const speed = def.speed * (u.commanded ? COMMANDED_BONUS.speed : 1)
    const moved = moveToward(u.pos, next, speed * dt)
    const d = { x: moved.x - u.pos.x, z: moved.z - u.pos.z }
    if (hypot(d.x, d.z) > 1e-4) u.facing = atan2(d.x, d.z)
    u.pos = moved
    if (dist(u.pos, next) < 0.5) {
      u.path.shift()
      /**
       * **도착해도 명령을 풀지 않는다.**
       *
       * 예전에는 여기서 `ordered`를 껐다. 그러면 자율 판단이 다시 깨어나고,
       * 자율 판단이 하는 일은 집결 지점으로 돌아가는 것 하나뿐이다 — 우클릭으로
       * 보낸 부대가 도착하자마자 걸어서 집으로 돌아왔다. **점령한 땅을 지킬
       * 수가 없었다.** 이 게임의 중심 규칙이 땅따먹기인데 그랬다.
       *
       * 이제 명령받은 부대는 재명령 전까지 그 자리를 지킨다. 풀어 주는 것은
       * 새 우클릭이거나 새 집결 지점이다(`setRally`).
       */
    }
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

  /** 짓는 중인 기지를 올리고, 무너진 것을 치운다. */
  private updateBuildings(dt: number): void {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!
      if (b.hp <= 0) {
        this.buildings.splice(i, 1)
        continue
      }
      if (b.raising > 0) {
        b.raising -= dt
        if (b.raising <= 0) {
          b.raising = 0
          this.note('전진 기지가 섰다 — 병력이 여기서 나온다', b.side)
        }
      }
      // 남의 땅이 된 기지는 스스로 무너진다. 뺏은 땅에 남의 기지가
      // 서 있는 것이 이상하기도 하고, 이러면 "땅을 되찾는다"가 곧
      // "저 기지를 없앤다"가 되어 목표가 하나로 합쳐진다.
      if (this.board.at(b.tile).owner === (1 - b.side)) {
        b.hp -= 45 * dt
      }
    }
  }

  /** 흔적을 삭힌다. 판정과 무관하므로 순서는 아무 데나 와도 된다. */
  private updateEffects(dt: number): void {
    for (const u of this.units) {
      if (u.lunge > 0) u.lunge = Math.max(0, u.lunge - dt / LUNGE_FADE)
      if (u.flash > 0) u.flash = Math.max(0, u.flash - dt / FLASH_FADE)
      if (u.guard > 0) u.guard = Math.max(0, u.guard - dt / FLASH_FADE)
    }
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]!
      h.life -= dt / HIT_FADE
      if (h.life <= 0) this.hits.splice(i, 1)
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]!
      c.life -= dt / CORPSE_FADE
      if (c.life <= 0) this.corpses.splice(i, 1)
    }
    // 죽은 놈을 계속 지목하고 있을 수는 없다.
    for (const p of this.players) {
      if (p.focusId >= 0 && !this.units.some((u) => u.id === p.focusId && u.hp > 0)) {
        p.focusId = -1
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
      const forges = this.forgesOf(p.side)
      // 일꾼은 **자기가 선 내 땅**의 수입을 올린다. 자원 노드가 없는 이유는
      // 이 게임의 경제가 애초에 땅이기 때문이다(GDD 4.6).
      p.silver +=
        (TUNING.silverBasePerSecond +
          tiles * TUNING.silverPerTilePerSecond +
          forges.length * FORGE.silverPerSecond +
          this.workedCount(p.side) * TUNING.silverPerWorker) *
        dt

      const head = p.queue[0]
      if (!head) continue
      head.remain -= dt
      if (head.remain > 0) continue
      p.queue.shift()
      this.spawnUnit(p.side, head.kind, this.spawnTile(p, forges))
    }
  }

  /**
   * 새 병력이 어디서 나오는가.
   *
   * **집결 지점에 가장 가까운 내 건물**에서 나온다. 이것이 전진 기지의
   * 값어치 전부다 — 본진에서 뽑으면 전선까지 혼자 걸어오는 동안 지휘를
   * 못 받고 야금야금 녹지만, 앞에 기지가 있으면 도착하자마자 반경 안이다.
   */
  private spawnTile(p: PlayerState, forges: Building[]): number {
    let best = p.keepTile
    let bestD = this.board.tilePath(p.keepTile, p.rallyTile).length
    for (const f of forges) {
      const d = this.board.tilePath(f.tile, p.rallyTile).length
      if (d < bestD) {
        bestD = d
        best = f.tile
      }
    }
    return best
  }

  private refreshVisibility(): void {
    for (const side of [0, 1] as Side[]) {
      const sources: { pos: Vec2; radius: number }[] = []
      const p = this.players[side]
      const keep = this.board.defs[p.keepTile]!
      sources.push({ pos: { x: keep.x, z: keep.z }, radius: TUNING.visionKeep })
      // 몸이 있을 때만 신의 눈이 열린다. 판 밖에서 지켜보는 동안 보이는
      // 것은 내 부대와 건물이 보는 것뿐이다.
      if (p.avatar.embodied) {
        sources.push({ pos: p.avatar.pos, radius: TUNING.visionAvatar })
      }
      for (const u of this.units) {
        if (u.faction !== side || u.hp <= 0) continue
        sources.push({ pos: u.pos, radius: TUNING.visionUnit })
      }
      for (const t of this.board.tiles) {
        if (t.outpost && t.owner === side) {
          sources.push({ pos: { x: t.def.x, z: t.def.z }, radius: TUNING.visionOutpost })
        }
      }
      for (const b of this.forgesOf(side)) {
        sources.push({ pos: b.pos, radius: FORGE.vision })
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

  note(text: string, side: Side): void {
    if (side !== this.humanSide) return
    this.log.push({ text, at: this.telemetry.elapsed })
  }

  private trimLog(): void {
    while (this.log.length > 0 && this.telemetry.elapsed - this.log[0]!.at > 5) {
      this.log.shift()
    }
  }

  // ────────────────────────────────────────────────────────────── 읽기용

  /** 일꾼인가. 화면 쪽에서 유닛 정의를 다시 들여다보지 않게 해 주는 창구다. */
  isCivilian(u: Unit): boolean {
    return !!UNITS[u.kind].civilian
  }

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

  /** 맵 안에서의 상대 위치(-1~1). 미니맵용. */
  normalized(p: Vec2): Vec2 {
    return {
      x: clamp(p.x / (MAP_W / 2), -1, 1),
      z: clamp(p.z / (MAP_H / 2), -1, 1),
    }
  }

  /** 정규화된 방향 벡터를 만든다. 입력 처리에서 쓴다. */
  static dir(x: number, z: number): Vec2 {
    return norm({ x, z })
  }
}
