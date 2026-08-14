import { describe, expect, it } from 'vitest'
import { breakdown } from './breakdown'
import type { Gyeol, GyeolScore } from './types'

/** 이름만 쓰므로 조건은 비워 둔다. */
const gyeol = (id: string, name: string): Gyeol => ({
  id,
  name,
  description: '',
  catchphrase: '',
  essay: [],
  signs: [],
  emoji: '🎬',
  hue: 0,
  keywords: [],
  genres: [],
})

const TYPES = [
  gyeol('a', '가의 결'),
  gyeol('b', '나의 결'),
  gyeol('c', '다의 결'),
  gyeol('d', '라의 결'),
]

const scores = (...pairs: [string, number][]): GyeolScore[] =>
  pairs.map(([id, score]) => ({ id, score }))

describe('breakdown', () => {
  it('점수가 높은 순으로 3개를 낸다', () => {
    const result = breakdown(scores(['a', 6], ['b', 3], ['c', 1], ['d', 0]), TYPES, 3)
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(result.map((r) => r.name)).toEqual(['가의 결', '나의 결', '다의 결'])
  })

  it('상위 3개의 합을 100으로 본다', () => {
    // 4위(d)는 분모에 들어가지 않는다. 전체 합(11)을 분모로 쓰면 45/27/18이
    // 되지만, 카드에 보이는 셋의 합(10)이 분모라 50/30/20이어야 한다.
    const result = breakdown(scores(['a', 5], ['b', 3], ['c', 2], ['d', 1]), TYPES, 3)
    expect(result.map((r) => r.percent)).toEqual([50, 30, 20])
  })

  it('나누어떨어지지 않아도 합이 정확히 100이다', () => {
    // 1/3씩이면 33.33…이라 그냥 반올림하면 99가 된다. 남는 1은 가장 큰
    // 나머지를 가진 쪽이 가져가야 한다.
    const result = breakdown(scores(['a', 1], ['b', 1], ['c', 1]), TYPES, 3)
    expect(result.map((r) => r.percent)).toEqual([34, 33, 33])
    expect(result.reduce((sum, r) => sum + r.percent, 0)).toBe(100)
  })

  it('반올림이 몰려도 합이 100을 넘지 않는다', () => {
    // 각 26.66…%. 순진하게 올리면 27+27+27+20 = 101이 된다.
    const result = breakdown(scores(['a', 4], ['b', 4], ['c', 4]), TYPES, 3)
    expect(result.reduce((sum, r) => sum + r.percent, 0)).toBe(100)
  })

  it('결이 요청한 수보다 적으면 있는 만큼만 낸다', () => {
    const result = breakdown(scores(['a', 2], ['b', 1]), TYPES, 3)
    expect(result).toHaveLength(2)
    expect(result.reduce((sum, r) => sum + r.percent, 0)).toBe(100)
  })

  it('점수가 전부 0이면 빈 배열을 낸다', () => {
    // 0으로 나누면 NaN이 카드에 찍힌다. 보여줄 것이 없으면 안 보여준다.
    expect(breakdown(scores(['a', 0], ['b', 0]), TYPES, 3)).toEqual([])
  })

  it('정의에 없는 결은 건너뛴다', () => {
    const result = breakdown(scores(['a', 5], ['없음', 4], ['b', 1]), TYPES, 3)
    expect(result.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('색을 함께 낸다', () => {
    // 막대를 결 고유색으로 칠하므로 hue가 따라와야 한다.
    const types = [{ ...gyeol('a', '가의 결'), hue: 210 }]
    expect(breakdown(scores(['a', 1]), types, 3)[0].hue).toBe(210)
  })
})
