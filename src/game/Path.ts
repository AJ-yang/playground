import type { Vec2 } from '../core/vec2'
import { clamp } from '../core/vec2'

/**
 * 적이 따라 이동하는 경로.
 *
 * 적의 위치를 (x, y)가 아니라 "경로를 따라 얼마나 왔는가(distance)" 하나로
 * 표현하는 것이 이 클래스의 핵심이다. 그 덕분에
 *   - 선두/후미 타겟팅이 distance 비교 한 번으로 끝나고
 *   - 감속·이동이 스칼라 연산이 되며
 *   - 대포탑의 예측 사격도 "distance + speed * t"로 간단히 계산된다.
 */
export class Path {
  /** 픽셀 좌표로 변환된 웨이포인트 */
  readonly points: Vec2[]
  /** 시작점부터 각 웨이포인트까지의 누적 거리 (픽셀) */
  private readonly cumulative: number[]
  readonly totalLength: number

  constructor(waypointsInTiles: readonly Vec2[], tileSize: number) {
    if (waypointsInTiles.length < 2) throw new Error('경로에는 최소 2개의 웨이포인트가 필요합니다')

    // 타일 좌표는 타일의 좌상단을 가리키므로 중심(+0.5)으로 옮긴다.
    this.points = waypointsInTiles.map((p) => ({
      x: (p.x + 0.5) * tileSize,
      y: (p.y + 0.5) * tileSize,
    }))

    this.cumulative = [0]
    let total = 0
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!
      const b = this.points[i]!
      total += Math.hypot(b.x - a.x, b.y - a.y)
      this.cumulative.push(total)
    }
    this.totalLength = total
  }

  /** 경로를 따라 distance만큼 진행한 지점의 픽셀 좌표. */
  positionAt(distance: number): Vec2 {
    const d = clamp(distance, 0, this.totalLength)

    // 구간 수가 10개 내외라 선형 탐색으로 충분하다.
    let i = 1
    while (i < this.cumulative.length - 1 && this.cumulative[i]! < d) i++

    const startDist = this.cumulative[i - 1]!
    const endDist = this.cumulative[i]!
    const a = this.points[i - 1]!
    const b = this.points[i]!
    const segLength = endDist - startDist
    const t = segLength === 0 ? 0 : (d - startDist) / segLength

    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }

  /** 해당 지점에서의 진행 방향 (단위 벡터). 스프라이트 회전에 사용. */
  directionAt(distance: number): Vec2 {
    const d = clamp(distance, 0, this.totalLength)
    let i = 1
    while (i < this.cumulative.length - 1 && this.cumulative[i]! < d) i++
    const a = this.points[i - 1]!
    const b = this.points[i]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    return len === 0 ? { x: 1, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  }

  /**
   * 경로가 지나가는 타일 목록. 건설 금지 판정에 사용한다.
   * 웨이포인트가 축에 평행하다는 전제를 이용해 정수 격자를 그대로 훑는다.
   */
  occupiedTiles(waypointsInTiles: readonly Vec2[]): Vec2[] {
    const tiles: Vec2[] = []
    const seen = new Set<string>()
    const push = (x: number, y: number) => {
      const key = `${x},${y}`
      if (seen.has(key)) return
      seen.add(key)
      tiles.push({ x, y })
    }

    for (let i = 1; i < waypointsInTiles.length; i++) {
      const a = waypointsInTiles[i - 1]!
      const b = waypointsInTiles[i]!
      if (a.x === b.x) {
        const step = b.y > a.y ? 1 : -1
        for (let y = a.y; y !== b.y + step; y += step) push(a.x, y)
      } else if (a.y === b.y) {
        const step = b.x > a.x ? 1 : -1
        for (let x = a.x; x !== b.x + step; x += step) push(x, a.y)
      } else {
        throw new Error(`웨이포인트 ${i - 1}→${i} 구간이 축에 평행하지 않습니다`)
      }
    }
    return tiles
  }
}
