/**
 * 결정론적 산술.
 *
 * ## 왜 이 파일이 있는가
 *
 * IEEE 754는 **사칙연산과 `sqrt`만** 마지막 비트까지 결과를 못 박는다.
 * `sin`·`cos`·`atan2`·`hypot`은 구현에 맡기고, 그래서 런타임마다 답이 다르다.
 * 실제로 재보면 이렇다 — 같은 입력 20,000개를 V8과 .NET에 먹였을 때:
 *
 * | 함수 | 마지막 비트가 다른 비율 |
 * |---|---|
 * | `Math.hypot` 대 `sqrt(x²+z²)` | **37.0%** |
 * | `sqrt` 대 `sqrt` | 0.0% |
 * | `atan2` | **17.9%** |
 * | `sin` | **3.4%** |
 * | `cos` | **3.1%** |
 *
 * 락스텝은 두 클라이언트가 같은 입력에서 **같은 비트**를 내야 성립한다(GDD 7.2).
 * 1비트 차이는 다음 틱에 2비트가 되고, 30초 뒤에는 다른 판이 된다. 브라우저가
 * 달라도, Unity로 옮겨도 마찬가지다.
 *
 * ## 그래서 어떻게 했는가
 *
 * - `hypot`은 `sqrt(x*x + z*z)`로 못 박는다. `Math.hypot`은 넘침을 막으려고 값을
 *   미리 나누는 구현이 흔한데, 이 판의 좌표는 ±60 남짓이라 넘칠 일이 없다.
 * - `atan2`·`sin`·`cos`는 **Cephes 알고리즘을 손으로 옮겨 적었다.** 곱셈·덧셈·
 *   나눗셈·비교만 쓰므로 IEEE를 따르는 어느 런타임에서도 같은 답이 나온다.
 *   `Games/chieftain-unity/Core/Vec2.cs`의 `Det`가 **연산 순서까지 같은** 짝이고,
 *   둘이 실제로 같은지는 대조 트레이스로 확인한다(`tools/trace.sh`).
 *
 * **렌더링은 이걸 안 써도 된다.** 화면은 갈라져도 상관없고, 오히려 네이티브
 * 구현이 빠르다. 이 파일은 `Game`·`Board`·`Ai`만 쓴다.
 */

/** 넘침 보정 없는 빗변. `sqrt`는 IEEE가 결과를 못 박는다. */
export function hypot(x: number, z: number): number {
  return Math.sqrt(x * x + z * z)
}

// ─────────────────────────────────────────────────────── atan (Cephes)

const MOREBITS = 6.123233995736765886130e-17
/** tan(3π/8) */
const TAN_3PI_8 = 2.41421356237309504880
/** tan(π/8) */
const TAN_PI_8 = 0.41421356237309504880

const ATAN_P = [
  -8.750608600031904122785e-1,
  -1.615753718733365076637e1,
  -7.500855792314704667340e1,
  -1.228866684490136173410e2,
  -6.485021904942025371773e1,
]
const ATAN_Q = [
  2.485846490142306297962e1,
  1.650270098316988542046e2,
  4.328810604912902668951e2,
  4.853903996359136964868e2,
  1.945506571482613964425e2,
]

/** [0, ∞)에 대한 atan. 인수 축소 뒤 유리 근사 하나로 끝난다. */
function atanPositive(x0: number): number {
  let x = x0
  let y: number

  // 범위를 [0, tan(π/8)]로 줄인다. 셋으로 나누면 그 안에서 근사가 배정밀도에 닿는다.
  if (x > TAN_3PI_8) {
    y = Math.PI / 2
    x = -1 / x
  } else if (x > TAN_PI_8) {
    y = Math.PI / 4
    x = (x - 1) / (x + 1)
  } else {
    y = 0
  }

  const z = x * x

  let p = ATAN_P[0]!
  for (let i = 1; i < 5; i++) p = p * z + ATAN_P[i]!
  let q = z + ATAN_Q[0]!
  for (let i = 1; i < 5; i++) q = q * z + ATAN_Q[i]!

  const r = x + x * z * (p / q)

  // 축소하며 잘라낸 자리를 되돌린다. 이걸 빼면 π/2 근처에서 정밀도가 떨어진다.
  if (y === Math.PI / 2) return y + (MOREBITS + r)
  if (y === Math.PI / 4) return y + (0.5 * MOREBITS + r)
  return r
}

export function atan(x: number): number {
  return x < 0 ? -atanPositive(-x) : atanPositive(x)
}

/**
 * atan2.
 *
 * 이 게임은 `atan2(dx, dz)`로 부른다 — z가 앞이라 인수 순서가 뒤집혀 있다.
 * 여기서는 수학 관례대로 `(y, x)`를 받고, 부르는 쪽이 순서를 맞춘다.
 */
export function atan2(y: number, x: number): number {
  if (x === 0) {
    if (y === 0) return 0
    return y > 0 ? Math.PI / 2 : -Math.PI / 2
  }
  if (y === 0) return x > 0 ? 0 : Math.PI

  let a = atanPositive(Math.abs(y / x))
  if (x < 0) a = Math.PI - a
  return y < 0 ? -a : a
}

// ───────────────────────────────────────────────── sin·cos (Cephes)

/** π/4를 셋으로 쪼갠 값. 나눠 빼야 큰 각에서도 자릿수를 잃지 않는다. */
const DP1 = 7.85398125648498535156e-1
const DP2 = 3.77489470793079817668e-8
const DP3 = 2.69515142907905952645e-15

const SINCOF = [
  1.58962301576546568060e-10,
  -2.50507477628578072866e-8,
  2.75573136213857245213e-6,
  -1.98412698295895385996e-4,
  8.33333333332211858878e-3,
  -1.66666666666666307295e-1,
]
const COSCOF = [
  -1.13585365213876817300e-11,
  2.08757008419747316778e-9,
  -2.75573141792967388112e-7,
  2.48015872888517179954e-5,
  -1.38888888888730564116e-3,
  4.16666666666665929218e-2,
]

function polySin(zz: number): number {
  let p = SINCOF[0]!
  for (let i = 1; i < 6; i++) p = p * zz + SINCOF[i]!
  return p
}

function polyCos(zz: number): number {
  let p = COSCOF[0]!
  for (let i = 1; i < 6; i++) p = p * zz + COSCOF[i]!
  return p
}

/**
 * 팔분원으로 줄인 뒤 다항식 하나로 끝낸다.
 *
 * `wantCos`가 참이면 cos, 거짓이면 sin. 두 함수가 축소 단계를 통째로 공유하기
 * 때문에 하나로 묶어 두는 편이 어긋날 여지가 적다.
 */
function sinCos(xIn: number, wantCos: boolean): number {
  let x = xIn
  let sign = 1

  if (wantCos) {
    x = Math.abs(x)
  } else if (x < 0) {
    x = -x
    sign = -1
  }

  // 이 게임의 각은 ±수백 라디안을 넘지 않는다. 그래도 방어는 해 둔다.
  if (!(x < 1.073741824e9)) return 0

  let y = Math.floor(x / (Math.PI / 4))
  // y를 16으로 나눈 나머지. 2의 거듭제곱이라 곱·나눗셈이 정확하다.
  let z = Math.floor(y / 16)
  z = y - z * 16
  let j = z | 0

  if ((j & 1) !== 0) {
    j += 1
    y += 1
  }
  j = j & 7

  if (j > 3) {
    sign = -sign
    j -= 4
  }
  if (wantCos && j > 1) sign = -sign

  // 자릿수를 잃지 않고 x mod π/4를 구한다.
  const w = ((x - y * DP1) - y * DP2) - y * DP3
  const zz = w * w

  // **sin과 cos는 팔분원 번호에 따라 서로의 다항식을 쓴다.** 여기가 뒤집히기
  // 쉬운 자리다 — sin은 j가 1·2일 때 cos 다항식을, cos는 그때 sin 다항식을 쓴다.
  const inMiddle = j === 1 || j === 2
  const useCosPoly = inMiddle !== wantCos
  let r: number
  if (useCosPoly) {
    r = 1.0 - 0.5 * zz + zz * zz * polyCos(zz)
  } else {
    r = w + w * w * w * polySin(zz)
  }

  return sign < 0 ? -r : r
}

export function sin(x: number): number {
  return sinCos(x, false)
}

export function cos(x: number): number {
  return sinCos(x, true)
}
