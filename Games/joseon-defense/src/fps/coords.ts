import * as THREE from 'three'
import type { Vec2 } from '../core/vec2'
import { TILE_SIZE } from '../game/Game'

/**
 * 보드 좌표(픽셀) ↔ 월드 좌표(미터)의 단일 환산 창구.
 *
 * 시뮬레이션은 여전히 2D 보드 픽셀로 돈다. 3D는 **그림만 다시 그리는 층**이라
 * Game·Enemy·Tower의 수치를 하나도 건드리지 않는다 — 밸런스 시뮬레이터가
 * 검증한 숫자가 그대로 유지되어야 하기 때문이다. 그래서 두 좌표계를 잇는
 * 환산은 반드시 여기 한 곳만 지난다. 여기저기서 `* 0.06` 같은 상수를 곱하기
 * 시작하면 어느 축이 뒤집혔는지 추적할 수 없게 된다.
 *
 * 축 대응:
 *   보드 x(오른쪽)  → 월드 +X
 *   보드 y(아래쪽)  → 월드 +Z      (화면을 위에서 내려다본 그대로)
 *   높이            → 월드 +Y
 *
 * 원점은 맵 한가운데다. 하늘·안개·먼 산이 원점 기준 대칭이라 그 편이 자연스럽고,
 * 큰 좌표값에서 오는 부동소수 흔들림도 덜하다.
 */

/** 타일 한 칸의 실제 크기(미터). 사람 키의 1.5배쯤이라 성큼 두 걸음이면 건넌다. */
export const TILE_M = 2.4

/** 보드 픽셀 → 미터 */
export const PX_TO_M = TILE_M / TILE_SIZE

export class BoardFrame {
  readonly widthM: number
  readonly depthM: number

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.widthM = cols * TILE_M
    this.depthM = rows * TILE_M
  }

  /** 보드 픽셀 x → 월드 X */
  x(px: number): number {
    return px * PX_TO_M - this.widthM / 2
  }

  /** 보드 픽셀 y → 월드 Z */
  z(py: number): number {
    return py * PX_TO_M - this.depthM / 2
  }

  /** 보드 좌표(픽셀) → 월드 좌표. y는 높이(미터). */
  toWorld(p: Vec2, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.x(p.x), y, this.z(p.y))
  }

  /** 타일 중심의 월드 좌표 */
  tileCenter(col: number, row: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(
      (col + 0.5) * TILE_M - this.widthM / 2,
      y,
      (row + 0.5) * TILE_M - this.depthM / 2,
    )
  }

  /** 월드 좌표 → 타일 좌표. 맵 밖이면 범위를 벗어난 값이 그대로 나온다. */
  tileAt(worldX: number, worldZ: number): { col: number; row: number } {
    return {
      col: Math.floor((worldX + this.widthM / 2) / TILE_M),
      row: Math.floor((worldZ + this.depthM / 2) / TILE_M),
    }
  }

  /** 월드 좌표 → 보드 픽셀 좌표. 미니맵처럼 2D로 되돌릴 때 쓴다. */
  toBoardPx(worldX: number, worldZ: number): Vec2 {
    return {
      x: (worldX + this.widthM / 2) / PX_TO_M,
      y: (worldZ + this.depthM / 2) / PX_TO_M,
    }
  }

  /** 보드 픽셀 길이 → 미터 (사거리 원 등) */
  len(px: number): number {
    return px * PX_TO_M
  }
}
