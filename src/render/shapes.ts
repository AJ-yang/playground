import type { Silhouette } from '../game/types'

/**
 * 적 실루엣 도형.
 *
 * 보드와 우측 패널(웨이브 미리보기)이 **같은 함수**를 쓴다. 그래야 패널이
 * 자동으로 범례 역할을 한다 — 미리보기에서 본 도형이 화면에 그대로 나온다.
 *
 * 작은 크기(반지름 7~22px)에서 구분되는 것이 최우선이라, 변이 많은 도형은
 * 쓰지 않았다. 12px에서 육각형과 팔각형은 둘 다 그냥 동그라미로 보인다.
 */

/** 실루엣 경로를 ctx에 만든다 (fill/stroke는 호출부에서). */
export function enemySilhouettePath(
  ctx: CanvasRenderingContext2D,
  silhouette: Silhouette,
  cx: number,
  cy: number,
  r: number,
  /** 진행 방향 (라디안). 'swift'만 사용한다. */
  angle = 0,
): void {
  ctx.beginPath()

  switch (silhouette) {
    case 'basic':
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      break

    case 'swift': {
      // 진행 방향으로 뾰족한 쐐기 — "빠르다"를 방향과 형태로 동시에 전달한다.
      const pts: Array<[number, number]> = [
        [r * 1.25, 0],
        [-r * 0.75, -r * 0.9],
        [-r * 0.35, 0],
        [-r * 0.75, r * 0.9],
      ]
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      pts.forEach(([px, py], i) => {
        const x = cx + px * cos - py * sin
        const y = cy + px * sin + py * cos
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.closePath()
      break
    }

    case 'armored':
      // 각진 육각 — 단단한 인상. 원·마름모와 실루엣이 확실히 갈린다.
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      break

    case 'warded':
      // 세로로 긴 마름모 — 뾰족한 상하 끝이 육각형과 확실히 구분된다.
      ctx.moveTo(cx, cy - r * 1.2)
      ctx.lineTo(cx + r * 0.8, cy)
      ctx.lineTo(cx, cy + r * 1.2)
      ctx.lineTo(cx - r * 0.8, cy)
      ctx.closePath()
      break

    case 'bulwark':
      // 방패 — 평평한 어깨에 뾰족한 아래끝.
      ctx.moveTo(cx - r * 0.92, cy - r * 0.78)
      ctx.lineTo(cx + r * 0.92, cy - r * 0.78)
      ctx.lineTo(cx + r * 0.92, cy + r * 0.15)
      ctx.lineTo(cx, cy + r * 1.2)
      ctx.lineTo(cx - r * 0.92, cy + r * 0.15)
      ctx.closePath()
      break

    case 'boss': {
      // 뿔 달린 다각 — 반지름을 번갈아 줄여 왕관/가시 실루엣을 만든다.
      const spikes = 9
      for (let i = 0; i < spikes * 2; i++) {
        const a = (Math.PI / spikes) * i - Math.PI / 2
        const rad = i % 2 === 0 ? r * 1.12 : r * 0.74
        const x = cx + Math.cos(a) * rad
        const y = cy + Math.sin(a) * rad
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      break
    }
  }
}

/**
 * 공중 유닛의 날개. 본체 뒤에 깔린다.
 *
 * 공중 여부는 방어 유형과 직교하는 축이라 실루엣이 아니라 부가 요소로 얹는다.
 * 부양 + 그림자만으로는 정지 화면에서 구분이 어려워 날개를 추가했다.
 * @param flap 0~1 날갯짓 위상
 */
export function enemyWingsPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  flap: number,
): void {
  const spread = r * (1.85 + flap * 0.35)
  const rise = r * (0.7 + flap * 0.45)

  ctx.beginPath()
  // 왼쪽 날개
  ctx.moveTo(cx - r * 0.3, cy)
  ctx.lineTo(cx - spread, cy - rise)
  ctx.lineTo(cx - spread * 0.6, cy + r * 0.42)
  ctx.closePath()
  // 오른쪽 날개
  ctx.moveTo(cx + r * 0.3, cy)
  ctx.lineTo(cx + spread, cy - rise)
  ctx.lineTo(cx + spread * 0.6, cy + r * 0.42)
  ctx.closePath()
}
