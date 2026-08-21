import { dist, type Vec2 } from '../core/vec2'
import { TUNING } from '../data/tuning'
import type { UnitKind } from '../data/units'
import type { Game } from './Game'
import { NOBODY, type Side } from './types'

/** 생각을 고치는 주기. 매 틱 다시 재면 부대가 갈팡질팡한다. */
const THINK = 1.1

/** 캠프를 뚫으러 갈 최소 병력. 이보다 적으면 수비대에게 녹는다. */
const CAMP_MIN_ARMY = 3

/** 다음 경유지에 이만큼 가까워지면 도달로 친다. */
const WAYPOINT_REACH = 1.6

/**
 * 컴퓨터 상대 (GDD 6.3).
 *
 * **아바타를 사람과 똑같이 쓴다** — 급하면 강림해서 직접 몰고, 자리를 잡으면
 * 올라온다. 이건 난이도 문제가 아니라 실험 설계의 문제다. AI가 지휘 반경을
 * 쓸 줄 모르면 사람은 그 규칙을 몰라도 이기고, 그러면 "규칙 모르는 사람 3명이
 * 스스로 강림하는가"라는 판정(GDD 6.5)이 무의미해진다.
 *
 * 판단은 우선순위 목록 하나로 끝난다. 트리를 키우지 않은 것은 v1이 알아내려는
 * 것이 AI의 영리함이 아니기 때문이다 — 이 AI의 할 일은 **사람이 지휘 반경을
 * 쓰지 않으면 지도록 만드는 것**까지다.
 */
export class Ai {
  private thinkIn = 0
  private route: Vec2[] = []
  private targetTile = -1

  constructor(
    private readonly game: Game,
    private readonly side: Side,
  ) {}

  update(dt: number): void {
    const g = this.game
    if (g.phase !== 'playing') return

    this.thinkIn -= dt
    if (this.thinkIn <= 0) {
      this.thinkIn = THINK
      this.produce()
      this.decide()
    }
    this.moveAvatar(dt)
  }

  // ─────────────────────────────────────────────────────────── 생산

  private produce(): void {
    const g = this.game
    const p = g.players[this.side]
    if (p.queue.length >= 2) return

    // 방패병이 절반은 되게 유지한다. 도끼병만 뽑으면 반경 밖에서 순식간에 녹고,
    // 그러면 지휘 반경이 있으나 없으나 같은 게임이 되어 버린다.
    let shields = 0
    let axes = 0
    for (const u of g.units) {
      if (u.faction !== this.side) continue
      if (u.kind === 'shield') shields++
      else axes++
    }
    const want: UnitKind = shields <= axes ? 'shield' : 'axe'
    if (!g.enqueue(this.side, want)) g.enqueue(this.side, want === 'shield' ? 'axe' : 'shield')
  }

  // ─────────────────────────────────────────────────────────── 판단

  private decide(): void {
    const target = this.chooseTarget()
    if (target < 0) return
    const g = this.game
    const d = g.board.defs[target]!
    g.setRally(this.side, { x: d.x, z: d.z })

    if (target !== this.targetTile) {
      this.targetTile = target
      const from = g.board.tileAt(g.players[this.side].avatar.pos)
      this.route = g.board.route(from, target)
    }
  }

  /**
   * 우선순위 목록. 위에서부터 걸리는 첫 항목이 목표가 된다.
   *
   * 1. 내 땅이 밟히고 있으면 막는다 — 뺏기는 것이 먹는 것보다 아프다
   * 2. 병력이 충분하면 가장 가까운 캠프를 뚫는다
   * 3. 빈 땅이 남아 있으면 먹는다
   * 4. 아니면 상대 본진으로 민다
   */
  private chooseTarget(): number {
    const g = this.game
    const me = this.side
    const foe = (1 - me) as Side
    const keep = g.players[me].keepTile

    const enemyOn = new Set<number>()
    for (const u of g.units) {
      if (u.hp <= 0 || u.faction !== foe) continue
      enemyOn.add(u.tile)
    }

    // 1. 방어 — 내 땅이나 본진이 밟혔다
    let threat = -1
    let threatD = Infinity
    for (const t of g.board.tiles) {
      if (t.owner !== me || !enemyOn.has(t.def.id)) continue
      const d = g.board.tilePath(keep, t.def.id).length
      if (d < threatD) {
        threatD = d
        threat = t.def.id
      }
    }
    if (threat >= 0) return threat

    const army = g.countUnits(me)

    // 2. 캠프 — 은과 병력이 여기서 나온다
    if (army >= CAMP_MIN_ARMY) {
      let camp = -1
      let campD = Infinity
      for (const t of g.board.tiles) {
        const c = t.neutral
        if (!c || c.cleared) continue
        // 상대 진영 깊숙한 캠프는 손대지 않는다. 거울상이라 내 쪽에도 같은 것이 있다.
        const dMe = g.board.tilePath(keep, t.def.id).length
        const dFoe = g.board.tilePath(g.players[foe].keepTile, t.def.id).length
        if (dFoe < dMe) continue
        if (dMe < campD) {
          campD = dMe
          camp = t.def.id
        }
      }
      if (camp >= 0) return camp
    }

    // 3. 빈 땅
    let open = -1
    let openD = Infinity
    for (const t of g.board.tiles) {
      if (t.owner === me) continue
      if (t.neutral && !t.neutral.cleared) continue
      if (t.def.id === g.players[foe].keepTile) continue
      const d = g.board.tilePath(keep, t.def.id).length
      if (d < openD) {
        openD = d
        open = t.def.id
      }
    }
    if (open >= 0 && army >= 2) return open

    // 4. 본진으로
    return g.players[foe].keepTile
  }

  // ─────────────────────────────────────────────────────────── 아바타

  /**
   * 아바타를 목표 칸으로 옮긴다.
   *
   * 멀면 **강림해서 직접 몰고**(빠름), 다 왔으면 올라온다. 사람이 하는 판단과
   * 같은 판단을 같은 규칙으로 하는 것이라, AI를 이기려면 사람도 같은 것을
   * 해야 한다.
   */
  private moveAvatar(dt: number): void {
    const g = this.game
    const a = g.players[this.side].avatar
    if (this.targetTile < 0) return

    const goal = g.board.defs[this.targetTile]!
    const goalPoint = { x: goal.x, z: goal.z }

    // 다 왔으면 올라와서 자리를 지킨다.
    if (dist(a.pos, goalPoint) < TUNING.commandRadius * 0.45) {
      g.setDriving(this.side, false)
      a.moveTarget = null
      this.route = []
      return
    }

    if (this.route.length === 0) {
      this.route = g.board.route(g.board.tileAt(a.pos), this.targetTile)
    }
    const next = this.route[0]
    if (!next) return

    g.setDriving(this.side, true)
    const dx = next.x - a.pos.x
    const dz = next.z - a.pos.z
    const l = Math.hypot(dx, dz)
    if (l < WAYPOINT_REACH) {
      this.route.shift()
      return
    }
    a.yaw = Math.atan2(dx, dz)
    g.driveAvatar(this.side, { x: dx / l, z: dz / l }, dt)
  }

  /** 디버그용 — 지금 무엇을 하려는지. HUD에 띄우면 AI가 멍청한 이유가 보인다. */
  get intent(): string {
    if (this.targetTile < 0) return '—'
    const t = this.game.board.at(this.targetTile)
    if (t.neutral && !t.neutral.cleared) return '중립 정리'
    if (t.owner === NOBODY) return '빈 땅 점령'
    if (t.owner === this.side) return '방어'
    return t.def.id === this.game.players[(1 - this.side) as Side].keepTile ? '본진 공격' : '진격'
  }
}
