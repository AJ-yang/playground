import { Rng } from '../core/rng'
import { MAP_H, MAP_W, REGION, type RegionDef } from '../data/land'
import { C, hex } from './palette'
import type { Terrain } from './terrain'

/**
 * 땅을 **한 장의 텍스처로 굽는다**.
 *
 * 아홉 칸을 낱개 메시로 깔고 바위와 물결까지 메시로 세우면 드로우콜이 수백이
 * 된다. 캔버스에 한 번 그려 지형 메시에 붙이면 1이다(GDD 7.3).
 *
 * ## 색을 높이에서 뽑는다
 *
 * 처음에는 칸마다 둥근 사각형을 세 겹(여울·모래톱·풀) 찍어서 섬처럼 보이게
 * 했다. 평면 한 장이던 시절에는 그게 맞았다. 그런데 지형에 높낮이가 생기자
 * **칠한 해안선과 실제 해안선이 어긋났다** — 벼랑면에 등고선 같은 띠가 겹쳐
 * 지고, 모래톱 테두리가 바위벼랑 한복판을 가로질렀다.
 *
 * 그래서 도형을 찍는 대신 **그 자리의 높이와 경사를 물어서** 칠한다. 물밑,
 * 여울, 모래, 바위, 풀의 경계가 지형과 정확히 같은 자리에 생긴다 — 두 그림이
 * 어긋날 수가 없다.
 *
 * 높이를 픽셀마다 묻기에는 `heightAt`이 비싸다(칸 아홉 + 다리 열둘을 훑는다).
 * 성긴 격자에 한 번 재 두고 그 사이를 보간해서 쓴다.
 */

/**
 * 텍스처가 덮는 월드 범위. 맵 바깥 여백까지 포함한다.
 *
 * 맵이 가로로 길어졌지만(300×180) 텍스처는 정사각형으로 둔다. 긴 쪽에 맞추면
 * 짧은 쪽에 바다가 더 들어갈 뿐이고, 어차피 그 바깥은 전부 바다다.
 */
export const GROUND_EXTENT = Math.max(MAP_W, MAP_H) / 2 + 30

const PX = 1024

/** 법선맵은 색보다 성겨도 된다. 1024로 뜨면 시작이 눈에 띄게 느려진다. */
const NORMAL_PX = 512

/** 높이를 미리 재 둘 격자. 한 칸이 약 1.2 월드 단위다. */
const HGRID = 128

export function bakeGround(
  regions: RegionDef[],
  seed: number,
  terrain: Terrain,
): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = PX
  cv.height = PX
  const g = cv.getContext('2d')!
  const rng = new Rng(seed ^ 0x5eed)

  const toPx = (w: number): number => ((w + GROUND_EXTENT) / (GROUND_EXTENT * 2)) * PX
  const scale = PX / (GROUND_EXTENT * 2)

  // ── 높이 격자
  const step = (GROUND_EXTENT * 2) / (HGRID - 1)
  const H = new Float32Array(HGRID * HGRID)
  for (let j = 0; j < HGRID; j++) {
    const wz = -GROUND_EXTENT + j * step
    for (let i = 0; i < HGRID; i++) {
      H[j * HGRID + i] = terrain.heightAt(-GROUND_EXTENT + i * step, wz)
    }
  }
  const gridAt = (i: number, j: number): number => {
    const ci = i < 0 ? 0 : i >= HGRID ? HGRID - 1 : i
    const cj = j < 0 ? 0 : j >= HGRID ? HGRID - 1 : j
    return H[cj * HGRID + ci]!
  }
  /** 픽셀 좌표 → 높이. 격자 사이는 이중선형으로 잇는다. */
  const heightPx = (px: number, py: number): number => {
    const u = (px / PX) * (HGRID - 1)
    const v = (py / PX) * (HGRID - 1)
    const i = Math.floor(u)
    const j = Math.floor(v)
    const fu = u - i
    const fv = v - j
    const a = gridAt(i, j)
    const b = gridAt(i + 1, j)
    const c = gridAt(i, j + 1)
    const d = gridAt(i + 1, j + 1)
    return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv
  }

  // ── 픽셀마다 높이와 경사로 색을 고른다
  const img = g.createImageData(PX, PX)
  const px = img.data
  const worldPerPx = (GROUND_EXTENT * 2) / PX
  const rgb = (n: number): [number, number, number] => [
    (n >> 16) & 255,
    (n >> 8) & 255,
    n & 255,
  ]
  const DEEP = rgb(C.deepWater)
  const WATER = rgb(C.water)
  const SHALLOW = rgb(C.shallow)
  const SAND = rgb(C.shore)
  const GRASS = rgb(C.grass)
  const DRY = rgb(C.grassDry)
  const ROCK = rgb(C.rock)

  const mix = (
    a: [number, number, number],
    b: [number, number, number],
    t: number,
    out: [number, number, number],
  ): void => {
    out[0] = a[0] + (b[0] - a[0]) * t
    out[1] = a[1] + (b[1] - a[1]) * t
    out[2] = a[2] + (b[2] - a[2]) * t
  }
  const band = (lo: number, hi: number, v: number): number =>
    v <= lo ? 0 : v >= hi ? 1 : (v - lo) / (hi - lo)

  const out: [number, number, number] = [0, 0, 0]
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const h = heightPx(x, y)
      // 경사는 이웃 높이의 차이. 가파른 곳은 풀이 못 붙고 바위가 드러난다.
      const dhx = (heightPx(x + 2, y) - heightPx(x - 2, y)) / (4 * worldPerPx)
      const dhz = (heightPx(x, y + 2) - heightPx(x, y - 2)) / (4 * worldPerPx)
      const slope = Math.hypot(dhx, dhz)

      if (h < -0.15) {
        // 물밑. 깊을수록 어둡다 — 깊이는 수면이 아니라 바닥이 만든다.
        mix(SHALLOW, WATER, band(-0.15, -1.1, h), out)
        mix(out as [number, number, number], DEEP, band(-1.1, -2.8, h), out)
      } else if (h < 0.75) {
        // 물가의 모래. 파도가 닿는 좁은 띠다.
        mix(SAND, GRASS, band(0.35, 0.75, h), out)
      } else {
        // 풀과 바위. 가파른 곳은 풀이 못 붙는다 — 벼랑이 바위로 드러나는 것이
        // 지형에 높이가 있다는 가장 강한 단서다.
        mix(GRASS, DRY, band(0.9, 3.4, h) * 0.5, out)
        mix(out as [number, number, number], ROCK, band(0.8, 1.6, slope), out)
      }
      const i = (y * PX + x) * 4
      px[i] = out[0]
      px[i + 1] = out[1]
      px[i + 2] = out[2]
      px[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)

  // ── 얼룩. 지역이 서로 복사본으로 안 보이게 하는 것은 이쪽 몫이다.
  for (const t of regions) {
    const cx = toPx(t.x)
    const cy = toPx(t.z)
    const half = (REGION / 2) * scale
    for (let i = 0; i < 34; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = rng.range(0, half * 0.95)
      const bx = cx + Math.cos(a) * r
      const by = cy + Math.sin(a) * r
      g.globalAlpha = rng.range(0.05, 0.18)
      g.fillStyle = rng.next() < 0.5 ? hex(C.rock) : hex(C.rockDark)
      g.beginPath()
      g.ellipse(bx, by, rng.range(2, 9), rng.range(2, 7), a, 0, Math.PI * 2)
      g.fill()
    }
    // 마른 풀 얼룩. 초록 한 색이면 잔디밭처럼 인공적이다.
    for (let i = 0; i < 18; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = rng.range(0, half * 0.9)
      g.globalAlpha = rng.range(0.06, 0.16)
      g.fillStyle = hex(C.grassDry)
      g.beginPath()
      g.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rng.range(6, 18), rng.range(5, 14), a, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }

  return cv
}

export function bakeGroundNormals(src: HTMLCanvasElement): HTMLCanvasElement {
  const n = NORMAL_PX
  const small = document.createElement('canvas')
  small.width = n
  small.height = n
  const sg = small.getContext('2d')!
  sg.drawImage(src, 0, 0, n, n)
  const lum = sg.getImageData(0, 0, n, n).data

  const out = document.createElement('canvas')
  out.width = n
  out.height = n
  const og = out.getContext('2d')!
  const img = og.createImageData(n, n)
  const px = img.data

  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= n ? n - 1 : x
    const cy = y < 0 ? 0 : y >= n ? n - 1 : y
    const i = (cy * n + cx) * 4
    return (lum[i]! * 0.299 + lum[i + 1]! * 0.587 + lum[i + 2]! * 0.114) / 255
  }

  const strength = 5.5
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let nx = (at(x - 1, y) - at(x + 1, y)) * strength
      let ny = (at(x, y - 1) - at(x, y + 1)) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * n + x) * 4
      px[i] = (nx * 0.5 + 0.5) * 255
      px[i + 1] = (ny * 0.5 + 0.5) * 255
      px[i + 2] = (nz * 0.5 + 0.5) * 255
      px[i + 3] = 255
    }
  }
  og.putImageData(img, 0, 0)
  return out
}
