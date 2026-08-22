/**
 * 피오르드 해안 — v1의 유일한 맵 (GDD 6.2).
 *
 * **3×3, 아홉 칸.** 작게 만드는 것은 취향이 아니라 판을 끝내는 장치다
 * (GDD 4.1). 아홉 칸이면 땅이 5~6분이면 떨어지고, 그 뒤엔 서로를 미는 것
 * 말고 할 일이 없다.
 *
 * 칸은 물 위에 떠 있는 섬이고, 이웃한 칸 사이는 **다리 하나로만** 이어진다.
 * "피오르드는 지형이 좁은 통로를 만든다"는 GDD 6.2의 주장이 여기서 코드가
 * 된다 — 유닛은 칸 경계 아무 데로나 넘어가지 못하고 반드시 다리를 지난다.
 * 그래서 아홉 칸짜리 작은 맵에서도 "어느 목을 잡을 것인가"가 생긴다.
 *
 * ```
 *   [0,0]──[1,0]──[2,0]
 *     │      │      │
 *   [0,1]══[1,1]══[2,1]      ═ 는 본진에서 본진으로 가는 최단 경로
 *   본진     중앙    본진
 *     │      │      │
 *   [0,2]──[1,2]──[2,2]
 * ```
 *
 * 중앙 칸은 직행로의 유일한 길목이다. 돌아가려면 모서리 칸 두 개를 거쳐야
 * 하므로, 중앙을 잡은 쪽이 시간을 번다. 중앙에 중립을 두지 않은 것도 그
 * 때문이다 — 중앙은 **서로를 만나는 곳**이지 캠프를 도는 곳이 아니다.
 */
import { Rng } from '../core/rng'
import { TILE } from './tuning'
import type { NeutralKind } from './neutrals'

export const COLS = 3
export const ROWS = 3

/** 칸의 땅 부분 한 변. TILE보다 작아서 칸 사이에 물이 남는다. */
export const TILE_LAND = 28

export interface TileDef {
  readonly id: number
  readonly col: number
  readonly row: number
  /** 월드 좌표. 맵 중앙이 원점이다. */
  readonly x: number
  readonly z: number
}

export function tileId(col: number, row: number): number {
  return row * COLS + col
}

export function makeTiles(): TileDef[] {
  const tiles: TileDef[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      tiles.push({
        id: tileId(col, row),
        col,
        row,
        x: (col - (COLS - 1) / 2) * TILE,
        z: (row - (ROWS - 1) / 2) * TILE,
      })
    }
  }
  return tiles
}

/** 4방 인접. 대각선은 없다 — 다리가 네 변에만 놓이기 때문이다. */
export function neighborsOf(col: number, row: number): number[] {
  const out: number[] = []
  if (col > 0) out.push(tileId(col - 1, row))
  if (col < COLS - 1) out.push(tileId(col + 1, row))
  if (row > 0) out.push(tileId(col, row - 1))
  if (row < ROWS - 1) out.push(tileId(col, row + 1))
  return out
}

/** 두 칸을 잇는 다리의 위치 = 두 칸 중심의 중간점. */
export function bridgeBetween(a: TileDef, b: TileDef): { x: number; z: number } {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
}

/** 180° 회전 대칭의 짝 (GDD 4.2). */
export function mirrorOf(id: number): number {
  const col = id % COLS
  const row = Math.floor(id / COLS)
  return tileId(COLS - 1 - col, ROWS - 1 - row)
}

export const KEEP_P0 = tileId(0, 1)
export const KEEP_P1 = tileId(2, 1)
export const CENTER = tileId(1, 1)

/**
 * 중립 배치. **반쪽만 뽑고 회전 복사한다** (GDD 4.2).
 *
 * 왼쪽 절반의 빈 칸 세 개에 세 갈래를 하나씩 섞어 넣고, 그대로 오른쪽에
 * 회전시켜 놓는다. 그래서 매판 배치가 달라지지만 양쪽이 마주하는 기회는
 * 언제나 똑같다 — 승부는 운이 아니라 *누가 먼저 닿느냐*로 환원된다.
 *
 * 뽑는 칸이 셋이고 갈래도 셋이라 "무엇이 나오느냐"가 아니라 "어디에
 * 나오느냐"만 무작위다. 이건 의도한 것이다. 한 판에 세 갈래가 모두 등장해야
 * GDD 4.3이 말한 세 종류의 결정이 실제로 한 판 안에서 부딪힌다.
 */
export function placeNeutrals(seed: number): Map<number, NeutralKind> {
  const rng = new Rng(seed)

  // 왼쪽 절반에서 본진을 뺀 칸들. 오른쪽은 이들의 거울상이고, 중앙은 비운다.
  const half = [tileId(0, 0), tileId(0, 2), tileId(1, 0)]

  const kinds: NeutralKind[] = ['mercenary', 'creature', 'ruin']
  // Fisher–Yates. Rng를 쓰므로 같은 시드면 같은 배치가 나온다.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!]
  }

  const out = new Map<number, NeutralKind>()
  half.forEach((id, i) => {
    const kind = kinds[i]!
    out.set(id, kind)
    out.set(mirrorOf(id), kind)
  })
  return out
}
