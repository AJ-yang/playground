import { hypot } from '../core/det'
import { clamp, type Vec2 } from '../core/vec2'
import {
  bridgeBetween,
  COLS,
  makeTiles,
  mirrorOf,
  neighborsOf,
  placeNeutrals,
  ROWS,
  TILE_LAND,
  type TileDef,
} from '../data/fjord'
import { FJORD_NEUTRALS } from '../data/neutrals'
import { TUNING } from '../data/tuning'
import { NOBODY, type Owner, type Side, type Tile } from './types'

/** 다리 통로의 반폭. 유닛 지름보다 조금 넓어 두세 명이 겨우 지난다. */
const BRIDGE_HALF = 3.2

function pointNearSegment(
  p: Vec2,
  a: { x: number; z: number },
  b: { x: number; z: number },
  half: number,
): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const l2 = dx * dx + dz * dz
  if (l2 < 1e-6) return false
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2
  t = clamp(t, 0, 1)
  const cx = a.x + dx * t
  const cz = a.z + dz * t
  return hypot(p.x - cx, p.z - cz) <= half
}

/**
 * 판 위의 땅 — 칸·다리·점령·안개.
 *
 * 유닛과 전투는 `Game`이 맡고, 여기는 **땅만** 안다. 갈라둔 이유는 땅의 규칙이
 * 유닛의 규칙보다 훨씬 오래 살아남기 때문이다. 맵이 사막으로 바뀌어도 점령과
 * 안개는 그대로지만, 유닛과 중립은 통째로 갈린다.
 */
export class Board {
  readonly tiles: Tile[]
  readonly defs: TileDef[]
  /** 칸 id → 이웃 칸 id들. 매 틱 다시 계산할 이유가 없어 한 번만 만든다. */
  readonly adj: number[][]

  constructor(seed: number, keepP0: number, keepP1: number) {
    this.defs = makeTiles()
    this.adj = this.defs.map((d) => neighborsOf(d.col, d.row))

    const neutrals = placeNeutrals(seed)
    this.tiles = this.defs.map((def) => {
      const kind = neutrals.get(def.id) ?? null
      return {
        def,
        hold: def.id === keepP0 ? 1 : def.id === keepP1 ? -1 : 0,
        owner: def.id === keepP0 ? 0 : def.id === keepP1 ? 1 : NOBODY,
        neutral: kind
          ? { tile: def.id, kind, guards: [], cleared: false, lastDamager: NOBODY }
          : null,
        outpost: false,
        seen: [false, false],
      } satisfies Tile
    })
    this.buildBridges()
  }

  at(id: number): Tile {
    return this.tiles[id]!
  }

  /** 월드 좌표가 속한 칸. 물 위라면 가장 가까운 칸을 돌려준다 —
   *  다리 위에 서 있는 유닛도 어딘가에는 속해야 하기 때문이다. */
  tileAt(p: Vec2): number {
    let best = 0
    let bestD = Infinity
    for (const d of this.defs) {
      const dd = Math.max(Math.abs(p.x - d.x), Math.abs(p.z - d.z))
      if (dd < bestD) {
        bestD = dd
        best = d.id
      }
    }
    return best
  }

  /** 칸 안의 한 점을 땅 위로 밀어 넣는다. 물에 빠지지 않게 하는 유일한 장치다. */
  clampToLand(id: number, p: Vec2): Vec2 {
    const d = this.defs[id]!
    const h = TILE_LAND / 2
    return {
      x: clamp(p.x, d.x - h, d.x + h),
      z: clamp(p.z, d.z - h, d.z + h),
    }
  }

  /**
   * 다리 통로. 두 이웃 칸의 중심을 잇는 좁은 띠다.
   *
   * 경로 추종은 경유지만 따라가면 되지만, **1인칭으로 직접 몰 때는 아니다** —
   * 사람은 아무 방향으로나 걷기 때문에 "여기는 갈 수 있고 저기는 물이다"를
   * 판정할 것이 필요하다. 그 판정이 곧 좁은 통로를 몸으로 느끼게 만든다.
   */
  readonly bridges: { a: TileDef; b: TileDef }[] = []

  private buildBridges(): void {
    for (const d of this.defs) {
      for (const n of this.adj[d.id]!) {
        if (n < d.id) continue // 한 쌍을 한 번만
        this.bridges.push({ a: d, b: this.defs[n]! })
      }
    }
  }

  /** 걸을 수 있는 곳인가 — 땅이거나 다리 위. */
  isWalkable(p: Vec2): boolean {
    if (this.isOnLand(p)) return true
    for (const br of this.bridges) {
      if (pointNearSegment(p, br.a, br.b, BRIDGE_HALF)) return true
    }
    return false
  }

  isOnLand(p: Vec2): boolean {
    const id = this.tileAt(p)
    const d = this.defs[id]!
    const h = TILE_LAND / 2
    return Math.abs(p.x - d.x) <= h && Math.abs(p.z - d.z) <= h
  }

  /**
   * 칸에서 칸으로 가는 경유지.
   *
   * 이웃 칸으로 넘어갈 때는 반드시 **다리**를 지난다(GDD 6.2의 "좁은 통로").
   * 그래서 경로는 `다리 → 칸 중심 → 다리 → …`가 되고, 두 부대가 다른 칸에서
   * 같은 칸으로 들어오면 다리 앞에서 만나게 된다.
   */
  route(fromTile: number, toTile: number, finalPoint?: Vec2): Vec2[] {
    const path = this.tilePath(fromTile, toTile)
    const out: Vec2[] = []
    for (let i = 0; i + 1 < path.length; i++) {
      const a = this.defs[path[i]!]!
      const b = this.defs[path[i + 1]!]!
      out.push(bridgeBetween(a, b))
      // 마지막 칸의 중심은 아래에서 finalPoint로 대체될 수 있다.
      if (i + 2 < path.length) out.push({ x: b.x, z: b.z })
    }
    const last = this.defs[toTile]!
    out.push(finalPoint ? this.clampToLand(toTile, finalPoint) : { x: last.x, z: last.z })
    return out
  }

  /** 칸 단위 최단 경로 (BFS). 아홉 칸이라 이보다 영리할 필요가 없다. */
  tilePath(from: number, to: number): number[] {
    if (from === to) return [from]
    const prev = new Map<number, number>([[from, -1]])
    const queue = [from]
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]!
      if (cur === to) break
      for (const n of this.adj[cur]!) {
        if (prev.has(n)) continue
        prev.set(n, cur)
        queue.push(n)
      }
    }
    if (!prev.has(to)) return [from]
    const out: number[] = []
    for (let cur = to; cur !== -1; cur = prev.get(cur)!) out.push(cur)
    return out.reverse()
  }

  /**
   * 점령 진행 (GDD 4.3).
   *
   * 한쪽 유닛만 서 있을 때 차오르고, 양쪽이 겹치거나 중립 캠프가 살아 있으면
   * 멈춘다. **점령은 싸움이 끝난 뒤에 일어나는 일**이라는 뜻이다.
   *
   * 남의 땅을 빼앗는 속도는 빈 땅을 먹는 속도보다 느리다(`decaySeconds`).
   * 먹은 땅이 쉽게 뒤집히면 "영역"이라는 개념 자체가 생기지 않는다.
   */
  updateCapture(id: number, presence: [number, number], dt: number): void {
    const t = this.tiles[id]!
    if (t.neutral && !t.neutral.cleared) return

    const only: Owner =
      presence[0] > 0 && presence[1] === 0 ? 0 : presence[1] > 0 && presence[0] === 0 ? 1 : NOBODY
    if (only === NOBODY) return

    const toward = only === 0 ? 1 : -1
    // 지금 점유도가 상대 쪽으로 기울어 있으면 되찾는 것이므로 느리다.
    const contested = Math.sign(t.hold) === -toward && t.hold !== 0
    const rate = 1 / (contested ? TUNING.decaySeconds : TUNING.captureSeconds)
    t.hold = clamp(t.hold + toward * rate * dt, -1, 1)

    const owner: Owner = t.hold >= 0.999 ? 0 : t.hold <= -0.999 ? 1 : NOBODY
    if (owner !== t.owner) {
      t.owner = owner
      // 무너진 돌성채는 점령한 순간 전초가 된다(GDD 4.3).
      if (owner !== NOBODY && t.neutral?.kind === 'ruin' && FJORD_NEUTRALS.ruin.grantsOutpost) {
        t.outpost = true
      }
    }
  }

  ownedBy(side: Side): number {
    let n = 0
    for (const t of this.tiles) if (t.owner === side) n++
    return n
  }

  /**
   * 안개 (GDD 4.1).
   *
   * 시야원이 칸의 땅에 닿으면 그 칸이 보인다. 한 번 본 칸은 지형을 기억하지만,
   * 지금 보이지 않으면 그 위의 유닛은 안 보인다 — 부감을 켜 두었다고 해서
   * 모든 것을 아는 것은 아니라는 뜻이고, 이것이 강림의 대가를 성립시킨다
   * (GDD 3.3).
   */
  computeVisible(sources: { pos: Vec2; radius: number }[], side: Side): Set<number> {
    const vis = new Set<number>()
    const half = TILE_LAND / 2
    for (const d of this.defs) {
      for (const s of sources) {
        // 칸의 **땅 사각형까지의 거리**로 잰다. 예전에는 중심 거리에
        // 반칸을 더해 근사했는데, 그러면 칸 한가운데 서 있기만 해도 이웃
        // 칸이 전부 열려서 안개가 사실상 없었다. 지금은 이웃을 보려면
        // 다리 쪽으로 나가야 한다 — 그게 탐험이다.
        const dx = Math.max(0, Math.abs(s.pos.x - d.x) - half)
        const dz = Math.max(0, Math.abs(s.pos.z - d.z) - half)
        if (hypot(dx, dz) <= s.radius) {
          vis.add(d.id)
          break
        }
      }
    }
    for (const id of vis) this.tiles[id]!.seen[side] = true
    return vis
  }

  /** 디버그·AI용. 거울상 대칭이 실제로 지켜지는지 확인할 때 쓴다. */
  mirror(id: number): number {
    return mirrorOf(id)
  }

  static get size(): { cols: number; rows: number } {
    return { cols: COLS, rows: ROWS }
  }
}
