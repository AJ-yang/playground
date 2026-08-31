import * as THREE from 'three'
import { C } from './palette'
import { SEA_LEVEL } from './terrain'

/**
 * 물.
 *
 * 전에는 물이 지면 텍스처에 **그려진 그림**이었다. 땅과 같은 평면에 같은
 * 높이로 칠해져 있었으니, 해안선도 없고 반사도 없고 움직이지도 않았다.
 * 지형에 높낮이가 생긴 지금은 바닥이 해수면 아래로 내려가므로, 물을 진짜
 * 면으로 깔 수 있다.
 *
 * 물이 물처럼 보이게 하는 것은 **하늘의 반사**다. 색이나 투명도가 아니다.
 * `sky.ts`가 구워 둔 등장방형 텍스처를 그대로 `envMap`으로 물려 주면,
 * 거칠기가 낮은 면이 하늘을 비추면서 태양 쪽에 긴 윤슬이 생긴다. 하늘은
 * 어차피 배경으로 이미 만들어 둔 것이라 드는 비용이 없다.
 *
 * 흐름은 **법선맵 두 장을 서로 다른 방향으로 밀어서** 만든다. 한 장만 밀면
 * 무늬가 통째로 미끄러지는 게 눈에 보이는데, 두 장이 어긋나게 흐르면 무늬가
 * 계속 새로 만들어져서 물결이 인다.
 */

const NORMAL_PX = 256

/**
 * 이어붙여도 티가 안 나는 물결 법선맵.
 *
 * 정수 주파수의 사인파만 더한다 — 그래야 텍스처의 왼쪽 끝과 오른쪽 끝이
 * 정확히 맞물려서, 넓은 수면에 반복해 깔아도 이음매가 안 보인다.
 */
export function bakeWaveNormals(): THREE.CanvasTexture {
  const n = NORMAL_PX
  const cv = document.createElement('canvas')
  cv.width = n
  cv.height = n
  const g = cv.getContext('2d')!
  const img = g.createImageData(n, n)
  const px = img.data

  const waves: [number, number, number, number][] = [
    // [가로 주파수, 세로 주파수, 진폭, 위상]
    [3, 1, 1.0, 0.0],
    [1, 4, 0.7, 1.7],
    [5, 3, 0.45, 3.1],
    [2, 7, 0.3, 0.6],
    [9, 5, 0.16, 2.2],
  ]

  const h = (u: number, v: number): number => {
    let s = 0
    for (const [fu, fv, a, p] of waves) {
      s += a * Math.sin((u * fu + v * fv) * Math.PI * 2 + p)
    }
    return s
  }

  const e = 1 / n
  const strength = 1.15
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n
      const v = y / n
      const du = (h(u + e, v) - h(u - e, v)) / (2 * e)
      const dv = (h(u, v + e) - h(u, v - e)) / (2 * e)
      // 기울기를 법선으로. z를 크게 두면 완만한 물결이 된다.
      let nx = -du * strength
      let ny = -dv * strength
      let nz = 40
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
  g.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  // 법선맵은 색이 아니라 방향이다. sRGB로 읽으면 값이 휜다.
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

export interface Water {
  readonly root: THREE.Group
  readonly disposables: { dispose(): void }[]
  /** 흐름을 굴린다. `t`는 판이 시작하고 흐른 초. */
  tick(t: number): void
}

/**
 * 수면 두 겹.
 *
 * 아래 겹은 수평선까지 넓게 깔고, 위 겹은 **판 주변만** 덮는다. 두 겹 다
 * 수평선까지 깔면 화면의 모든 픽셀을 반투명으로 두 번 칠하게 되는데, 잔물결이
 * 눈에 보이는 것은 어차피 가까운 물뿐이라 그 값을 낼 이유가 없다.
 *
 * 두 겹의 높이를 살짝 띄워 두지 않으면 같은 자리를 다투어 얼룩이 진다.
 */
export function buildWater(extent: number, near: number, sky: THREE.Texture): Water {
  const root = new THREE.Group()
  const disposables: { dispose(): void }[] = []

  const layers: { mat: THREE.MeshStandardMaterial; vx: number; vz: number }[] = []
  const specs = [
    { y: SEA_LEVEL, size: extent, repeat: extent / 26, opacity: 0.94, rough: 0.14, vx: 0.012, vz: 0.006 },
    { y: SEA_LEVEL + 0.06, size: near, repeat: near / 17, opacity: 0.42, rough: 0.09, vx: -0.008, vz: 0.014 },
  ]

  for (const s of specs) {
    const geo = new THREE.PlaneGeometry(s.size * 2, s.size * 2)
    geo.rotateX(-Math.PI / 2)
    disposables.push(geo)

    const nrm = bakeWaveNormals()
    nrm.repeat.set(s.repeat, s.repeat)
    disposables.push(nrm)

    const mat = new THREE.MeshStandardMaterial({
      color: C.water,
      roughness: s.rough,
      metalness: 0.04,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.6, 0.6),
      envMap: sky,
      envMapIntensity: 0.85,
      transparent: true,
      opacity: s.opacity,
      // 두 겹이 서로의 깊이를 밟으면 위 겹이 사라진다. 물은 얕은 물속을
      // 비쳐 보여야 하므로 어차피 깊이를 쓰지 않는 편이 맞다.
      depthWrite: false,
    })
    disposables.push(mat)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = s.y
    mesh.renderOrder = 1
    root.add(mesh)
    layers.push({ mat, vx: s.vx, vz: s.vz })
  }

  return {
    root,
    disposables,
    tick(t: number): void {
      for (const l of layers) {
        const nrm = l.mat.normalMap!
        nrm.offset.set(t * l.vx, t * l.vz)
      }
    },
  }
}
