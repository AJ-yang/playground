import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { C } from './palette'
import { NEUTRAL, type Faction, type Side } from '../game/types'

/**
 * 관절이 있는 몸.
 *
 * "딱딱하다"는 지적의 나머지 절반이 여기 있다. 앞선 작업에서 빛을 고쳐 면이
 * 둥글게 읽히게 만들었지만, 유닛은 여전히 **캡슐 하나가 미끄러지듯** 이동했다.
 * 다리가 없으니 걷는 장면이 없고, 팔이 없으니 때리는 장면도 몸통을 앞으로
 * 내미는 것이 전부였다.
 *
 * ## 왜 glTF를 안 들여왔는가
 *
 * 원래 계획은 에셋 파일을 들이는 것이었다(GDD 7장의 "에셋 파일 없음" 방침을
 * 깨는 결정). 알아보니 **라이선스가 분명한 바이킹 휴머노이드를 구할 길이
 * 없었다.** 그래서 방침을 깨지 않고 같은 목적지에 가는 쪽을 택했다 — 뼈대를
 * 코드로 짓고 동작을 손으로 적는다. 덤으로 얻은 것이 있다:
 *
 * - 진영색·팔레트가 자동으로 맞는다. 남의 모델을 받아 칠하는 문제가 없다
 * - 저장소에 바이트가 안 늘고, 로딩이 여전히 즉시다
 * - 방패병이 **막아낸 순간에만 방패를 들어올린다** 같은, 이 게임의 규칙에
 *   묶인 동작을 마음대로 넣을 수 있다. 남의 클립으로는 못 하는 일이다
 *
 * ## 그리기 비용
 *
 * 관절마다 조각을 따로 두면 유닛 하나가 메시 20개를 넘고, 40마리면 그림자
 * 패스까지 1600 드로우콜이 된다. 그래서 **색을 정점에 굽는다**(`paint`).
 * 같은 뼈에 붙는 조각은 색이 달라도 하나로 합칠 수 있어서 유닛 하나가 메시
 * 10개로 끝나고, 재질도 하나뿐이라 피격 섬광은 여전히 `emissive` 한 줄이다.
 *
 * 지오메트리는 (역할 × 진영)마다 한 벌만 굽고 모든 개체가 공유한다. 조합은
 * 여섯 개뿐이라 캐시가 작다.
 */

export type WarriorRole = 'shield' | 'axe' | 'chief' | 'worker'

// ─────────────────────────────────────────────────────────── 치수

/**
 * 유닛 로컬 공간의 비율. 바깥에서 `radius * VIEW_SCALE`로 다시 키우므로
 * 여기서는 절대 크기가 아니라 **머리 대 몸의 비율**만 지킨다. 실제 사람보다
 * 머리를 키우고 다리를 짧게 잡았다 — 부감에서 4~6픽셀로 보이는 몸이라,
 * 사람 비율을 그대로 쓰면 아무것도 안 읽힌다.
 */
const HIP_Y = 1.42
const THIGH = 0.74
const SHIN = 0.68
const SHOULDER_Y = 1.0
const SHOULDER_X = 0.44
const UPPER_ARM = 0.54
const FOREARM = 0.5
const NECK_Y = 1.22

// ─────────────────────────────────────────────────────────── 색

interface Skin {
  cloth: number
  clothDim: number
  leather: number
  metal: number
  metalDark: number
  wood: number
  flesh: number
  hair: number
  /** 신의 것에만 쓴다. 룬 띠와 뿔 — 이 색이 보이면 사람이 아니다. */
  gold: number
}

function skinFor(faction: Faction): Skin {
  const own = faction !== NEUTRAL
  return {
    cloth: own ? C.side[faction as Side] : C.neutral,
    clothDim: own ? C.sideDim[faction as Side] : C.neutralDark,
    leather: 0x4b3a2b,
    // 금속은 팔레트보다 한 단계 밝게 잡았다. 채도가 낮은 화면이라 투구와
    // 도끼날이 옷보다 밝지 않으면 실루엣에서 사라진다.
    metal: 0x9aa3ad,
    metalDark: 0x565d66,
    wood: 0x6b4f34,
    flesh: 0xd9b18f,
    hair: own ? 0xa8763f : 0x6b5236,
    gold: 0xd8b45c,
  }
}

// ─────────────────────────────────────────────────────────── 조각 굽기

/** 원본 프리미티브. 전부 여기서 복제해 쓰고 마지막에 한 번만 버린다. */
const SRC = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl5: new THREE.CylinderGeometry(0.5, 0.5, 1, 5),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl14: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 10, 7),
  dome: new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.58),
}

type V3 = readonly [number, number, number]
interface Place {
  /** 크기 → 회전 → 이동 순으로 먹인다. */
  s?: V3
  r?: V3
  p?: V3
  /**
   * 관절을 겹쳐 쌓아야 할 때의 탈출구. 주면 `s·r·p`는 무시한다.
   *
   * 쓰러진 몸처럼 "어깨에 매달린 팔꿈치에 매달린 손"을 한 덩어리로 구울
   * 때는 회전 순서가 정해져 있어야 하는데, 축을 하나씩 돌리는 방식으로는
   * 그 순서를 표현할 수 없다.
   */
  m?: THREE.Matrix4
}

const _color = new THREE.Color()

/**
 * 색을 정점에 굽는다.
 *
 * `setHex(hex, SRGBColorSpace)`로 선형 작업 공간으로 옮긴다 — 이걸 빼면
 * 정점색만 다른 감마를 타서 재질 색으로 칠한 다른 물체들과 톤이 어긋난다.
 */
function paint(g: THREE.BufferGeometry, hex: number): void {
  _color.setHex(hex, THREE.SRGBColorSpace)
  const n = g.attributes.position!.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _color.r
    arr[i * 3 + 1] = _color.g
    arr[i * 3 + 2] = _color.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

/** 한 뼈에 붙는 조각들을 모아 하나로 합친다. */
class Parts {
  private readonly items: THREE.BufferGeometry[] = []

  add(src: THREE.BufferGeometry, hex: number, at: Place = {}): this {
    const g = src.clone()
    if (at.s) g.scale(at.s[0], at.s[1], at.s[2])
    if (at.r) {
      if (at.r[0]) g.rotateX(at.r[0])
      if (at.r[1]) g.rotateY(at.r[1])
      if (at.r[2]) g.rotateZ(at.r[2])
    }
    if (at.p) g.translate(at.p[0], at.p[1], at.p[2])
    paint(g, hex)
    this.items.push(g)
    return this
  }

  /**
   * 이미 색이 구워진 지오메트리를 그대로 받는다. 다시 칠하지 않는다 —
   * 무기를 팔에 붙이거나, 서 있는 부위들을 모아 쓰러진 몸을 만들 때 쓴다.
   */
  addBuilt(g: THREE.BufferGeometry, at: Place = {}): this {
    if (at.m) {
      g.applyMatrix4(at.m)
      this.items.push(g)
      return this
    }
    if (at.s) g.scale(at.s[0], at.s[1], at.s[2])
    if (at.r) {
      if (at.r[0]) g.rotateX(at.r[0])
      if (at.r[1]) g.rotateY(at.r[1])
      if (at.r[2]) g.rotateZ(at.r[2])
    }
    if (at.p) g.translate(at.p[0], at.p[1], at.p[2])
    this.items.push(g)
    return this
  }

  /** 다른 `Parts`를 통째로 흡수한다. 무기를 팔에 붙일 때 쓴다. */
  absorb(other: Parts, at: Place = {}): this {
    for (const g of other.items) this.addBuilt(g, at)
    other.items.length = 0
    return this
  }

  merge(): THREE.BufferGeometry {
    const out = mergeGeometries(this.items, false)
    for (const g of this.items) g.dispose()
    this.items.length = 0
    if (!out) throw new Error('warrior: 조각을 합치지 못했다')
    out.computeBoundingSphere()
    return out
  }
}

// ─────────────────────────────────────────────────────────── 부위

/**
 * 넓적다리 — 원점이 고관절이고 아래로 뻗는다. 뼈를 회전시키면 그대로 다리가
 * 돈다. 좌우가 같은 모양이라 지오메트리를 공유한다.
 */
function thighGeo(k: Skin): THREE.BufferGeometry {
  return new Parts()
    .add(SRC.cyl6, k.clothDim, { s: [0.34, THIGH, 0.34], p: [0, -THIGH / 2, 0] })
    .merge()
}

/** 정강이 + 발. 무릎이 원점. */
function shinGeo(k: Skin): THREE.BufferGeometry {
  return new Parts()
    .add(SRC.cyl6, k.clothDim, { s: [0.28, SHIN * 0.62, 0.28], p: [0, -SHIN * 0.31, 0] })
    .add(SRC.cyl6, k.leather, { s: [0.3, SHIN * 0.42, 0.3], p: [0, -SHIN * 0.79, 0] })
    .add(SRC.box, k.leather, { s: [0.28, 0.16, 0.38], p: [0, -SHIN - 0.05, 0.07] })
    .merge()
}

/** 몸통 — 원점이 골반. 가슴·허리띠·어깨판이 한 덩어리다. */
function torsoGeo(k: Skin, role: WarriorRole): THREE.BufferGeometry {
  const p = new Parts()
    // 가슴은 앞뒤로 눌러 둔다. 정원기둥이면 통나무로 보인다.
    .add(SRC.cyl8, k.cloth, { s: [0.9, 1.02, 0.64], p: [0, 0.54, 0] })
    .add(SRC.cyl8, k.leather, { s: [0.86, 0.15, 0.62], p: [0, 0.06, 0] })
    // 가슴 앞을 가로지르는 가죽띠. 이게 있으면 몸통이 원기둥으로 안 읽힌다.
    .add(SRC.box, k.leather, { s: [0.16, 1.0, 0.1], r: [0, 0, -0.42], p: [0.1, 0.6, 0.32] })
    /**
     * 어깨판과 짧은 망토를 **진영색으로** 칠한다.
     *
     * 처음엔 금속색이었다. 가까이서는 그럴듯했지만 부감에서 유닛이 통째로
     * 회색으로 읽혔다 — 위에서 내려다보면 보이는 면이 투구와 어깨뿐이라,
     * 그 둘이 무채색이면 진영색을 실은 몸통은 거의 안 보인다. 전에 쓰던
     * 단색 캡슐은 못생겼어도 **누구 편인지는 100% 읽혔고**, 그걸 잃으면
     * 이 게임의 시각적 규칙 전달이 통째로 죽는다(GDD 6.2).
     */

  if (role !== 'worker') {
    // 어깨판. 일꾼에게는 없다 — 갑옷을 안 입었다는 것이 실루엣의 차이다.
    p.add(SRC.sphere, k.cloth, {
      s: [0.44, 0.32, 0.44],
      p: [SHOULDER_X, SHOULDER_Y - 0.02, 0],
    }).add(SRC.sphere, k.cloth, {
      s: [0.44, 0.32, 0.44],
      p: [-SHOULDER_X, SHOULDER_Y - 0.02, 0],
    })
  }

  if (role !== 'chief' && role !== 'worker') {
    // 부하는 어깨만 덮는 짧은 망토. 위에서 봤을 때 진영색 면적을 만든다.
    // 족장의 긴 망토는 여기 없다 — 따로 떼어 `cloakGeo`가 만든다.
    p.add(SRC.cone8, k.cloth, { s: [1.16, 0.92, 0.86], r: [0.18, 0, 0], p: [0, 0.62, -0.16] })
  }
  return p.merge()
}

/**
 * 족장의 긴 망토. **몸통에 합치지 않고 따로 둔다.**
 *
 * 1인칭에서 내 몸을 그리기 시작하면서 필요해졌다. 카메라가 눈 자리에 있는데
 * 이 원뿔의 꼭짓점이 딱 그 높이라, 합쳐 두면 강림해서 아래를 볼 때마다 **화면
 * 절반이 망토 안쪽**이 된다. 머리와 같은 이유로 끌 수 있어야 한다.
 */
function cloakGeo(k: Skin): THREE.BufferGeometry {
  return new Parts()
    .add(SRC.cone8, k.cloth, { s: [1.5, 1.7, 1.1], r: [0.12, 0, 0], p: [0, 0.42, -0.22] })
    .merge()
}

/** 머리 — 원점이 목. 투구·코가리개·수염까지 한 덩어리. */
function headGeo(k: Skin, role: WarriorRole): THREE.BufferGeometry {
  const p = new Parts()
    .add(SRC.cyl6, k.flesh, { s: [0.2, 0.2, 0.2], p: [0, -0.06, 0] })
    .add(SRC.sphere, k.flesh, { s: [0.56, 0.6, 0.54], p: [0, 0.2, 0] })
    // 수염. 바이킹 실루엣의 거의 전부다 — 이거 하나로 머리가 공이 아니게
    // 된다. 다만 **턱 아래**여야 한다. 처음엔 얼굴 한가운데에 걸려서 눈을
    // 가린 복면처럼 보였다.
    .add(SRC.cone8, k.hair, {
      s: [0.44, 0.44, 0.38],
      r: [Math.PI, 0, 0],
      p: [0, -0.04, 0.11],
    })

  if (role === 'worker') {
    // **투구가 없다.** 부감에서 병사와 일꾼을 가르는 가장 강한 단서다 —
    // 병사의 머리는 밝은 금속이고 일꾼의 머리는 머리카락 색이다.
    p.add(SRC.dome, k.hair, { s: [0.6, 0.5, 0.58], p: [0, 0.22, 0] })
  } else {
    p.add(SRC.dome, k.metal, { s: [0.61, 0.6, 0.59], p: [0, 0.2, 0] })
      .add(SRC.cyl8, k.metalDark, { s: [0.62, 0.09, 0.6], p: [0, 0.19, 0] })
      // 코가리개. 얼굴 정면에 세로선이 하나 생겨서 어느 쪽을 보는지가 읽힌다.
      .add(SRC.box, k.metalDark, { s: [0.08, 0.3, 0.08], p: [0, 0.16, 0.27] })
  }

  if (role === 'chief') {
    // 뿔. 눕히면 모자 챙이 되어 버려서 세워 둔다 — 부감에서 아바타를 찾는
    // 단서가 빛기둥 말고 하나 더 있어야 한다.
    for (const sx of [1, -1]) {
      p.add(SRC.cone8, 0xe6dcc6, {
        s: [0.15, 0.52, 0.15],
        r: [-0.25, 0, sx * 0.5],
        p: [sx * 0.2, 0.5, -0.02],
      })
    }
  }
  return p.merge()
}

/** 위팔 — 원점이 어깨. */
function upperArmGeo(k: Skin): THREE.BufferGeometry {
  return new Parts()
    .add(SRC.cyl6, k.cloth, { s: [0.3, UPPER_ARM, 0.3], p: [0, -UPPER_ARM / 2, 0] })
    .merge()
}

/**
 * 대인용 도끼. 원점이 손.
 *
 * 자루를 길게 잡고 날을 위로 두면 **날이 얼굴 옆에 와서 흰 판때기로**
 * 보인다. 자루를 줄이고 뒤로 눕혀 어깨에 걸치게 했다 — 쉬는 자세로도
 * 자연스럽고, 팔을 들면 그대로 머리 위로 올라간다.
 */
function axeParts(k: Skin): Parts {
  return new Parts()
    .add(SRC.cyl6, k.wood, { s: [0.11, 1.7, 0.11], p: [0, 0.32, 0] })
    .add(SRC.box, k.metal, { s: [0.07, 0.46, 0.32], p: [0, 0.98, 0.22] })
    .add(SRC.box, k.metal, { s: [0.07, 0.24, 0.17], p: [0, 0.78, 0.27] })
    .add(SRC.box, k.metalDark, { s: [0.1, 0.17, 0.19], p: [0, 1.0, -0.09] })
}

/**
 * 묠니르.
 *
 * 자루가 **짧고** 머리가 크다 — 실제 신화의 묘사이기도 하고, 부감에서 도끼와
 * 헷갈리지 않는 유일한 방법이기도 하다. 도끼는 얇은 날이 옆으로 뻗고,
 * 이것은 네모난 덩어리가 자루 끝에 달려 있다.
 */
function hammerParts(k: Skin): Parts {
  return new Parts()
    .add(SRC.cyl6, k.wood, { s: [0.13, 1.0, 0.13], p: [0, 0.1, 0] })
    // 자루를 감은 가죽끈. 짧은 자루가 밋밋해 보이지 않게 한다.
    .add(SRC.cyl8, k.clothDim, { s: [0.16, 0.16, 0.16], p: [0, -0.3, 0] })
    // 머리. 하나의 덩어리 + 양쪽 타격면.
    .add(SRC.box, k.metalDark, { s: [0.34, 0.4, 0.44], p: [0, 0.72, 0] })
    .add(SRC.box, k.metal, { s: [0.4, 0.34, 0.14], p: [0, 0.72, 0.27] })
    .add(SRC.box, k.metal, { s: [0.4, 0.34, 0.14], p: [0, 0.72, -0.27] })
    // 룬을 새긴 띠. 금속 덩어리에 가로선이 하나 생겨 크기가 읽힌다.
    .add(SRC.box, k.gold, { s: [0.36, 0.07, 0.46], p: [0, 0.86, 0] })
}

/** 창. 방패병의 사거리가 도끼병보다 긴 이유가 화면에도 있어야 한다. */
function spearParts(k: Skin): Parts {
  return new Parts()
    .add(SRC.cyl5, k.wood, { s: [0.09, 2.5, 0.09], p: [0, 0.58, 0] })
    .add(SRC.cone8, k.metal, { s: [0.2, 0.42, 0.2], p: [0, 2.02, 0] })
    .add(SRC.cyl5, k.metalDark, { s: [0.13, 0.1, 0.13], p: [0, 1.79, 0] })
}

/** 둥근 방패. 팔뚝에 묶여 있으므로 팔뚝 지오메트리에 흡수된다. */
function shieldParts(k: Skin): Parts {
  return new Parts()
    .add(SRC.cyl14, k.metalDark, { s: [1.36, 0.06, 1.36], r: [Math.PI / 2, 0, 0], p: [0, 0, 0.1] })
    .add(SRC.cyl14, k.clothDim, { s: [1.24, 0.08, 1.24], r: [Math.PI / 2, 0, 0], p: [0, 0, 0.14] })
    // 판자 이음새 두 줄. 방패가 그냥 원판이 아니라 나무로 읽힌다.
    .add(SRC.box, k.wood, { s: [0.16, 0.04, 1.2], r: [Math.PI / 2, 0, 0], p: [-0.3, 0, 0.18] })
    .add(SRC.box, k.wood, { s: [0.16, 0.04, 1.2], r: [Math.PI / 2, 0, 0], p: [0.3, 0, 0.18] })
    .add(SRC.sphere, k.metal, { s: [0.34, 0.34, 0.3], p: [0, 0, 0.22] })
}

/** 일꾼의 연장. 짧은 자루에 작은 날 — 도끼와 헷갈리지 않을 만큼 작다. */
function toolParts(k: Skin): Parts {
  return new Parts()
    .add(SRC.cyl5, k.wood, { s: [0.09, 1.1, 0.09], p: [0, 0.12, 0] })
    .add(SRC.box, k.metalDark, { s: [0.06, 0.16, 0.34], p: [0, 0.6, 0.15] })
}

/**
 * 팔뚝 — 원점이 팔꿈치. 손과 들고 있는 것까지 한 덩어리로 굽는다.
 *
 * 무기는 손에 대해 움직이지 않으므로 뼈를 하나 더 둘 이유가 없다. 합쳐 두면
 * 유닛당 드로우콜이 둘 줄어든다.
 */
type Hold = 'axe' | 'hammer' | 'spear' | 'shield' | 'tool' | 'none'

/** 이 역할이 오른손에 드는 것. 쓰러진 몸도 같은 것을 들어야 한다. */
function holdOf(role: WarriorRole): Hold {
  if (role === 'shield') return 'spear'
  if (role === 'worker') return 'tool'
  // 강림한 신은 **망치**를 든다. 부감에서 실루엣만으로 "저건 사람이 아니다"가
  // 읽혀야 하고, 노르드에서 그 실루엣은 하나뿐이다(GDD 5장).
  if (role === 'chief') return 'hammer'
  return 'axe'
}

function foreArmGeo(k: Skin, hold: Hold): THREE.BufferGeometry {
  const p = new Parts()
    .add(SRC.cyl6, k.cloth, { s: [0.26, FOREARM * 0.7, 0.26], p: [0, -FOREARM * 0.35, 0] })
    .add(SRC.cyl6, k.flesh, { s: [0.24, FOREARM * 0.34, 0.24], p: [0, -FOREARM * 0.83, 0] })
    .add(SRC.sphere, k.flesh, { s: [0.28, 0.28, 0.28], p: [0, -FOREARM - 0.02, 0] })

  const hand: V3 = [0, -FOREARM - 0.02, 0]
  if (hold === 'axe') p.absorb(axeParts(k), { r: [0.62, 0, 0], p: hand })
  else if (hold === 'hammer') p.absorb(hammerParts(k), { r: [0.46, 0, 0], p: hand })
  else if (hold === 'tool') p.absorb(toolParts(k), { r: [0.45, 0, 0], p: hand })
  else if (hold === 'spear') p.absorb(spearParts(k), { r: [-0.16, 0, 0], p: hand })
  else if (hold === 'shield') {
    // 방패는 손이 아니라 팔뚝에 묶인다. 위치를 팔꿈치 쪽으로 끌어올린다.
    p.absorb(shieldParts(k), { p: [0, -FOREARM * 0.62, 0.16] })
  }
  return p.merge()
}

// ─────────────────────────────────────────────────────────── 캐시

interface GeoSet {
  thigh: THREE.BufferGeometry
  shin: THREE.BufferGeometry
  torso: THREE.BufferGeometry
  head: THREE.BufferGeometry
  upper: THREE.BufferGeometry
  foreL: THREE.BufferGeometry
  foreR: THREE.BufferGeometry
  /** 족장만 있다. 1인칭에서 꺼야 해서 몸통과 따로 둔다. */
  cloak: THREE.BufferGeometry | null
  fallen: THREE.BufferGeometry
}

const CACHE = new Map<string, GeoSet>()

function geoSet(role: WarriorRole, faction: Faction): GeoSet {
  const key = `${role}:${faction}`
  const hit = CACHE.get(key)
  if (hit) return hit
  const k = skinFor(faction)
  const set: GeoSet = {
    thigh: thighGeo(k),
    shin: shinGeo(k),
    torso: torsoGeo(k, role),
    head: headGeo(k, role),
    upper: upperArmGeo(k),
    foreL: foreArmGeo(k, role === 'shield' ? 'shield' : 'none'),
    foreR: foreArmGeo(k, holdOf(role)),
    cloak: role === 'chief' ? cloakGeo(k) : null,
    fallen: fallenGeo(k, role),
  }
  CACHE.set(key, set)
  return set
}

/**
 * 쓰러진 몸 — 통째로 한 덩어리.
 *
 * 서 있는 뼈대를 그대로 눕히면 각목이 넘어지는 것처럼 보인다. 그래서
 * **서 있는 좌표계에서 팔다리를 늘어뜨린 자세를 잡고**, 다 합친 뒤에 통째로
 * 눕힌다. 관절이 겹쳐 매달리는 구조라 축을 하나씩 돌리는 방식으로는 표현이
 * 안 되고, 행렬을 쌓아야 한다.
 *
 * 다 굽고 나면 발이 원점, 머리가 +z를 향해 엎드린 모양이 된다. 쓰러지는
 * 동작은 바깥에서 이 몸을 세웠다가(`rotation.x = -π/2`) 도로 눕히는 것으로
 * 만든다 — 그러면 넘어지는 내내 팔다리가 이미 풀려 있다.
 *
 * 조명을 안 받는 재질로 그리므로(`Actors.syncCorpses`) 드로우콜 하나면 된다.
 */
function fallenGeo(k: Skin, role: WarriorRole): THREE.BufferGeometry {
  const M = (
    parent: THREE.Matrix4 | null,
    px: number,
    py: number,
    pz: number,
    ex: number,
    ez: number,
  ): THREE.Matrix4 => {
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(ex, 0, ez, 'XZY'))
      .setPosition(px, py, pz)
    return parent ? new THREE.Matrix4().multiplyMatrices(parent, m) : m
  }

  // 뒤로 젖혀지며 무너진 몸통. 여기에 머리와 팔이 매달린다.
  const torso = M(null, 0, HIP_Y, 0, -0.32, 0.12)
  const p = new Parts()
    .addBuilt(torsoGeo(k, role), { m: torso })
    .addBuilt(headGeo(k, role), { m: M(torso, 0, NECK_Y, 0, 0.5, 0.35) })

  // 다리는 서로 다르게 접는다. 좌우가 같으면 인형처럼 보인다.
  const legs: [number, number, number, number][] = [
    [0.27, 0.38, -0.55, 0.95],
    [-0.27, -0.14, 0.24, 1.35],
  ]
  for (const [x, splay, hip, knee] of legs) {
    const thigh = M(null, x, HIP_Y, 0, hip, splay)
    p.addBuilt(thighGeo(k), { m: thigh }).addBuilt(shinGeo(k), {
      m: M(thigh, 0, -THIGH, 0, knee, 0),
    })
  }

  // 팔은 벌린 채로 던져진다.
  const arms: [number, number, number, number, number, Hold][] = [
    [SHOULDER_X, 0.95, -0.35, 0.5, 0.45, role === 'shield' ? 'shield' : 'none'],
    [-SHOULDER_X, -1.15, -0.2, 0.35, -0.5, holdOf(role)],
  ]
  for (const [x, splay, lift, elbow, elbowZ, hold] of arms) {
    const upper = M(torso, x, SHOULDER_Y, 0, lift, splay)
    p.addBuilt(upperArmGeo(k), { m: upper }).addBuilt(foreArmGeo(k, hold), {
      m: M(upper, 0, -UPPER_ARM, 0, elbow, elbowZ),
    })
  }

  const out = p.merge()
  // 통째로 눕힌다. +y(선 몸의 위)가 +z로 가고, 몸의 앞면이 땅을 본다.
  out.rotateX(Math.PI / 2)
  // 누운 몸의 두께가 이제 y축에 놓인다. 지면을 뚫지 않게 들어 올린다.
  out.computeBoundingBox()
  out.translate(0, -out.boundingBox!.min.y + 0.04, 0)
  out.computeBoundingSphere()
  return out
}

export function fallenGeometry(role: WarriorRole, faction: Faction): THREE.BufferGeometry {
  return geoSet(role, faction).fallen
}

/** 페이지가 끝날 때까지 캐시는 살려 둔다. 판을 다시 시작해도 다시 굽지 않는다. */
export function disposeWarriorCache(): void {
  for (const set of CACHE.values()) {
    for (const g of Object.values(set)) g?.dispose()
  }
  CACHE.clear()
  for (const g of Object.values(SRC)) g.dispose()
}

// ─────────────────────────────────────────────────────────── 뼈대

export interface Limb {
  upper: THREE.Group
  lower: THREE.Group
}

export interface Rig {
  root: THREE.Group
  /** 위아래로 뛰고 좌우로 기우는 곳. 골반 위 전부가 여기 매달린다. */
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  /** 족장의 망토. 1인칭에서 끈다. 부하는 null이다. */
  cloak: THREE.Mesh | null
  legL: Limb
  legR: Limb
  /** 왼팔 — 방패병은 여기에 방패가 붙는다. */
  armL: Limb
  /** 오른팔 — 무기를 든 팔. 공격 동작이 여기서 나온다. */
  armR: Limb
  mat: THREE.MeshStandardMaterial
  role: WarriorRole

  // 렌더 전용 상태. 시뮬레이션은 이걸 모른다.
  phase: number
  gait: number
  speed: number
  swing: number
  brace: number
  recoil: number
  seed: number
}

function limb(
  parent: THREE.Object3D,
  upperGeo: THREE.BufferGeometry,
  lowerGeo: THREE.BufferGeometry,
  mat: THREE.Material,
  at: V3,
  jointY: number,
): Limb {
  const upper = new THREE.Group()
  upper.position.set(at[0], at[1], at[2])
  upper.add(new THREE.Mesh(upperGeo, mat))
  parent.add(upper)

  const lower = new THREE.Group()
  lower.position.y = jointY
  lower.add(new THREE.Mesh(lowerGeo, mat))
  upper.add(lower)

  return { upper, lower }
}

/**
 * 1인칭 시야에 드는 팔 — 도끼를 든 오른팔 하나.
 *
 * ## 왜 진짜 몸을 안 쓰는가
 *
 * 처음엔 아바타의 실제 몸을 그리고 머리만 숨겼다. 안 됐다 — 이 뼈대는 **부감에서
 * 4~6픽셀로 읽히라고** 머리를 키우고 목을 짧게 잡은 비율이라, 눈높이가 어깨보다
 * 겨우 0.5 위다. 안에서 내려다보면 자기 가슴 윗면과 어깨판이 화면을 덮는다.
 * 카메라를 얼굴 앞으로 밀어도 마찬가지였다.
 *
 * 그래서 FPS가 실제로 쓰는 방법을 쓴다. 시야에 드는 팔은 **몸의 일부가 아니라
 * 따로 만든 소품**이고, 카메라에 매달려 화면 오른쪽 아래에 놓인다. 비율을
 * 몸과 맞출 필요가 없으니 부감 가독성과 1인칭 실감이 서로를 안 잡아먹는다.
 *
 * 걷는 위상은 아바타 뼈대에서 그대로 빌려 온다(`poseViewArm`) — 발과 팔이
 * 어긋날 수가 없다.
 */
export interface ViewArm {
  root: THREE.Group
  upper: THREE.Group
  lower: THREE.Group
  mat: THREE.MeshStandardMaterial
}

/**
 * 시야의 팔이 쉬는 자리. 흔들림은 여기를 기준으로 오르내린다.
 *
 * **작고 구석에 있어야 한다.** 처음엔 0.62배로 뒀는데 도끼날이 화면 높이의
 * 60%를 먹고 한가운데를 막았다. 뷰모델은 "내가 몸을 갖고 있다"만 말하면 되고,
 * 그 말을 하는 데 화면을 가릴 필요는 없다.
 */
const VIEW_ARM_HOME = { x: 0.5, y: -0.72 }
// 도끼 때 쓰던 0.34에서 내렸다. 망치는 머리가 네모난 덩어리라 같은 배율에서
// 도끼보다 훨씬 크게 읽히고, 화면 오른쪽 아래 구석에 있어야 할 것이
// 한가운데까지 올라왔다.
const VIEW_ARM_SCALE = 0.26
const VIEW_ARM_ROLL = -2.5
const VIEW_ARM_ELBOW = -0.42

export function buildViewArm(faction: Faction): ViewArm {
  const k = skinFor(faction)
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.66,
    metalness: 0.08,
  })

  // 뷰모델은 **전용으로 조립한다.** 몸에 쓰는 `foreR`은 도끼가 정해진 각도로
  // 구워져 있어서, 화면 오른쪽 아래에서 올라오는 구도로는 도끼가 밖으로 나간다.
  const upperGeo = upperArmGeo(k)
  const lowerGeo = foreArmGeo(k, 'none')
  // 강림한 신이 드는 것은 **망치**다(`holdOf`). 손 기준으로 뒤집어 단다 —
  // 팔뚝이 위를 향하므로 그냥 달면 무기가 팔뚝 반대편으로 뻗어 화면 밖으로
  // 나간다.
  const armGeo = hammerParts(k).merge()
  armGeo.rotateX(Math.PI)
  armGeo.rotateZ(0.5)
  armGeo.translate(0, -FOREARM - 0.02, 0)

  const root = new THREE.Group()
  const upper = new THREE.Group()
  upper.add(new THREE.Mesh(upperGeo, mat))
  root.add(upper)

  const lower = new THREE.Group()
  lower.position.y = -UPPER_ARM
  lower.add(new THREE.Mesh(lowerGeo, mat), new THREE.Mesh(armGeo, mat))
  upper.add(lower)

  // 팔은 화면 밖 오른쪽 아래에서 시작해 가운데로 올라온다. 어깨를 화면 밖에
  // 두어야 "몸에 달린 팔"로 읽히고, 팔꿈치만 보이면 붕 뜬 소품이 된다.
  root.position.set(VIEW_ARM_HOME.x, VIEW_ARM_HOME.y, -1.0)
  root.rotation.set(0.22, 0, VIEW_ARM_ROLL)
  root.scale.setScalar(VIEW_ARM_SCALE)
  lower.rotation.x = VIEW_ARM_ELBOW

  return { root, upper, lower, mat }
}

/**
 * 시야의 팔을 걸음에 맞춰 흔든다.
 *
 * `phase`와 `gait`는 아바타 뼈대의 것을 그대로 받는다. 카메라 흔들림과 같은
 * 위상이되 **반대로** 움직이게 해서, 화면이 내려갈 때 팔이 올라온다 — 그래야
 * 팔이 화면에 붙어 있지 않고 몸에 달린 것처럼 보인다.
 */
export function poseViewArm(a: ViewArm, phase: number, gait: number, t: number): void {
  const sw = Math.sin(phase)
  const idle = 1 - gait
  a.root.position.x = VIEW_ARM_HOME.x + Math.cos(phase) * 0.025 * gait
  a.root.position.y =
    VIEW_ARM_HOME.y - sw * 0.045 * gait + Math.sin(t * 1.7) * 0.011 * idle
  a.root.rotation.z = VIEW_ARM_ROLL + sw * 0.06 * gait
  a.lower.rotation.x = VIEW_ARM_ELBOW - sw * 0.1 * gait
}

export function buildRig(role: WarriorRole, faction: Faction, seed: number): Rig {
  const g = geoSet(role, faction)
  // 유닛마다 재질 하나. 색은 정점에 있으므로 흰색으로 두고, 이 재질이 하는
  // 일은 오직 피격 섬광(`emissive`)뿐이다.
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.66,
    metalness: 0.08,
  })

  const root = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = HIP_Y
  root.add(body)

  const legL = limb(body, g.thigh, g.shin, mat, [0.27, 0, 0], -THIGH)
  const legR = limb(body, g.thigh, g.shin, mat, [-0.27, 0, 0], -THIGH)

  const torso = new THREE.Group()
  body.add(torso)
  torso.add(new THREE.Mesh(g.torso, mat))

  const head = new THREE.Group()
  head.position.y = NECK_Y
  head.add(new THREE.Mesh(g.head, mat))
  torso.add(head)

  const cloak = g.cloak ? new THREE.Mesh(g.cloak, mat) : null
  if (cloak) torso.add(cloak)

  const armL = limb(torso, g.upper, g.foreL, mat, [SHOULDER_X, SHOULDER_Y, 0], -UPPER_ARM)
  const armR = limb(torso, g.upper, g.foreR, mat, [-SHOULDER_X, SHOULDER_Y, 0], -UPPER_ARM)

  return {
    root,
    body,
    torso,
    head,
    cloak,
    legL,
    legR,
    armL,
    armR,
    mat,
    role,
    phase: seed * 6.28,
    gait: 0,
    speed: 0,
    swing: 0,
    brace: 0,
    recoil: 0,
    seed,
  }
}

// ─────────────────────────────────────────────────────────── 동작

export interface PoseInput {
  /** 렌더 프레임 간격(초). 시뮬레이션 dt와 무관하다. */
  dt: number
  /** 이번 프레임에 실제로 움직인 거리 / dt. 월드 단위 기준. */
  speed: number
  /** 내지르는 연출값 1→0. 때린 직후가 1이다. */
  lunge: number
  /** 때리기 직전 0→1. 예비 동작이 없으면 타격이 안 보인다. */
  windup: number
  /** 방패벽이 막아낸 순간. */
  guard: number
  /** 맞은 직후. */
  flash: number
  /** 지금 교전 중인가. 방패를 들고 있을지를 여기서 정한다. */
  fighting: boolean
  /** 숨쉬기용 시계. */
  time: number
}

/** 한 주기(양발 한 걸음씩)에 나아가는 거리. 월드 단위. */
const CYCLE_DIST = 6.4
const LEG_SWING = 0.84
const ARM_SWING = 0.52

/**
 * 역할마다 때리는 모양이 다르다.
 *
 * 도끼병은 **머리 위로 올렸다 내려찍고**, 방패병은 **창을 앞으로 지른다**.
 * 사거리가 다른 두 유닛(2.6 대 3.2)이 같은 동작을 하면 왜 사거리가 다른지
 * 화면이 설명하지 못한다.
 */
const ATTACK = {
  axe: { cock: 2.3, hit: -0.95, elbowCock: 1.3, elbowHit: -0.5, lean: 0.34, twist: 0.3 },
  chief: { cock: 2.15, hit: -0.95, elbowCock: 1.2, elbowHit: -0.5, lean: 0.3, twist: 0.28 },
  shield: { cock: 0.8, hit: -1.05, elbowCock: 1.0, elbowHit: -0.95, lean: 0.24, twist: 0.16 },
  // 일꾼은 공격하지 않는다. 표를 채워 두는 것은 인덱싱 때문이지 쓰이지 않는다.
  worker: { cock: 0.9, hit: -0.6, elbowCock: 0.8, elbowHit: -0.4, lean: 0.2, twist: 0.14 },
} as const

/** 지수적으로 목표를 따라간다. 프레임 간격이 흔들려도 같은 속도로 붙는다. */
function chase(cur: number, to: number, dt: number, rate: number): number {
  return cur + (to - cur) * (1 - Math.exp(-dt * rate))
}

/**
 * 뼈대에 자세를 먹인다.
 *
 * 핵심은 **걸음을 시간이 아니라 거리에 묶는 것**이다. 시간에 묶으면 유닛이
 * 느려질 때 발이 땅에서 미끄러지고, 그 미끄러짐 하나가 애니메이션을 통째로
 * 가짜로 만든다. 지휘 반경 보너스로 이동 속도가 바뀌는 게임이라 특히 그렇다.
 */
export function poseRig(rig: Rig, p: PoseInput): void {
  const dt = Math.min(0.05, Math.max(0.0005, p.dt))

  // 측정한 속도는 프레임마다 튄다(고정 타임스텝이라 어떤 프레임은 0이다).
  // 걸음 위상을 여기에 직접 물리면 발이 떨리므로 한 번 눌러서 쓴다.
  rig.speed = chase(rig.speed, p.speed, dt, 9)
  const moving = rig.speed > 0.7
  rig.gait = chase(rig.gait, moving ? 1 : 0, dt, 9)
  rig.phase += (rig.speed / CYCLE_DIST) * Math.PI * 2 * dt

  const w = rig.phase
  const g = rig.gait
  const sw = Math.sin(w)
  const rest = 1 - g

  // ── 다리. 뒤로 보낸 다리만 무릎을 접는다 — 무릎이 없으면 죽마를 짚은 것 같다.
  const kneeL = Math.max(0, Math.sin(w - Math.PI / 2)) * 1.25
  const kneeR = Math.max(0, Math.sin(w + Math.PI / 2)) * 1.25
  rig.legL.upper.rotation.x = sw * LEG_SWING * g
  rig.legR.upper.rotation.x = -sw * LEG_SWING * g
  rig.legL.lower.rotation.x = (kneeL + 0.1) * g
  rig.legR.lower.rotation.x = (kneeR + 0.1) * g

  // ── 몸통. 위아래로 뛰고 좌우로 기운다. 이게 빠지면 다리만 움직이는 마네킹이다.
  rig.body.position.y = HIP_Y + Math.abs(sw) * 0.12 * g + Math.sin(p.time * 1.7 + rig.seed) * 0.03 * rest
  rig.body.rotation.z = sw * 0.05 * g

  // ── 공격. 예비 동작(windup)으로 올렸다가 타격(lunge)에서 내려찍는다.
  //    둘은 절대 동시에 높지 않다 — 때리는 순간 `swingIn`이 리셋되어 windup이
  //    0으로 떨어지고 lunge가 1이 된다. 그래서 그냥 더해도 된다.
  const A = ATTACK[rig.role]
  rig.swing = chase(rig.swing, A.cock * p.windup + A.hit * p.lunge, dt, 22)
  const cock = Math.max(0, rig.swing) / A.cock
  const chop = Math.max(0, -rig.swing) / -A.hit

  // ── 방패. **막아낸 순간에 확 올라간다.** 이 게임에서 지휘 반경의 값어치를
  //    말하는 장치가 하나 더 생기는 자리다(금색 섬광에 이어).
  const braceTo = Math.max(p.guard, p.fighting ? 0.5 : 0)
  rig.brace = chase(rig.brace, braceTo, dt, p.guard > 0.5 ? 26 : 12)
  const b = rig.brace

  rig.recoil = chase(rig.recoil, p.flash, dt, 20)

  rig.torso.rotation.x =
    -0.1 * g + 0.12 * cock - A.lean * chop - 0.16 * rig.recoil + Math.sin(p.time * 1.7 + rig.seed + 0.6) * 0.025 * rest
  rig.torso.rotation.y = -sw * 0.16 * g - A.twist * cock + A.twist * 0.85 * chop
  rig.torso.rotation.z = 0

  // 머리는 앞을 본다. 몸통이 도는 만큼 되돌리지 않으면 매번 딴 데를 본다.
  rig.head.rotation.y = -rig.torso.rotation.y * 0.6
  rig.head.rotation.x = -rig.torso.rotation.x * 0.5

  // ── 왼팔.
  if (rig.role === 'shield') {
    rig.armL.upper.rotation.x = -0.2 - 1.0 * b
    rig.armL.upper.rotation.z = 0.12 - 0.42 * b
    rig.armL.lower.rotation.x = 0.32 + 1.2 * b
  } else {
    rig.armL.upper.rotation.x = -sw * ARM_SWING * g
    rig.armL.upper.rotation.z = 0.1
    rig.armL.lower.rotation.x = 0.28 + Math.max(0, sw) * 0.3 * g
  }

  // ── 오른팔(무기). 걸을 때도 흔들리지만 무기를 들었으니 덜 흔든다.
  rig.armR.upper.rotation.x = -0.1 + rig.swing + sw * ARM_SWING * 0.5 * g
  rig.armR.upper.rotation.z = -0.12 - 0.3 * cock
  rig.armR.lower.rotation.x = 0.5 + A.elbowCock * cock + A.elbowHit * chop
}
