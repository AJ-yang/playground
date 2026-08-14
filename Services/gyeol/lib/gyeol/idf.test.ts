import { describe, expect, it } from 'vitest'
import { computeIdf } from './idf'

describe('computeIdf', () => {
  it('흔한 키워드가 드문 키워드보다 낮은 점수를 받는다', () => {
    const idf = computeIdf(2, [[0], [0], [0], [1]])
    expect(idf[0]).toBeLessThan(idf[1])
  })

  it('아무 작품에도 없는 키워드도 점수를 낸다', () => {
    // 0으로 나누기가 나면 매칭이 NaN으로 죽는다
    const idf = computeIdf(2, [[0], [0]])
    expect(Number.isFinite(idf[1])).toBe(true)
    expect(idf[1]).toBeGreaterThan(0)
  })

  it('어휘 길이만큼 반환한다', () => {
    expect(computeIdf(5, [[0, 1]])).toHaveLength(5)
  })

  it('한 작품이 같은 키워드를 두 번 가져도 한 번으로 센다', () => {
    const dup = computeIdf(1, [[0, 0], [0, 0]])
    const single = computeIdf(1, [[0], [0]])
    expect(dup[0]).toBeCloseTo(single[0])
  })

  it('모든 점수가 양수다', () => {
    const idf = computeIdf(3, [[0, 1, 2], [0, 1, 2]])
    for (const v of idf) expect(v).toBeGreaterThan(0)
  })
})
