import { describe, expect, it } from 'vitest'
import { decisivePick } from './decisive'
import { makeGyeol } from './gyeol.fixture'
import type { Catalog, CatalogEntry } from './types'

const VOCAB = ['z1', 'z2', 'p1']
const IDF = [4, 2, 8]
const work = (i: number, k: number[]): CatalogEntry => ({
  i, m: 0, t: `작품${i}`, y: 2020, p: 'a.jpg', g: [], k, ko: 0,
})
const catalog: Catalog = { vocabulary: VOCAB, idf: IDF, works: [] }

const TYPES = [
  makeGyeol({ id: 'a', name: '가', keywords: ['z1', 'z2'] }),
  makeGyeol({ id: 'b', name: '나', keywords: ['p1'] }),
]

describe('decisivePick', () => {
  it('빼면 1위가 바뀌는 작품을 지목한다', () => {
    // 가 6점(z1+z2) 대 나 8점(p1). 나 쪽 한 편을 빼면 가가 1위가 된다.
    const decisive = decisivePick([work(1, [0, 1]), work(2, [2])], catalog, TYPES)
    expect(decisive?.work.i).toBe(2)
    expect(decisive?.without).toBe('a')
  })

  it('여럿이 결정적이면 1위를 가장 많이 떠받친 것을 낸다', () => {
    // 가 10점(6+4) 대 나 8점. 가 쪽 어느 편을 빼도 나에게 밀리지만,
    // 6점을 얹고 있던 쪽이 그 결을 만든 작품이다.
    const picks = [work(1, [0, 1]), work(2, [0]), work(3, [2])]
    expect(decisivePick(picks, catalog, TYPES)?.work.i).toBe(1)
  })

  it('어느 것을 빼도 1위가 그대로면 내지 않는다', () => {
    // 고른 것이 모두 같은 방향을 가리켰다는 뜻이다. 억지로 하나를 지목하면
    // "이걸 빼도 결과는 같다"는 거짓말이 된다.
    expect(decisivePick([work(1, [0, 1]), work(2, [0])], catalog, TYPES)).toBeNull()
  })

  it('한 편만 골랐으면 내지 않는다', () => {
    // 빼고 나면 남는 것이 없어 견줄 1위가 없다.
    expect(decisivePick([work(1, [0])], catalog, TYPES)).toBeNull()
  })

  it('아무 결에도 안 걸리는 선택에는 내지 않는다', () => {
    expect(decisivePick([work(1, []), work(2, [])], catalog, TYPES)).toBeNull()
  })
})
