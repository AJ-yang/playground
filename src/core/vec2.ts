/** 2D 벡터. 게임 전반의 좌표는 모두 픽셀 기준이며, 타일 좌표는 별도로 명시한다. */
export interface Vec2 {
  x: number
  y: number
}

export function vec(x: number, y: number): Vec2 {
  return { x, y }
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s }
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y)
}

/** 제곱 거리. 반경 비교처럼 sqrt가 필요 없는 곳에서 사용한다. */
export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function normalize(a: Vec2): Vec2 {
  const len = Math.hypot(a.x, a.y)
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
