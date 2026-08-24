import * as THREE from 'three'
import { TILE_LAND, type TileDef } from '../data/fjord'

/**
 * 높낮이.
 *
 * 지금까지 판은 **평면 한 장**이었다. 물도 땅도 같은 y=0에 그려진 그림이라,
 * 1인칭으로 내려가면 세상이 종이 위였다. 여기서 그 그림에 실제 높이를 준다.
 *
 * ## 이건 그림이지 규칙이 아니다
 *
 * **높이는 렌더 전용이다.** 시뮬레이션은 여전히 x·z만 안다 — 시야도 이동
 * 비용도 길찾기도 하나도 안 바뀐다. 이건 게으름이 아니라 선택이다:
 *
 * - 높이를 규칙으로 만들면 **결정론이 걸린다**(GDD 7.2). 지형 생성이 시뮬레이션
 *   입력이 되므로 락스텝 양쪽에서 부동소수점까지 똑같이 나와야 한다
 * - "언덕 위가 유리하다"는 재미있는 규칙이지만, v1이 알아내려는 것은 언덕이
 *   아니라 **강림**이다(GDD 6.4). 지금 넣으면 아직 답이 없는 질문에 답을
 *   덧씌우는 일이 된다
 *
 * 그래서 규칙은 그대로 두고 화면만 바꾼다. 대신 **한 가지는 반드시 지켜야
 * 한다** — 유닛이 물에 빠져 보이면 안 된다. `Board.clampToLand`가 유닛을
 * 한 변 `TILE_LAND`짜리 정사각형 안에 묶어 두므로, 그 정사각형 전체를
 * 해수면 위에 두면 된다. 물로 내려가는 경사는 정사각형 **바깥**에서만
 * 일어난다. 이 한 줄이 "그림만 바꾼다"를 성립시키는 조건이다.
 */

/** 해수면. 모든 높이의 기준이다. */
export const SEA_LEVEL = 0

/** 칸의 평지 높이. 카메라가 겨누는 곳이기도 하다. */
export const PLATEAU = 2.3

/** 평지 위 기복의 진폭. 이보다 크면 유닛이 언덕에 파묻힌다. */
const RELIEF = 1.5

/** 물밑 바닥. 얕은 물이 실제로 얕아 보이려면 너무 깊으면 안 된다. */
const SEABED = -3.4

/** 물가. 땅에서 바닥으로 내려가는 도중에 한 번 들르는 높이다. */
const BEACH = -0.5

/**
 * 땅에서 물로 내려가는 경사의 폭.
 *
 * **칸 사이 간격(6)에 묶여 있다.** 넓히면 이웃한 칸의 물가가 서로 닿아
 * 아홉 칸이 한 덩어리 땅이 되고, 그러면 "다리 하나로만 이어진다"는 이 맵의
 * 유일한 지형 규칙이 그림에서부터 무너진다(GDD 6.2). 그래서 해안은 완만할
 * 수가 없고, 대신 **깎아지른 바위벼랑**으로 읽히게 만든다 — 피오르드가
 * 원래 그렇게 생겼으니 맵 이름과도 맞는다.
 */
const SHORE = 5.5

/** 벼랑면을 들쭉날쭉하게 만드는 요철. 이게 없으면 칸이 도장 찍은 네모가 된다. */
const CLIFF = 1.5

/** 다리 상판의 높이와 반폭. `ground.ts`가 그리는 널판(반폭 3.2)에 맞춘다. */
const BRIDGE_Y = 1.35
const BRIDGE_HALF = 3.0

const HALF = TILE_LAND / 2

interface Span {
  ax: number
  az: number
  bx: number
  bz: number
  /** 선분 길이의 제곱. 매번 다시 안 구하려고 미리 잡아 둔다. */
  len2: number
}

/** 0~1을 부드럽게 이어 주는 곡선. 경사에 각이 안 지게 한다. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * 자리마다 정해진 난수.
 *
 * 씨앗이 같으면 같은 땅이 나와야 한다. 스트림 난수(`core/rng`)로는 안 되는데,
 * 지형은 **읽는 순서와 무관하게** 같은 좌표에서 같은 값이 나와야 하기
 * 때문이다 — 지면 메시, 소유권 판, 유닛 발밑이 전부 제각기 다른 순서로 묻는다.
 */
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
  private readonly tiles: TileDef[]
  private readonly spans: Span[] = []
  private readonly seed: number

  constructor(tiles: TileDef[], seed: number) {
    this.tiles = tiles
    this.seed = seed | 0

    // 이웃한 칸을 잇는 다리 자리. `ground.ts`가 널판을 그리는 자리와 같다.
    for (const a of tiles) {
      for (const b of tiles) {
        if (b.id <= a.id) continue
        const sameRow = a.row === b.row && Math.abs(a.col - b.col) === 1
        const sameCol = a.col === b.col && Math.abs(a.row - b.row) === 1
        if (!sameRow && !sameCol) continue
        const dx = b.x - a.x
        const dz = b.z - a.z
        this.spans.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, len2: dx * dx + dz * dz })
      }
    }
  }

  /**
   * 그 자리의 땅 높이.
   *
   * 칸마다 "여기가 땅이다"라는 마스크를 만들고 가장 센 것을 쓴다. 칸의
   * 정사각형 안에서는 1이고, 바깥으로 `SHORE`만큼 가면서 0으로 떨어진다.
   * 마스크가 곧 땅과 물을 섞는 비율이다.
   */
  heightAt(x: number, z: number): number {
    let mask = 0
    for (const t of this.tiles) {
      // 정사각형까지의 거리(체비셰프). 안에서는 음수다.
      const d = Math.max(Math.abs(x - t.x) - HALF, Math.abs(z - t.z) - HALF)
      const m = 1 - smoothstep(0, SHORE, d)
      if (m > mask) mask = m
      if (mask >= 1) break
    }

    let h = SEABED
    if (mask > 0) {
      // 기복은 세 겹. 넓은 굴곡 위에 잔 굴곡을 얹으면 같은 진폭으로도
      // 훨씬 땅처럼 읽힌다.
      const n =
        valueNoise(x * 0.05, z * 0.05, this.seed) * 0.58 +
        valueNoise(x * 0.13, z * 0.13, this.seed ^ 0x9e37) * 0.28 +
        valueNoise(x * 0.31, z * 0.31, this.seed ^ 0x4d2b) * 0.14
      const land = PLATEAU + (n - 0.5) * 2 * RELIEF

      // 땅 → 물가 → 바닥, 두 마디로 내려간다. 한 번에 내려가면 물가가 없어서
      // 섬이 물에 꽂힌 판때기로 보인다.
      h =
        mask > 0.5
          ? BEACH + (land - BEACH) * ((mask - 0.5) * 2)
          : SEABED + (BEACH - SEABED) * (mask * 2)

      // 벼랑면만 들쭉날쭉하게. 경사 한가운데에서 가장 세고 평지와 물에서는 0이라,
      // 유닛이 서는 땅과 칸 사이의 물길은 건드리지 않는다.
      const edge = 1 - Math.abs(mask * 2 - 1)
      if (edge > 0) {
        h += (valueNoise(x * 0.21, z * 0.21, this.seed ^ 0x7a11) - 0.5) * 2 * CLIFF * edge
      }
    }

    // 다리 상판. 칸 사이는 물에 잠기므로 여기만 따로 들어 올린다.
    for (const s of this.spans) {
      const t = clamp01(((x - s.ax) * (s.bx - s.ax) + (z - s.az) * (s.bz - s.az)) / s.len2)
      const px = s.ax + (s.bx - s.ax) * t
      const pz = s.az + (s.bz - s.az) * t
      const off = Math.hypot(x - px, z - pz)
      const w = 1 - smoothstep(BRIDGE_HALF, BRIDGE_HALF + 0.9, off)
      if (w <= 0) continue
      const deck = SEABED + (BRIDGE_Y - SEABED) * w
      if (deck > h) h = deck
    }

    return h
  }

  /**
   * 평면 지오메트리를 지형에 눌러 붙인다.
   *
   * **XZ 평면에 이미 눕혀진** 지오메트리를 받는다(`geo.rotateX(-π/2)`를 먼저
   * 해 둔다는 뜻이다). 세워 둔 채로 다루면 높이 축이 z가 되어 헷갈린다.
   */
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

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
