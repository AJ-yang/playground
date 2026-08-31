import { Rng } from '../core/rng'
import { hypot, sin } from '../core/det'
import type { Vec2 } from '../core/vec2'
import type { NeutralKind } from './neutrals'

/**
 * 하나로 이어진 땅.
 *
 * ## 무엇이 바뀌었나
 *
 * 전에는 물 위에 뜬 **아홉 개의 섬**이었고 이웃 섬은 다리 하나로만 이어졌다.
 * 그 구조가 길목을 공짜로 만들어 줬지만(GDD 6.2), 대가로 판이 게임판처럼
 * 보였다 — 스타크래프트나 워크래프트의 맵이 아니라 보드게임 말판이었다.
 *
 * 지금은 **하나로 이어진 넓은 땅**이다. 길목은 다리가 아니라 **바다가 파고든
 * 만(灣)**이 만든다. 지형이 규칙을 만드는 방식은 같고, 그 지형이 인공물이
 * 아니게 됐을 뿐이다.
 *
 * ## 두 개의 격자
 *
 * 이 파일은 격자를 **두 개** 들고 있고, 둘을 헷갈리면 안 된다.
 *
 * | | 크기 | 무엇에 쓰나 |
 * |---|---|---|
 * | **지역**(region) | 5×3, 한 변 60 | 점령·안개·수입·일꾼 정원·AI 목표 |
 * | **통행 격자**(nav) | 120×72, 한 칸 2.5 | 걸을 수 있나·길찾기 |
 *
 * 지역은 예전의 "칸"이 그대로 살아남은 것이다. 점령도 안개도 일꾼도 지역
 * 단위로 돌아가므로 그 규칙들은 하나도 안 바뀐다. 달라진 것은 **지역 사이가
 * 물이 아니라 땅**이라는 것뿐이다.
 *
 * 통행 격자는 새로 생겼다. 다리가 사라졌으니 "어디로 걸을 수 있는가"를 따로
 * 들고 있어야 하고, 길찾기도 여기서 한다.
 *
 * ## 결정론
 *
 * **여기서 만드는 것은 전부 시뮬레이션 입력이다.** 통행 격자가 한 칸이라도
 * 다르면 두 클라이언트의 길이 갈라지므로, 지형은 렌더러가 아니라 여기서
 * 정하고 렌더러가 그것을 읽어 그린다(예전과 반대 방향이다).
 *
 * 그래서 모양을 **잡음이 아니라 도형으로** 만든다. 원과 캡슐을 정해진 자리에
 * 놓고 씨앗으로 조금씩 흔든다 — 사칙연산과 비교만 쓰므로 C# 포팅과 비트까지
 * 같고, 연결성을 눈으로 보장할 수 있다.
 */

// ─────────────────────────────────────────────────────────── 지역

export const COLS = 5
export const ROWS = 3

/** 지역 한 변(월드 단위). */
export const REGION = 60

export const MAP_W = COLS * REGION
export const MAP_H = ROWS * REGION
const HALF_W = MAP_W / 2
const HALF_H = MAP_H / 2

export interface RegionDef {
  readonly id: number
  readonly col: number
  readonly row: number
  /** 지역 중심의 월드 좌표. 맵 중앙이 원점이다. */
  readonly x: number
  readonly z: number
}

export function regionId(col: number, row: number): number {
  return row * COLS + col
}

export function makeRegions(): RegionDef[] {
  const out: RegionDef[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      out.push({
        id: regionId(col, row),
        col,
        row,
        x: (col - (COLS - 1) / 2) * REGION,
        z: (row - (ROWS - 1) / 2) * REGION,
      })
    }
  }
  return out
}

/** 4방 인접. 대각선을 빼는 것은 AI의 거리 감각을 단순하게 두기 위해서다. */
export function neighborsOf(col: number, row: number): number[] {
  const out: number[] = []
  if (col > 0) out.push(regionId(col - 1, row))
  if (col < COLS - 1) out.push(regionId(col + 1, row))
  if (row > 0) out.push(regionId(col, row - 1))
  if (row < ROWS - 1) out.push(regionId(col, row + 1))
  return out
}

/** 180° 회전 대칭의 짝 (GDD 4.2). */
export function mirrorOf(id: number): number {
  const col = id % COLS
  const row = Math.floor(id / COLS)
  return regionId(COLS - 1 - col, ROWS - 1 - row)
}

export const KEEP_P0 = regionId(0, 1)
export const KEEP_P1 = regionId(COLS - 1, 1)
export const CENTER = regionId(2, 1)

/** 월드 좌표가 속한 지역. 맵 밖이면 가장자리 지역으로 물린다. */
export function regionAt(x: number, z: number): number {
  let col = Math.floor((x + HALF_W) / REGION)
  let row = Math.floor((z + HALF_H) / REGION)
  if (col < 0) col = 0
  else if (col > COLS - 1) col = COLS - 1
  if (row < 0) row = 0
  else if (row > ROWS - 1) row = ROWS - 1
  return regionId(col, row)
}

// ─────────────────────────────────────────────────────── 통행 격자

/** 통행 격자 한 칸의 크기. 유닛 지름(~2)보다 조금 크다. */
export const NAV = 2.5

export const NAV_COLS = Math.round(MAP_W / NAV)
export const NAV_ROWS = Math.round(MAP_H / NAV)

/** 격자 칸의 중심 좌표. */
export function navX(cx: number): number {
  return -HALF_W + (cx + 0.5) * NAV
}
export function navZ(cz: number): number {
  return -HALF_H + (cz + 0.5) * NAV
}

/** 월드 좌표 → 격자 칸. 맵 밖은 가장자리로 물린다. */
export function navCol(x: number): number {
  const c = Math.floor((x + HALF_W) / NAV)
  return c < 0 ? 0 : c > NAV_COLS - 1 ? NAV_COLS - 1 : c
}
export function navRow(z: number): number {
  const r = Math.floor((z + HALF_H) / NAV)
  return r < 0 ? 0 : r > NAV_ROWS - 1 ? NAV_ROWS - 1 : r
}

// ─────────────────────────────────────────────────────── 땅의 모양

/**
 * 바다가 파고든 만(灣) 하나.
 *
 * 선분에서 `r`만큼 떨어진 곳까지가 물이다. 원 하나로는 길목이 안 생기고,
 * 선분이라야 **좁고 긴 만**이 되어 지나갈 자리를 정확히 남길 수 있다.
 */
interface Inlet {
  ax: number
  az: number
  bx: number
  bz: number
  r: number
}

/** 점에서 선분까지의 거리. */
function distToSegment(px: number, pz: number, s: Inlet): number {
  const dx = s.bx - s.ax
  const dz = s.bz - s.az
  const l2 = dx * dx + dz * dz
  let t = l2 < 1e-9 ? 0 : ((px - s.ax) * dx + (pz - s.az) * dz) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return hypot(px - (s.ax + dx * t), pz - (s.az + dz * t))
}

/**
 * 이 판의 만들.
 *
 * **왼쪽 절반만 놓고 180° 돌려 복사한다**(GDD 4.2). 그래서 어느 쪽을 잡아도
 * 지형이 똑같고, 승부가 지형 운이 아니라 *누가 먼저 닿느냐*로 환원된다.
 *
 * 자리는 고정이고 씨앗은 **흔들기만** 한다. 완전히 무작위로 뽑으면 길이
 * 막히는 판이 나오는데, 그걸 검사해서 다시 뽑는 구조는 결정론을 지키기가
 * 훨씬 까다로워진다. 모양이 매번 조금씩 다르되 **길목의 위치는 늘 같다**.
 */
function inletsFor(seed: number): Inlet[] {
  const rng = new Rng(seed ^ 0x5bf03635)
  const j = (m: number): number => rng.range(-m, m)

  const out: Inlet[] = []

  /**
   * 한가운데의 호수. **원점에 놓으면 180° 돌려도 자기 자신**이라 복사할 필요가 없다.
   *
   * 이 호수가 이 맵의 뼈대다. 본진에서 본진으로 직선으로 갈 수가 없고
   * 반드시 북쪽이나 남쪽으로 돌아야 한다 — 두 길 중 어디로 갈 것인가가
   * 매 판의 첫 결정이 된다.
   */
  const lakeR = 24 + j(2)
  out.push({ ax: -6, az: 0, bx: 6, bz: 0, r: lakeR })

  // 왼쪽 절반에만 놓고 180° 돌려 복사한다 (GDD 4.2).
  const half: Inlet[] = [
    /**
     * 북서쪽 만. 위 가장자리에서 파고들어 **호수와의 사이에 좁은 목**을 남긴다.
     *
     * 끝을 z = -34쯤에서 멈추는 것이 핵심이다. 더 내려오면 호수와 붙어 북쪽
     * 길이 아예 막히고, 덜 내려오면 목이 넓어져 길목이 아니게 된다.
     */
    { ax: -52 + j(4), az: -HALF_H - 12, bx: -48 + j(4), bz: -34 + j(3), r: 13 + j(1) },
    /** 본진 북쪽의 내륙 호수. 길을 막지는 않고 뒤를 좁혀 모양을 만든다. */
    { ax: -92 + j(5), az: 42 + j(4), bx: -82 + j(5), bz: 46 + j(4), r: 11 + j(1) },
  ]

  for (const s of half) {
    out.push(s)
    out.push({ ax: -s.ax, az: -s.az, bx: -s.bx, bz: -s.bz, r: s.r })
  }
  return out
}

/**
 * 해안선까지의 여백.
 *
 * 맵 가장자리는 물이다. 이 여백이 없으면 땅이 화면 끝에서 직선으로 잘려
 * "세상의 끝"이 보인다.
 */
const COAST = 16

/** 해안을 들쭉날쭉하게 만드는 진폭. 도형 그대로면 둥근 사각형이 된다. */
const COAST_WOBBLE = 7

/**
 * 걸을 수 있는 곳인가 — **이 함수가 이 맵의 정의다.**
 *
 * 렌더러도 이걸 읽어 지형을 깎으므로, 보이는 해안선과 실제로 못 가는 자리가
 * 어긋날 수가 없다. 예전에는 그림과 판정이 따로 놀아서 해안선이 서로 안 맞는
 * 버그가 났다.
 */
export class Land {
  /** 통행 가능 여부. `cz * NAV_COLS + cx`. */
  readonly walk: Uint8Array
  private readonly inlets: Inlet[]
  /** 해안 요철의 진동수. 위상이 아니라 이걸 흔들어야 대칭이 안 깨진다. */
  private readonly fx: number
  private readonly fz: number

  constructor(seed: number) {
    this.inlets = inletsFor(seed)
    const rng = new Rng(seed ^ 0x1f83d9ab)
    this.fx = rng.range(0.028, 0.046)
    this.fz = rng.range(0.040, 0.062)

    this.walk = new Uint8Array(NAV_COLS * NAV_ROWS)
    for (let cz = 0; cz < NAV_ROWS; cz++) {
      for (let cx = 0; cx < NAV_COLS; cx++) {
        this.walk[cz * NAV_COLS + cx] = this.solidAt(navX(cx), navZ(cz)) ? 1 : 0
      }
    }
  }

  /**
   * 이 좌표가 땅인가. 격자와 무관하게 연속 좌표로 묻는다 —
   * 렌더러가 격자보다 촘촘한 메시를 깎을 때 쓴다.
   */
  solidAt(x: number, z: number): boolean {
    // 해안. 가장자리에서 COAST만큼 안쪽까지만 땅이고, 경계는 물결친다.
    /**
     * 해안 요철. **곱으로 만들어야 180° 대칭이 지켜진다.**
     *
     * 처음엔 `sin(x+φ) + sin(z+φ)`로 썼는데, (x,z) → (-x,-z)로 돌리면 값이
     * 달라져서 한쪽 해안만 안으로 파였다 — 거울상 맵의 공정성이 그림에서부터
     * 깨진다(GDD 4.2). 재보니 8,640칸 중 438칸이 어긋나 있었다.
     *
     * `sin(ax)·sin(bz)`는 둘 다 부호가 뒤집혀 곱이 그대로다. **위상을 넣으면
     * 다시 깨지므로**, 판마다 다르게 하려면 위상이 아니라 **진동수**를 흔든다.
     *
     * `det.sin`을 쓰는 것은 결정론 때문이다 — `Math.sin`은 런타임마다 마지막
     * 비트가 달라서, 해안선이 한 칸이라도 어긋나면 두 클라이언트의 길이 갈라진다.
     */
    const wob =
      sin(x * this.fx) * sin(z * this.fz) * COAST_WOBBLE +
      sin(x * this.fx * 2.3) * sin(z * this.fz * 1.7) * COAST_WOBBLE * 0.4
    if (Math.abs(x) > HALF_W - COAST + wob) return false
    if (Math.abs(z) > HALF_H - COAST + wob * 0.7) return false

    for (const s of this.inlets) {
      if (distToSegment(x, z, s) < s.r) return false
    }
    return true
  }

  walkableCell(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= NAV_COLS || cz >= NAV_ROWS) return false
    return this.walk[cz * NAV_COLS + cx] === 1
  }

  walkableAt(p: Vec2): boolean {
    return this.walkableCell(navCol(p.x), navRow(p.z))
  }

  /**
   * 가장 가까운 걸을 수 있는 자리. 물에 빠진 좌표를 뭍으로 끌어낸다.
   *
   * 바깥으로 한 겹씩 넓혀 가며 찾으므로 **가장 가까운 칸**이 나오고, 같은
   * 거리면 낮은 인덱스가 이긴다 — 양쪽 런타임이 같은 답을 내야 하기 때문이다.
   */
  nearestWalkable(p: Vec2): Vec2 {
    if (this.walkableAt(p)) return p
    const cx = navCol(p.x)
    const cz = navRow(p.z)
    for (let ring = 1; ring < 24; ring++) {
      let best = -1
      let bestD = Infinity
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          // 테두리만 본다. 안쪽은 이미 지난 고리에서 봤다.
          if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue
          const nx = cx + dx
          const nz = cz + dz
          if (!this.walkableCell(nx, nz)) continue
          const d = hypot(navX(nx) - p.x, navZ(nz) - p.z)
          const idx = nz * NAV_COLS + nx
          if (d < bestD) {
            bestD = d
            best = idx
          }
        }
      }
      if (best >= 0) {
        return { x: navX(best % NAV_COLS), z: navZ(Math.floor(best / NAV_COLS)) }
      }
    }
    return { x: 0, z: 0 }
  }
}

// ─────────────────────────────────────────────────────────── 길찾기

/**
 * 스크래치 버퍼. 길찾기는 자주 불리므로 매번 할당하면 GC가 프레임을 먹는다.
 * 판정에 관여하지 않는 순수한 작업 공간이라 결정론과는 무관하다.
 */
const prev = new Int32Array(NAV_COLS * NAV_ROWS)
const queue = new Int32Array(NAV_COLS * NAV_ROWS)
let stamp = 0
const stampAt = new Int32Array(NAV_COLS * NAV_ROWS)

/** 이웃을 보는 순서. **고정이어야 한다** — 순서가 다르면 같은 길이 안 나온다. */
const DX = [-1, 1, 0, 0]
const DZ = [0, 0, -1, 1]

/** 두 점 사이가 통째로 땅인가. 경유지를 줄일 때 쓴다. */
function clearLine(land: Land, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax
  const dz = bz - az
  const len = hypot(dx, dz)
  const steps = Math.ceil(len / (NAV * 0.5))
  if (steps <= 0) return true
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (!land.walkableCell(navCol(ax + dx * t), navRow(az + dz * t))) return false
  }
  return true
}

/**
 * 길찾기 — 통행 격자 위의 너비 우선 탐색.
 *
 * 다익스트라도 A*도 아니고 BFS인 것은 **칸 비용이 전부 같기 때문**이다.
 * 비용이 같으면 BFS가 곧 최단 경로고, 우선순위 큐가 없으니 순서가 흔들릴
 * 여지도 없다 — 락스텝에서 두 클라이언트가 같은 길을 내야 하므로 이 성질이
 * 속도보다 중요하다.
 *
 * 찾은 칸 경로를 그대로 쓰면 계단처럼 걷는다. **시야가 통하는 만큼 건너뛰어**
 * 경유지를 줄이면 대각선으로 곧게 간다.
 */
export function findPath(land: Land, from: Vec2, to: Vec2): Vec2[] {
  const goal = land.walkableAt(to) ? to : land.nearestWalkable(to)
  const start = land.walkableAt(from) ? from : land.nearestWalkable(from)

  const sx = navCol(start.x)
  const sz = navRow(start.z)
  const gx = navCol(goal.x)
  const gz = navRow(goal.z)
  const si = sz * NAV_COLS + sx
  const gi = gz * NAV_COLS + gx

  if (si === gi) return [{ x: goal.x, z: goal.z }]

  stamp++
  let head = 0
  let tail = 0
  queue[tail++] = si
  stampAt[si] = stamp
  prev[si] = -1

  let found = false
  while (head < tail) {
    const cur = queue[head++]!
    if (cur === gi) {
      found = true
      break
    }
    const cx = cur % NAV_COLS
    const cz = (cur - cx) / NAV_COLS
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k]!
      const nz = cz + DZ[k]!
      if (nx < 0 || nz < 0 || nx >= NAV_COLS || nz >= NAV_ROWS) continue
      const ni = nz * NAV_COLS + nx
      if (stampAt[ni] === stamp) continue
      if (land.walk[ni] !== 1) continue
      stampAt[ni] = stamp
      prev[ni] = cur
      queue[tail++] = ni
    }
  }

  // 닿을 수 없는 곳이면 목표 하나만 준다. 유닛은 벽에 붙어 서 있게 되는데,
  // 그게 조용히 제자리걸음하는 것보다 화면에서 읽기 쉽다.
  if (!found) return [{ x: goal.x, z: goal.z }]

  // 격자 경로를 뒤에서부터 편다.
  const cells: number[] = []
  for (let cur = gi; cur !== -1; cur = prev[cur]!) cells.push(cur)
  cells.reverse()

  // 경유지 줄이기 — 지금 자리에서 곧장 보이는 가장 먼 칸까지 건너뛴다.
  const out: Vec2[] = []
  let ax = start.x
  let az = start.z
  let i = 0
  while (i < cells.length - 1) {
    let best = i + 1
    for (let j = cells.length - 1; j > i; j--) {
      const c = cells[j]!
      const px = navX(c % NAV_COLS)
      const pz = navZ((c - (c % NAV_COLS)) / NAV_COLS)
      if (clearLine(land, ax, az, px, pz)) {
        best = j
        break
      }
    }
    const c = cells[best]!
    ax = navX(c % NAV_COLS)
    az = navZ((c - (c % NAV_COLS)) / NAV_COLS)
    out.push({ x: ax, z: az })
    i = best
  }

  // 마지막은 격자 중심이 아니라 **실제 목표**여야 한다. 안 그러면 집결 지점을
  // 찍어도 유닛이 근처 격자 중심에 모인다.
  if (out.length > 0) out.pop()
  out.push({ x: goal.x, z: goal.z })
  return out
}

// ─────────────────────────────────────────────────────────── 중립 배치

/**
 * 중립 배치. **왼쪽 절반에서만 뽑고 회전 복사한다** (GDD 4.2).
 *
 * 지역이 아홉에서 열다섯으로 늘었으므로 후보도 늘었다. 다섯 후보 중 셋을
 * 뽑아 세 갈래를 하나씩 넣는다 — "무엇이 나오느냐"가 아니라 **어디에
 * 나오느냐**만 무작위인 것은 그대로다. 한 판에 세 갈래가 모두 등장해야
 * GDD 4.3이 말한 세 종류의 결정이 한 판 안에서 부딪힌다.
 *
 * 가운데 열(호수가 있는 열)은 비운다. 거기는 **서로를 만나는 곳**이지
 * 캠프를 도는 곳이 아니다.
 */
export function placeNeutrals(seed: number): Map<number, NeutralKind> {
  const rng = new Rng(seed)

  // 왼쪽 두 열에서 본진을 뺀 지역들.
  const candidates = [
    regionId(0, 0),
    regionId(0, 2),
    regionId(1, 0),
    regionId(1, 1),
    regionId(1, 2),
  ]
  // Fisher–Yates. Rng를 쓰므로 같은 시드면 같은 배치가 나온다.
  for (let i = candidates.length - 1; i > 0; i--) {
    const k = rng.int(0, i)
    const t = candidates[i]!
    candidates[i] = candidates[k]!
    candidates[k] = t
  }

  const kinds: NeutralKind[] = ['mercenary', 'creature', 'ruin']
  for (let i = kinds.length - 1; i > 0; i--) {
    const k = rng.int(0, i)
    const t = kinds[i]!
    kinds[i] = kinds[k]!
    kinds[k] = t
  }

  const out = new Map<number, NeutralKind>()
  for (let i = 0; i < kinds.length; i++) {
    const id = candidates[i]!
    out.set(id, kinds[i]!)
    out.set(mirrorOf(id), kinds[i]!)
  }
  return out
}
