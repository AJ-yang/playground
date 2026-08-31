import { hypot } from '../core/det'
import { clamp, type Vec2 } from '../core/vec2'
import {
  COLS,
  findPath,
  KEEP_P0,
  KEEP_P1,
  Land,
  makeRegions,
  mirrorOf,
  neighborsOf,
  navCol,
  navRow,
  NAV_COLS,
  NAV_ROWS,
  navX,
  navZ,
  placeNeutrals,
  REGION,
  regionAt,
  ROWS,
  type RegionDef,
} from '../data/land'
import { FJORD_NEUTRALS } from '../data/neutrals'
import { TUNING } from '../data/tuning'
import { NOBODY, type Owner, type Side, type Tile } from './types'

/**
 * 판 위의 땅 — 지역·통행·점령·안개.
 *
 * ## 무엇이 바뀌었나
 *
 * 전에는 물 위에 뜬 아홉 개의 섬이었고 이웃 섬은 다리 하나로만 이어졌다.
 * 경로도 그래서 단순했다 — 다리를 순서대로 지나기만 하면 됐다.
 *
 * 지금은 **하나로 이어진 넓은 땅**이라(`data/land.ts`) 길을 실제로 찾아야
 * 한다. 대신 점령·안개·수입·일꾼은 **지역** 단위로 그대로 돈다. 예전의 "칸"이
 * 지역이라는 이름으로 살아남았고, 달라진 것은 지역 사이가 물이 아니라 땅이라는
 * 것뿐이다.
 *
 * ## 대표점(anchor)이 왜 필요한가
 *
 * 지역 중심이 **물일 수 있다.** 한가운데 호수가 그 자리를 덮기 때문이다.
 * 본진 위치·집결 기본값·AI 목표·일꾼 배치가 전부 "그 지역의 한 점"을 필요로
 * 하는데, 중심을 그대로 쓰면 유닛이 물로 걸어간다. 그래서 지역마다 **중심에서
 * 가장 가까운 땅**을 한 번 구해 두고 그걸 대표점으로 쓴다.
 */
export class Board {
  readonly tiles: Tile[]
  readonly defs: RegionDef[]
  /** 지역 id → 이웃 지역 id들. */
  readonly adj: number[][]
  /** 이 판의 땅. 걸을 수 있는 곳이 여기 정의되어 있다. */
  readonly land: Land

  /** 지역마다 하나씩. 중심이 물이면 가장 가까운 땅으로 밀어 둔 점이다. */
  private readonly anchors: Vec2[] = []
  /** 지역 사이의 걸어서 거리(지역 수). 물을 돌아가는 거리라 격자 거리와 다르다. */
  private readonly hops: number[][] = []

  constructor(seed: number, keepP0: number, keepP1: number) {
    this.defs = makeRegions()
    this.adj = this.defs.map((d) => neighborsOf(d.col, d.row))
    this.land = new Land(seed)

    for (const d of this.defs) {
      this.anchors.push(this.land.nearestWalkable({ x: d.x, z: d.z }))
    }
    this.hops = this.buildHops()

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
  }

  at(id: number): Tile {
    return this.tiles[id]!
  }

  /** 이 지역의 대표점. 늘 땅이다. */
  anchor(id: number): Vec2 {
    return this.anchors[id]!
  }

  /** 월드 좌표가 속한 지역. */
  tileAt(p: Vec2): number {
    return regionAt(p.x, p.z)
  }

  /** 걸을 수 있는 곳인가. */
  isWalkable(p: Vec2): boolean {
    return this.land.walkableAt(p)
  }

  isOnLand(p: Vec2): boolean {
    return this.land.walkableAt(p)
  }

  /**
   * 이 점을 땅 위로 끌어낸다.
   *
   * 예전에는 "그 칸의 정사각형 안으로" 밀어 넣는 함수였다. 섬이 사라진 지금은
   * **물 밖으로** 밀어내는 함수다 — 지역 경계는 이제 아무것도 막지 않는다.
   */
  clampToLand(p: Vec2): Vec2 {
    return this.land.walkableAt(p) ? p : this.land.nearestWalkable(p)
  }

  /**
   * 한 걸음 옮긴 자리를 땅 안에서 받아 준다.
   *
   * 못 가는 곳이면 축을 하나씩 시험해 **벽을 따라 미끄러지게** 한다. 이걸
   * 안 하면 해안선에 비스듬히 부딪힌 유닛이 그대로 멈춰 서서, 화면에서는
   * 길을 못 찾는 것처럼 보인다.
   */
  slide(from: Vec2, to: Vec2): Vec2 {
    if (this.land.walkableAt(to)) return to
    const sx = { x: to.x, z: from.z }
    if (this.land.walkableAt(sx)) return sx
    const sz = { x: from.x, z: to.z }
    if (this.land.walkableAt(sz)) return sz
    return from
  }

  /**
   * 경유지 목록.
   *
   * 다리를 순서대로 지나던 예전과 달리 **실제로 길을 찾는다**(`findPath`).
   * 통행 격자 위의 너비 우선 탐색이라 비용이 전부 같고, 그래서 우선순위 큐 없이
   * 최단 경로가 나온다 — 락스텝에서 두 클라이언트가 같은 길을 내야 하므로
   * 이 성질이 속도보다 중요하다(GDD 7.2).
   */
  route(from: Vec2, to: Vec2): Vec2[] {
    return findPath(this.land, from, to)
  }

  /**
   * 지역 사이의 걸어서 거리(지역 수).
   *
   * 격자 거리로 재면 안 된다 — 한가운데 호수를 사이에 둔 두 지역은 격자로는
   * 이웃이지만 실제로는 크게 돌아야 한다. AI가 그걸 모르면 "가까운 곳부터"
   * 판단이 통째로 틀린다.
   */
  tilePath(from: number, to: number): number[] {
    // 예전 시그니처를 지킨다 — 부르는 쪽이 `.length`만 본다.
    const n = this.hops[from]![to]!
    return new Array<number>(n + 1).fill(from)
  }

  /**
   * 지역 사이의 실제 연결을 통행 격자에서 구한다.
   *
   * 지역 하나를 통째로 출발점으로 삼아 격자 BFS를 돌리고, 다른 지역의 땅에
   * 처음 닿은 거리를 지역 거리로 환산한다. 판마다 한 번만 한다.
   */
  private buildHops(): number[][] {
    const n = this.defs.length
    const out: number[][] = []
    const dist = new Int32Array(NAV_COLS * NAV_ROWS)
    const queue = new Int32Array(NAV_COLS * NAV_ROWS)
    const DX = [-1, 1, 0, 0]
    const DZ = [0, 0, -1, 1]

    for (let src = 0; src < n; src++) {
      dist.fill(-1)
      let head = 0
      let tail = 0
      const a = this.anchors[src]!
      const si = navRow(a.z) * NAV_COLS + navCol(a.x)
      dist[si] = 0
      queue[tail++] = si

      while (head < tail) {
        const cur = queue[head++]!
        const cx = cur % NAV_COLS
        const cz = (cur - cx) / NAV_COLS
        for (let k = 0; k < 4; k++) {
          const nx = cx + DX[k]!
          const nz = cz + DZ[k]!
          if (nx < 0 || nz < 0 || nx >= NAV_COLS || nz >= NAV_ROWS) continue
          const ni = nz * NAV_COLS + nx
          if (dist[ni] !== -1 || this.land.walk[ni] !== 1) continue
          dist[ni] = dist[cur]! + 1
          queue[tail++] = ni
        }
      }

      const row: number[] = []
      for (let dst = 0; dst < n; dst++) {
        const b = this.anchors[dst]!
        const di = navRow(b.z) * NAV_COLS + navCol(b.x)
        const cells = dist[di]!
        // 격자 칸수를 지역 수로 환산한다. 못 닿으면 아주 먼 값으로 둔다.
        row.push(cells < 0 ? 99 : Math.round((cells * 2.5) / REGION))
      }
      out.push(row)
    }
    return out
  }

  /**
   * 점령 진행 (GDD 4.3).
   *
   * 한쪽 유닛만 서 있을 때 차오르고, 양쪽이 겹치거나 중립 캠프가 살아 있으면
   * 멈춘다. **점령은 싸움이 끝난 뒤에 일어나는 일**이라는 뜻이다.
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
   * 시야원이 지역의 사각형에 닿으면 그 지역이 보인다. 지역이 예전 칸보다
   * 두 배 넓어졌으므로 시야도 같이 키웠다(`tuning.ts`) — 안 그러면 자기가
   * 선 지역조차 다 안 보인다.
   */
  computeVisible(sources: { pos: Vec2; radius: number }[], side: Side): Set<number> {
    const vis = new Set<number>()
    for (const d of this.defs) {
      for (const s of sources) {
        /**
         * **지역 중심까지의 거리**로 잰다.
         *
         * 예전에는 칸의 사각형까지의 거리로 쟀다. 칸이 28짜리일 때는 그게
         * 맞았지만, 지역이 60으로 커진 지금 같은 식으로 재면 본진에 앉아
         * 있기만 해도 이웃 지역이 통째로 열린다 — 실제로 열렸고, 판을 띄우자마자
         * 적 유닛이 다 보였다.
         *
         * 중심 거리로 재면 그 지역 안으로 **들어가야** 열린다. 가장자리에
         * 서면 이웃도 같이 열리는데, 그건 맞는 그림이다.
         */
        if (hypot(s.pos.x - d.x, s.pos.z - d.z) <= s.radius) {
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

export { KEEP_P0, KEEP_P1, navX, navZ }
