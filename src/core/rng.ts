/**
 * 시드 기반 난수 (mulberry32).
 *
 * Math.random 대신 시드 RNG를 쓰는 이유: 같은 시드 + 같은 입력이면 항상 같은
 * 전개가 나오므로 밸런스 테스트와 버그 재현이 가능해진다.
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
