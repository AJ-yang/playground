import type { Silhouette } from '../game/types'

/**
 * 적 실루엣 도형.
 *
 * 적 본체는 이제 벡터 아트(`art.ts`의 `ENEMY_ART`)로 그리지만, 이 도형들은
 * 버려지지 않았다. **형태로 방어 유형을 읽는 규칙이 이 게임의 접근성 축**이라
 * (색만으로 판단하게 두지 않는다) 그림 뒤에 어두운 한 겹으로 깔려 외곽을
 * 계속 담당하고, 갑주·산개 표식도 여기서 파생된다.
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
 * 기마 유닛의 흙먼지. 본체 뒤에 깔린다.
 *
 * 기마 여부는 방어 유형과 직교하는 축이라 실루엣이 아니라 부가 요소로 얹는다.
 * 부양 + 그림자만으로는 정지 화면에서 구분이 어려워 날개를 추가했다.
 * @param flap 0~1 날갯짓 위상
 */
/**
 * 기병의 흙먼지 — 뒤로 길게 끌리는 자국.
 *
 * 예전 세계관에서는 이 자리에 **날개**가 있었다. 「화차가 못 때리는 것」을
 * 형태로 알리는 자리라 없앨 수는 없는데, 조선의 전장에 나는 것은 없다.
 * 그래서 같은 역할을 흙먼지가 맡는다 — 달리는 것 뒤에는 먼지가 인다.
 *
 * 날개와 달리 **뒤로만** 뻗는다. 좌우로 펼치면 다시 날개가 되기 때문이다.
 * `flap`은 먼지가 피어오르는 정도로 쓴다.
 */
export function cavalryDustPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  flap: number,
): void {
  const back = r * (1.7 + flap * 0.4)
  const puff = r * (0.5 + flap * 0.22)

  ctx.beginPath()
  // 뒤로 끌리는 세 덩이. 뒤로 갈수록 작아져야 "흩어진다"가 읽힌다.
  ctx.ellipse(cx - r * 0.85, cy + r * 0.5, puff * 1.15, puff * 0.72, 0, 0, Math.PI * 2)
  ctx.ellipse(cx - r * 1.35, cy + r * 0.34, puff * 0.86, puff * 0.56, 0, 0, Math.PI * 2)
  ctx.ellipse(cx - back, cy + r * 0.18, puff * 0.58, puff * 0.4, 0, 0, Math.PI * 2)
}
