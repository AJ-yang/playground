/**
 * 평면 벡터. 게임 로직은 전부 2D(xz 평면)에서 돈다.
 *
 * 3D는 **보여주기 위한 것일 뿐** 판정에 관여하지 않는다. 지형에 높낮이가 있어도
 * 유닛은 평면 위를 움직이고, 사거리와 지휘 반경도 평면 거리로 잰다. 이렇게
 * 갈라두면 나중에 렌더링을 통째로 바꿔도 밸런스가 흔들리지 않는다.
 */
import { hypot } from './det'

export interface Vec2 {
  x: number
  z: number
}

export function vec(x: number, z: number): Vec2 {
  return { x, z }
}

export function len(a: Vec2): number {
  return hypot(a.x, a.z)
}

export function dist(a: Vec2, b: Vec2): number {
  return hypot(a.x - b.x, a.z - b.z)
}

/** 제곱 거리. 비교만 할 때는 이쪽이 싸다. */
export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

export function norm(a: Vec2): Vec2 {
  const l = hypot(a.x, a.z)
  return l < 1e-6 ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l }
}

/** a에서 b를 향해 최대 maxStep만큼 이동한 지점. */
export function moveToward(a: Vec2, b: Vec2, maxStep: number): Vec2 {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const l = hypot(dx, dz)
  if (l <= maxStep || l < 1e-6) return { x: b.x, z: b.z }
  const k = maxStep / l
  return { x: a.x + dx * k, z: a.z + dz * k }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
