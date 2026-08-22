import { Rng } from '../core/rng'
import { COLS, ROWS, TILE_LAND, type TileDef } from '../data/fjord'
import { TILE } from '../data/tuning'
import { C, hex } from './palette'

/**
 * 땅을 **한 장의 텍스처로 굽는다**.
 *
 * 아홉 칸을 낱개 메시로 깔고 바위와 물결까지 메시로 세우면 드로우콜이 수백이
 * 된다. 캔버스에 한 번 그려 평면 하나에 붙이면 1이다. `joseon-defense`가
 * 검증한 방식을 그대로 가져온 것이다(GDD 7.3).
 *
 * 여기에 굽는 것은 **한 판 동안 변하지 않는 것**뿐이다 — 물, 땅, 바위, 다리.
 * 소유권·안개·점령처럼 매 프레임 바뀌는 것은 위에 반투명 판을 덧대서 그린다.
 */

/** 텍스처가 덮는 월드 범위. 맵 바깥 여백까지 포함한다. */
export const GROUND_EXTENT = TILE * (Math.max(COLS, ROWS) - 1) / 2 + TILE_LAND / 2 + 26

const PX = 1024

export function bakeGround(tiles: TileDef[], seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = PX
  cv.height = PX
  const g = cv.getContext('2d')!
  const rng = new Rng(seed ^ 0x5eed)

  const toPx = (w: number): number => ((w + GROUND_EXTENT) / (GROUND_EXTENT * 2)) * PX
  const scale = PX / (GROUND_EXTENT * 2)

  // 물. 바깥으로 갈수록 깊어진다.
  const sea = g.createRadialGradient(PX / 2, PX / 2, PX * 0.12, PX / 2, PX / 2, PX * 0.72)
  sea.addColorStop(0, hex(C.water))
  sea.addColorStop(1, hex(C.deepWater))
  g.fillStyle = sea
  g.fillRect(0, 0, PX, PX)

  // 물결. 가로로 길게 끊어 그으면 잔물결처럼 읽힌다.
  g.globalAlpha = 0.12
  g.strokeStyle = hex(C.shallow)
  g.lineWidth = 2
  for (let i = 0; i < 420; i++) {
    const x = rng.range(0, PX)
    const y = rng.range(0, PX)
    const w = rng.range(8, 30)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + w, y + rng.range(-1.5, 1.5))
    g.stroke()
  }
  g.globalAlpha = 1

  // 칸마다 땅을 그린다.
  for (const t of tiles) {
    const cx = toPx(t.x)
    const cy = toPx(t.z)
    const half = (TILE_LAND / 2) * scale

    // 여울(얕은 물) — 땅 둘레를 한 겹 밝게 해서 섬처럼 보이게 한다.
    g.fillStyle = hex(C.shallow)
    roundRect(g, cx - half - 7, cy - half - 7, half * 2 + 14, half * 2 + 14, 14)
    g.fill()

    // 모래톱
    g.fillStyle = hex(C.shore)
    roundRect(g, cx - half - 3, cy - half - 3, half * 2 + 6, half * 2 + 6, 11)
    g.fill()

    // 풀
    const grass = g.createLinearGradient(cx - half, cy - half, cx + half, cy + half)
    grass.addColorStop(0, hex(C.grass))
    grass.addColorStop(1, hex(C.grassDry))
    g.fillStyle = grass
    roundRect(g, cx - half, cy - half, half * 2, half * 2, 9)
    g.fill()

    // 바위 얼룩. 칸마다 조금씩 달라야 아홉 칸이 복사본으로 안 보인다.
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = rng.range(0, half * 0.86)
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      g.globalAlpha = rng.range(0.06, 0.2)
      g.fillStyle = rng.next() < 0.5 ? hex(C.rock) : hex(C.rockDark)
      g.beginPath()
      g.ellipse(px, py, rng.range(2, 8), rng.range(2, 6), a, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }

  // 다리. 이웃한 칸을 잇는 널판.
  for (const a of tiles) {
    for (const b of tiles) {
      if (b.id <= a.id) continue
      const sameRow = a.row === b.row && Math.abs(a.col - b.col) === 1
      const sameCol = a.col === b.col && Math.abs(a.row - b.row) === 1
      if (!sameRow && !sameCol) continue
      drawBridge(g, toPx(a.x), toPx(a.z), toPx(b.x), toPx(b.z), scale)
    }
  }

  return cv
}

function drawBridge(
  g: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  scale: number,
): void {
  const w = 6.4 * scale
  g.save()
  g.translate((ax + bx) / 2, (ay + by) / 2)
  g.rotate(Math.atan2(by - ay, bx - ax))
  const len = Math.hypot(bx - ax, by - ay)

  g.fillStyle = hex(C.plankDark)
  g.fillRect(-len / 2, -w / 2 - 1.5, len, w + 3)
  g.fillStyle = hex(C.plank)
  g.fillRect(-len / 2, -w / 2, len, w)

  // 널판 이음매. 다리라는 것이 한눈에 읽히게 하는 유일한 디테일이다.
  g.strokeStyle = hex(C.plankDark)
  g.lineWidth = 1.4
  const step = 7 * scale
  for (let x = -len / 2 + step; x < len / 2; x += step) {
    g.beginPath()
    g.moveTo(x, -w / 2)
    g.lineTo(x, w / 2)
    g.stroke()
  }
  g.restore()
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
