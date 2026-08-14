import { describe, expect, it } from 'vitest'
import { makeRng, seededShuffle } from './rng'

describe('makeRng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('0 이상 1 미만을 낸다', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('정수가 아닌 시드는 거부한다', () => {
    // Math.random()을 그대로 넘기면 소수부가 잘려 전 세션이 시드 0으로 붕괴한다.
    expect(() => makeRng(0.7314)).toThrow(TypeError)
    expect(() => makeRng(Math.random())).toThrow(TypeError)
  })
})

describe('seededShuffle', () => {
  it('원본을 변형하지 않는다', () => {
    const input = [1, 2, 3, 4, 5]
    seededShuffle(input, makeRng(3))
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('같은 원소를 모두 보존한다', () => {
    const out = seededShuffle([1, 2, 3, 4, 5], makeRng(3))
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5])
  })

  it('같은 시드는 같은 순서를 낸다', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], makeRng(9))).toEqual(seededShuffle([1, 2, 3, 4, 5], makeRng(9)))
  })

  it('알려진 시드는 알려진 순열을 낸다', () => {
    // 회귀 고정값. 위의 세 테스트는 전부 항등 함수(`items => [...items]`)로도 통과하므로
    // 실제 순열을 박아두지 않으면 셔플이 없어져도 아무도 눈치채지 못한다.
    expect(seededShuffle([0, 1, 2, 3, 4], makeRng(9))).toEqual([2, 1, 4, 3, 0])
    expect(seededShuffle([0, 1, 2, 3], makeRng(1))).toEqual([3, 1, 0, 2])
  })

  it('원소 순서를 실제로 바꾼다', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(seededShuffle(input, makeRng(9))).not.toEqual(input)
  })
})
