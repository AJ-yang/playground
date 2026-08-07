import { dist2 } from '../core/vec2'
import type { Vec2 } from '../core/vec2'
import { TILE_SIZE } from '../game/Game'
import type { Game } from '../game/Game'

/** 한 건설 가능 타일의 배치 가치. */
export interface Spot {
  col: number
  row: number
  center: Vec2
  /** 기준 사거리 안에 들어오는 경로 길이 (픽셀). 클수록 적이 오래 머문다. */
  coverage: number
}

/** 경로를 이 간격(픽셀)으로 샘플링해 커버리지를 근사한다. */
const SAMPLE_STEP = 8

/**
 * 자리 평가 색인.
 *
 * **사거리마다 좋은 자리가 다르다.** 예전에는 평균 사거리(3.2칸) 하나로 순위를
 * 매겨 모든 기물에 돌려썼는데, 사거리 1.9의 살수를 넣자 곧바로 깨졌다 —
 * 3.2칸 기준 1위 자리는 경로에서 멀찍이 떨어져 긴 구간을 얕게 덮는 곳이라,
 * 1.9칸으로는 **경로에 아예 닿지 않는다.** 살수 몰빵이 방어 0인 첫 판에서도
 * 2웨이브에 죽은 게 그 증거였다(기물 셋을 짓고 아무것도 못 죽였다).
 *
 * 그래서 사거리별로 다시 매기고 결과를 캐시한다.
 */
export interface SpotIndex {
  /** 이 사거리 기준으로 커버리지 순위를 매긴 자리 목록. */
  forRange(range: number): readonly Spot[]
}

export function rankSpots(game: Game): SpotIndex {
  const { paths, grid } = game

  // 모든 경로의 샘플을 미리 뽑아둔다. 다중 경로 맵에서는 두 갈래를 동시에
  // 덮는 자리가 가장 값진데, 경로별로 따로 재면 그 자리를 찾지 못한다.
  const samples: Vec2[] = []
  for (const path of paths) {
    for (let d = 0; d <= path.totalLength; d += SAMPLE_STEP) {
      samples.push(path.positionAt(d))
    }
  }

  const buildable: Array<{ col: number; row: number; center: Vec2 }> = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.kindAt(col, row) !== 'buildable') continue
      buildable.push({ col, row, center: grid.center(col, row) })
    }
  }

  // 사거리는 연속값이지만 0.1칸 차이로 순위가 뒤집히지는 않는다. 0.25칸
  // 단위로 묶어 캐시 항목이 무한히 늘어나는 것을 막는다.
  const cache = new Map<number, Spot[]>()

  return {
    forRange(range: number): readonly Spot[] {
      const bucket = Math.round(range * 4) / 4
      const hit = cache.get(bucket)
      if (hit) return hit

      const rangeSq = (bucket * TILE_SIZE) ** 2
      const spots: Spot[] = []
      for (const tile of buildable) {
        let coverage = 0
        for (const sample of samples) {
          if (dist2(tile.center, sample) > rangeSq) continue
          coverage += SAMPLE_STEP
        }
        if (coverage === 0) continue
        spots.push({ ...tile, coverage })
      }
      spots.sort((a, b) => b.coverage - a.coverage)
      cache.set(bucket, spots)
      return spots
    },
  }
}

/**
 * 아직 비어 있는 자리 중 커버리지가 가장 높은 곳을 고른다.
 *
 * 예전에는 거마작에만 "커버리지 상위 40% 중 경로 앞쪽"을 따로 적용했다.
 * 감속이 뒤쪽 기물에 이득이 되니 앞에 두자는 논리였는데, 실제로는 경로 앞쪽이
 * **적도 덜 지나가고 기물도 없는 곳**이라 곱할 것이 없었다. 그 규칙을 지우자
 * 거마작이 들어간 빌드가 0% → 100%로 뒤집혔다.
 */
export function pickSpot(game: Game, spots: readonly Spot[]): Spot | null {
  const free = spots.filter((s) => game.grid.canBuild(s.col, s.row))
  return free[0] ?? null
}

/**
 * 지휘 기물(기고) 자리.
 *
 * 기고는 경로를 덮을 필요가 **전혀 없다.** 적을 겨누지 않으므로 커버리지 순위는
 * 무의미하고, 대신 **이미 깔린 기물이 가장 많이 들어오는 자리**가 정답이다.
 * 거마작이 "적이 오래 머무는 곳"을 보는 것과 달리, 기고는 "아군이 모인 곳"을 본다.
 */
export function pickCommandSpot(game: Game, index: SpotIndex, auraRange: number): Spot | null {
  // 경로에 닿지 않는 칸도 후보가 되어야 하므로 넉넉한 사거리로 목록을 받는다.
  const free = index.forRange(6).filter((s) => game.grid.canBuild(s.col, s.row))
  if (free.length === 0) return null

  const reachSq = (auraRange * TILE_SIZE) ** 2
  let best: Spot | null = null
  let bestCount = -1
  for (const spot of free) {
    let count = 0
    for (const tower of game.towers) {
      // 기고끼리는 서로를 지휘하지 않으므로 세지 않는다.
      if (tower.stats.auraFireRate > 0) continue
      if (dist2(spot.center, tower.pos) <= reachSq) count++
    }
    if (count > bestCount) {
      best = spot
      bestCount = count
    }
  }
  // 곱할 것이 하나도 없으면 짓지 않는다 — 기고의 "못 하는 것" 그 자체다.
  return bestCount > 0 ? best : null
}
