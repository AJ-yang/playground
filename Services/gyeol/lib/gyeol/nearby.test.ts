import { describe, expect, it } from 'vitest'
import { computeAffinity, nearbyGyeols } from './nearby'
import { makeGyeol } from './gyeol.fixture'
import type { Catalog, CatalogEntry } from './types'

const VOCAB = ['zombie', 'apocalypse', 'romance', 'wedding']
const IDF = [3, 3, 3, 3]
const work = (i: number, k: number[]): CatalogEntry => ({
  i, m: 0, t: `작품${i}`, y: 2020, p: 'a.jpg', g: [], k, ko: 0,
})
const catalog = (works: CatalogEntry[]): Catalog => ({ vocabulary: VOCAB, idf: IDF, works })

const TYPES = [
  makeGyeol({ id: 'a', name: '가', keywords: ['zombie'] }),
  makeGyeol({ id: 'b', name: '나', keywords: ['apocalypse'] }),
  makeGyeol({ id: 'c', name: '다', keywords: ['romance'] }),
  makeGyeol({ id: 'd', name: '라', keywords: ['wedding'] }),
]

describe('computeAffinity', () => {
  it('한 작품의 상위 두 결을 서로 가깝게 센다', () => {
    // 좀비이면서 종말인 작품이 셋 → a와 b가 세 번 함께 걸린다
    const affinity = computeAffinity(catalog([work(1, [0, 1]), work(2, [0, 1]), work(3, [0, 1])]), TYPES)
    expect(affinity.a?.b).toBe(3)
    expect(affinity.b?.a).toBe(3)
  })

  it('결 하나에만 걸리는 작품은 아무 쌍도 만들지 않는다', () => {
    const affinity = computeAffinity(catalog([work(1, [0])]), TYPES)
    expect(affinity.a).toBeUndefined()
  })

  it('조건 키워드가 없는 작품을 건너뛴다', () => {
    // 카탈로그의 39%가 이 상태다. 세면 관계가 잡음으로 채워진다.
    expect(computeAffinity(catalog([work(1, [])]), TYPES)).toEqual({})
  })
})

describe('nearbyGyeols', () => {
  const affinity = {
    a: { b: 10, c: 3, d: 1 },
    b: { a: 10 },
  }

  it('함께 걸린 횟수가 많은 결부터 낸다', () => {
    expect(nearbyGyeols('a', affinity, TYPES, 2).map((g) => g.id)).toEqual(['b', 'c'])
  })

  it('요청한 수만큼만 낸다', () => {
    expect(nearbyGyeols('a', affinity, TYPES, 1).map((g) => g.id)).toEqual(['b'])
  })

  it('함께 걸린 적 없는 결은 내지 않는다', () => {
    // 억지로 채우면 "가까운 결"이라는 말이 거짓이 된다.
    expect(nearbyGyeols('c', affinity, TYPES, 3)).toEqual([])
  })

  it('정의에 없는 결 id를 건너뛴다', () => {
    expect(nearbyGyeols('a', { a: { 없음: 99, b: 1 } }, TYPES, 2).map((g) => g.id)).toEqual(['b'])
  })

  it('횟수가 같으면 결 정의 순서를 지킨다', () => {
    // 흔들리면 같은 결을 다시 열 때마다 다른 이웃이 나온다.
    expect(nearbyGyeols('a', { a: { c: 5, b: 5 } }, TYPES, 2).map((g) => g.id)).toEqual(['b', 'c'])
  })
})
