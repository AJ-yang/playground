/**
 * 시드 기반 난수 (mulberry32).
 *
 * `Math.random` 대신 시드 RNG를 쓰는 이유는 두 가지다. 하나는 버그 재현이고,
 * 다른 하나는 **거울상 맵 생성**이다(GDD 4.2) — 반쪽을 뽑아 회전 복사하려면
 * 그 반쪽이 재현 가능해야 한다. 그리고 나중에 락스텝을 얹을 때, 시뮬레이션
 * 안에서 `Math.random`을 한 번이라도 부르면 두 클라이언트가 갈라진다.
 */
export class Rng {
  private state: number

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** [min, max] 정수 */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!
  }
}
