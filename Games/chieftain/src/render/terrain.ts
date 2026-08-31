import * as THREE from 'three'
import { Land, NAV, NAV_COLS, NAV_ROWS, navX, navZ } from '../data/land'

/**
 * 높낮이.
 *
 * ## 이건 그림이지 규칙이 아니다 — 다만 **같은 원본에서 나온다**
 *
 * 높이는 여전히 렌더 전용이다. 시뮬레이션은 x·z만 알고, 시야도 이동 비용도
 * 안 바뀐다(GDD 7.2의 결정론을 지키기 위해서다).
 *
 * 그런데 **어디가 물인가**는 이제 시뮬레이션이 정한다(`data/land.ts`). 여기서는
 * 그 마스크를 읽어 높이를 깎을 뿐이다. 방향이 예전과 반대인 것이 핵심이다 —
 * 전에는 렌더러가 제 나름대로 해안을 그리고 판정은 따로 놀아서, 보이는 해안선과
 * 실제로 못 가는 자리가 어긋나는 버그가 났다. 지금은 어긋날 수가 없다.
 *
 * ## 어떻게 깎는가
 *
 * **물에서 얼마나 떨어졌는가**를 통행 격자 위에서 한 번 재 두고(BFS), 그 거리로
 * 높이를 올린다. 물가에서 바다로는 내려가고 안쪽으로는 평지까지 올라간다.
 * 도형을 따로 그리지 않으니 해안선이 마스크와 정확히 같은 자리에 생긴다.
 */

/** 해수면. 모든 높이의 기준이다. */
export const SEA_LEVEL = 0

/** 내륙의 평지 높이. 카메라가 겨누는 곳이기도 하다. */
export const PLATEAU = 2.3

/** 평지 위 기복의 진폭. 이보다 크면 유닛이 언덕에 파묻힌다. */
const RELIEF = 1.5

/** 물밑 바닥. 얕은 물이 실제로 얕아 보이려면 너무 깊으면 안 된다. */
const SEABED = -3.6

/**
 * 해안이 평지까지 올라오는 데 걸리는 거리(월드 단위).
 *
 * 섬이던 시절에는 칸 사이가 6밖에 안 떨어져 있어 해안이 깎아지른 벼랑일
 * 수밖에 없었다. 땅이 이어진 지금은 **완만해도 된다** — 오히려 완만해야
 * 스타크래프트나 워크래프트의 맵처럼 읽힌다.
 */
const SHORE = 9

/** 0~1을 부드럽게 이어 주는 곡선. 경사에 각이 안 지게 한다. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 자리마다 정해진 난수. 좌표를 물으면 순서와 무관하게 같은 값이 나온다. */
function hash(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1274126177) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smoothstep(0, 1, x - ix)
  const fz = smoothstep(0, 1, z - iz)
  const a = hash(ix, iz, seed)
  const b = hash(ix + 1, iz, seed)
  const c = hash(ix, iz + 1, seed)
  const d = hash(ix + 1, iz + 1, seed)
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz
}

export class Terrain {
  private readonly seed: number
  /**
   * 물가까지의 거리(월드 단위). 땅이면 양수, 물이면 음수다.
   *
   * 통행 격자와 같은 해상도로 한 번 재 두고 그 사이는 보간한다. 매 정점마다
   * 마스크를 훑는 것보다 훨씬 싸고, 무엇보다 **해안선이 마스크와 같은 자리**에
   * 생긴다는 것이 보장된다.
   */
  private readonly shore: Float32Array

  constructor(land: Land, seed: number) {
    this.seed = seed
    this.shore = buildShoreField(land)
  }

  /**
   * 물가까지의 거리를 보간해 읽는다. 격자 밖은 바다로 친다.
   */
  private shoreAt(x: number, z: number): number {
    const gx = (x - navX(0)) / NAV
    const gz = (z - navZ(0)) / NAV
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const fx = gx - ix
    const fz = gz - iz
    const at = (cx: number, cz: number): number => {
      // 격자 밖은 먼바다. `CAP`과 같은 규모로 둬야 경계에서 안 튄다.
      if (cx < 0 || cz < 0 || cx >= NAV_COLS || cz >= NAV_ROWS) return -60
      return this.shore[cz * NAV_COLS + cx]!
    }
    const a = at(ix, iz)
    const b = at(ix + 1, iz)
    const c = at(ix, iz + 1)
    const d = at(ix + 1, iz + 1)
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz
  }

  /**
   * 이 좌표의 지면 높이.
   *
   * 물가 거리 하나로 바다 → 물가 → 평지를 잇는다. 그 위에 잔 기복을 얹되,
   * **물가 가까이에서는 기복을 줄인다** — 안 그러면 해안선 근처에서 땅이
   * 물 위로 튀어나왔다 들어갔다 해서 지저분해진다.
   */
  heightAt(x: number, z: number): number {
    const d = this.shoreAt(x, z)

    if (d <= 0) {
      // 물. 물가에서 멀어질수록 깊어진다.
      return SEA_LEVEL + (SEABED - SEA_LEVEL) * smoothstep(0, 14, -d)
    }

    const rise = smoothstep(0, SHORE, d)
    const base = SEA_LEVEL + (PLATEAU - SEA_LEVEL) * rise
    const relief =
      (valueNoise(x * 0.035, z * 0.035, this.seed) - 0.5) * RELIEF +
      (valueNoise(x * 0.085, z * 0.085, this.seed + 7) - 0.5) * RELIEF * 0.45
    return base + relief * rise
  }

  displace(geo: THREE.BufferGeometry, lift = 0, ox = 0, oz = 0): void {
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i) + ox, pos.getZ(i) + oz) + lift)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
  }

  /**
   * 화면의 한 점이 가리키는 땅 위의 자리.
   *
   * 평면 하나로 때리면 높은 땅에서 어긋난다 — 부감이 60도로 기울어 있어서
   * 높이 2가 곧 수평으로 1 남짓의 오차가 된다. 맞은 자리의 높이로 평면을
   * 다시 잡기를 몇 번 반복하면 금방 수렴한다.
   */
  raise(ray: THREE.Ray, out: THREE.Vector3): THREE.Vector3 | null {
    const plane = _plane
    let y = PLATEAU
    for (let i = 0; i < 4; i++) {
      plane.set(_up, -y)
      if (!ray.intersectPlane(plane, out)) return null
      y = this.heightAt(out.x, out.z)
    }
    out.y = y
    return out
  }
}

const _up = new THREE.Vector3(0, 1, 0)
const _plane = new THREE.Plane(_up, 0)

/**
 * 물가까지의 거리를 통행 격자 위에서 잰다.
 *
 * 물 칸 전부를 출발점으로 삼은 너비 우선 탐색이라 한 번에 모든 땅의 거리가
 * 나온다. 8자 이웃을 쓰되 대각선에 1.41을 곱해, 계단처럼 각진 해안이 안 되게 한다.
 */
function buildShoreField(land: Land): Float32Array {
  const n = NAV_COLS * NAV_ROWS
  const out = new Float32Array(n)
  const dist = new Float32Array(n)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0

  dist.fill(Infinity)
  for (let i = 0; i < n; i++) {
    if (land.walk[i] !== 1) {
      dist[i] = 0
      queue[tail++] = i
    }
  }

  const DX = [-1, 1, 0, 0, -1, 1, -1, 1]
  const DZ = [0, 0, -1, 1, -1, -1, 1, 1]
  const W = [1, 1, 1, 1, 1.4142135623730951, 1.4142135623730951, 1.4142135623730951, 1.4142135623730951]

  while (head < tail) {
    const cur = queue[head++]!
    const cx = cur % NAV_COLS
    const cz = (cur - cx) / NAV_COLS
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k]!
      const nz = cz + DZ[k]!
      if (nx < 0 || nz < 0 || nx >= NAV_COLS || nz >= NAV_ROWS) continue
      const ni = nz * NAV_COLS + nx
      const nd = dist[cur]! + W[k]! * NAV
      if (nd < dist[ni]!) {
        dist[ni] = nd
        queue[tail++] = ni
      }
    }
  }

  // 물 칸에는 **바다 쪽 거리**를 음수로 넣는다. 같은 방식으로 한 번 더 잰다.
  const seaDist = new Float32Array(n)
  seaDist.fill(Infinity)
  head = 0
  tail = 0
  for (let i = 0; i < n; i++) {
    if (land.walk[i] === 1) {
      seaDist[i] = 0
      queue[tail++] = i
    }
  }
  while (head < tail) {
    const cur = queue[head++]!
    const cx = cur % NAV_COLS
    const cz = (cur - cx) / NAV_COLS
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k]!
      const nz = cz + DZ[k]!
      if (nx < 0 || nz < 0 || nx >= NAV_COLS || nz >= NAV_ROWS) continue
      const ni = nz * NAV_COLS + nx
      const nd = seaDist[cur]! + W[k]! * NAV
      if (nd < seaDist[ni]!) {
        seaDist[ni] = nd
        queue[tail++] = ni
      }
    }
  }

  /**
   * **유한값으로 잘라 둔다.**
   *
   * 닿지 않은 칸은 `Infinity`로 남는데, 그대로 두면 보간할 때 `∞ - ∞`가 되어
   * NaN이 나오고 지형 메시가 통째로 사라진다. 어차피 이 거리는 해안 경사를
   * 그리는 데만 쓰므로 멀리는 다 같다.
   */
  const CAP = 60
  for (let i = 0; i < n; i++) {
    const d = land.walk[i] === 1 ? dist[i]! : -seaDist[i]!
    out[i] = d > CAP ? CAP : d < -CAP ? -CAP : d
  }
  return out
}
