import { describe, expect, it } from 'vitest'
import { cosine, matchUp } from './match-up'
import { makeGyeol } from './gyeol.fixture'
import type { Catalog, CatalogEntry } from './types'

const VOCAB = ['z1', 'z2', 'p1', 'r1']
const IDF = [4, 2, 3, 5]
const work = (i: number, k: number[]): CatalogEntry => ({
  i, m: 0, t: `작품${i}`, y: 2020, p: 'a.jpg', g: [], k, ko: 0,
})
const catalog: Catalog = { vocabulary: VOCAB, idf: IDF, works: [] }

const TYPES = [
  makeGyeol({ id: 'a', name: '가', keywords: ['z1', 'z2'] }),
  makeGyeol({ id: 'b', name: '나', keywords: ['p1'] }),
  makeGyeol({ id: 'c', name: '다', keywords: ['r1'] }),
]

describe('cosine', () => {
  it('같은 방향이면 1이다', () => {
    // 크기가 달라도 방향이 같으면 1이어야 한다. 많이 고른 사람과 적게 고른
    // 사람이 그것만으로 안 맞는 것이 되면 안 된다.
    expect(cosine([{ id: 'a', score: 3 }], [{ id: 'a', score: 30 }])).toBeCloseTo(1)
  })

  it('겹치는 결이 없으면 0이다', () => {
    expect(cosine([{ id: 'a', score: 3 }], [{ id: 'b', score: 3 }])).toBe(0)
  })

  it('한쪽이 전부 0이면 0이다', () => {
    // 0으로 나누면 NaN이 나와 화면에 그대로 찍힌다.
    expect(cosine([{ id: 'a', score: 0 }], [{ id: 'a', score: 3 }])).toBe(0)
  })
})

describe('matchUp', () => {
  it('똑같이 골랐으면 100점이다', () => {
    const picks = [work(1, [0]), work(2, [2])]
    const result = matchUp(picks, picks, catalog, TYPES)
    expect(result.overlap).toBe(100)
    expect(result.direction).toBe(100)
    expect(result.score).toBe(100)
  })

  it('작품도 방향도 안 겹치면 0점이다', () => {
    const result = matchUp([work(1, [0])], [work(2, [2])], catalog, TYPES)
    expect(result.overlap).toBe(0)
    expect(result.direction).toBe(0)
    expect(result.score).toBe(0)
  })

  it('겹친 작품을 a가 고른 순서로 낸다', () => {
    const result = matchUp(
      [work(1, [0]), work(2, [2]), work(3, [3])],
      [work(3, [3]), work(1, [0])],
      catalog,
      TYPES,
    )
    expect(result.shared.map((w) => w.i)).toEqual([1, 3])
    // 합집합 3편에 교집합 2편. b가 고른 것은 둘 다 a에도 있다.
    expect(result.overlap).toBe(67)
  })

  it('상위 결에 함께 든 결만 공통으로 낸다', () => {
    const result = matchUp(
      [work(1, [0, 1]), work(2, [3])],
      [work(3, [3]), work(4, [2]), work(5, [0])],
      catalog,
      TYPES,
    )
    // a는 가 6·다 5, b는 다 5·가 4·나 3. 둘 다 상위에 든 것은 가와 다다.
    expect(result.common.map((g) => g.id)).toEqual(['a', 'c'])
  })

  it('상대가 골랐고 내가 안 고른 것 중 내 결에 맞는 것만 건넨다', () => {
    const aPicks = [work(1, [0, 1]), work(2, [3])]
    const bPicks = [work(3, [2]), work(4, [3]), work(5, [0])]
    const result = matchUp(aPicks, bPicks, catalog, TYPES)

    // a의 1위는 가(6점). b가 고른 것 중 가에 걸리는 것은 5번뿐이고,
    // 나·다에만 걸리는 3·4번은 "너한테 맞을 것"이 아니다.
    expect(result.forA.map((w) => w.i)).toEqual([5])
    // b의 1위는 다(5점). a가 고른 것 중 다에 걸리는 것은 2번뿐이다.
    expect(result.forB.map((w) => w.i)).toEqual([2])
  })

  it('이미 고른 작품은 건네지 않는다', () => {
    const shared = work(1, [0])
    const result = matchUp([shared], [shared, work(2, [0])], catalog, TYPES)
    expect(result.forA.map((w) => w.i)).toEqual([2])
  })

  it('선택이 비어 있어도 죽지 않는다', () => {
    const result = matchUp([], [work(1, [0])], catalog, TYPES)
    expect(result.score).toBe(0)
    expect(result.shared).toEqual([])
    expect(result.forA).toEqual([])
    expect(result.forB).toEqual([])
  })
})
