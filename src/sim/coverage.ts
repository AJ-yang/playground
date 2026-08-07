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
  /** 사거리 안에 들어오는 가장 이른 경로 진행도. 작을수록 앞쪽(감속 배치에 유리). */
  earliest: number
}

/** 커버리지를 잴 때 쓰는 기준 사거리 (타일). 타워 평균값. */
const REFERENCE_RANGE = 3.2

/** 경로를 이 간격(픽셀)으로 샘플링해 커버리지를 근사한다. */
const SAMPLE_STEP = 8

/**
 * 모든 건설 가능 타일을 "경로를 얼마나 오래 사정권에 두는가"로 평가한다.
 *
 * 실제 사거리는 타워·레벨마다 다르지만, 순위만 필요하므로 평균 사거리로
 * 한 번만 계산해 재사용한다. 매 판단마다 다시 계산하면 시뮬레이션이
 * 수십 배 느려지고, 순위는 거의 바뀌지 않는다.
 */
export function rankSpots(game: Game): Spot[] {
  const { paths, grid } = game
  const rangeSq = (REFERENCE_RANGE * TILE_SIZE) ** 2

  // 모든 경로의 샘플을 미리 뽑아둔다. 다중 경로 맵에서는 두 갈래를 동시에
  // 덮는 자리가 가장 값진데, 경로별로 따로 재면 그 자리를 찾지 못한다.
  const samples: Array<{ pos: Vec2; d: number }> = []
  for (const path of paths) {
    for (let d = 0; d <= path.totalLength; d += SAMPLE_STEP) {
      samples.push({ pos: path.positionAt(d), d })
    }
  }

  const spots: Spot[] = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.kindAt(col, row) !== 'buildable') continue

      const center = grid.center(col, row)
      let coverage = 0
      let earliest = Infinity
      for (const sample of samples) {
        if (dist2(center, sample.pos) > rangeSq) continue
        coverage += SAMPLE_STEP
        if (sample.d < earliest) earliest = sample.d
      }
      if (coverage === 0) continue
      spots.push({ col, row, center, coverage, earliest })
    }
  }

  spots.sort((a, b) => b.coverage - a.coverage)
  return spots
}

/**
 * 아직 비어 있는 자리 중 하나를 고른다.
 * @param preferEarly true면 커버리지가 준수한 자리 중 경로 앞쪽을 우선한다 (거마작용)
 */
export function pickSpot(game: Game, spots: readonly Spot[], preferEarly: boolean): Spot | null {
  const free = spots.filter((s) => game.grid.canBuild(s.col, s.row))
  if (free.length === 0) return null
  if (!preferEarly) return free[0]!

  // 상위 40% 커버리지 안에서 가장 앞쪽 자리를 고른다.
  const cutoff = free[Math.floor(free.length * 0.4)]?.coverage ?? 0
  const candidates = free.filter((s) => s.coverage >= cutoff)
  candidates.sort((a, b) => a.earliest - b.earliest)
  return candidates[0] ?? free[0]!
}
