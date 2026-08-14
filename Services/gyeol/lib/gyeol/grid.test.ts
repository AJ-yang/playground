import { describe, expect, it } from 'vitest'
import { searchWorks } from './grid'
import type { CatalogEntry } from './types'

function work(i: number, ko: 0 | 1, m: 0 | 1): CatalogEntry {
  return { i, m, t: `T${i}`, y: 2020, p: `${i}.jpg`, g: [], k: [], ko }
}

const WORKS: CatalogEntry[] = [
  ...Array.from({ length: 50 }, (_, n) => work(1000 + n, 1, 0)),
  ...Array.from({ length: 50 }, (_, n) => work(2000 + n, 1, 1)),
  ...Array.from({ length: 50 }, (_, n) => work(3000 + n, 0, 0)),
  ...Array.from({ length: 50 }, (_, n) => work(4000 + n, 0, 1)),
]

describe('searchWorks', () => {
  it('제목 일부로 찾는다', () => {
    const hits = searchWorks(WORKS, 'T1000', 10)
    expect(hits[0].i).toBe(1000)
  })

  it('대소문자를 가리지 않는다', () => {
    expect(searchWorks(WORKS, 't1000', 10)).toEqual(searchWorks(WORKS, 'T1000', 10))
  })

  it('빈 질의에 빈 배열을 낸다', () => {
    expect(searchWorks(WORKS, '   ', 10)).toEqual([])
  })

  it('개수를 제한한다', () => {
    expect(searchWorks(WORKS, 'T', 5)).toHaveLength(5)
  })

  it('인지도 순서를 유지한다', () => {
    const hits = searchWorks(WORKS, 'T', 5)
    expect(hits[0].i).toBe(1000)
  })

  it('제목이 정확히 일치하면 맨 앞에 둔다', () => {
    // "오징어 게임"을 치면 본편이 아니라 "오징어 게임: 시즌2 제작 이야기"가
    // 먼저 나왔다. 카탈로그 순서대로 첫 매치를 집었기 때문이다.
    const exact = { ...work(9001, 0, 0), t: '오징어 게임' }
    const making = { ...work(9000, 0, 0), t: '오징어 게임: 시즌2 제작 이야기' }
    // 메이킹이 카탈로그 앞쪽에 있어도 본편이 먼저 나와야 한다
    expect(searchWorks([making, exact], '오징어 게임', 5)[0].t).toBe('오징어 게임')
  })

  it('제목이 질의로 시작하는 것을 중간에 포함한 것보다 앞에 둔다', () => {
    const starts = { ...work(9003, 0, 0), t: '기묘한 이야기' }
    const contains = { ...work(9002, 0, 0), t: '아주 기묘한 이야기의 밤' }
    expect(searchWorks([contains, starts], '기묘한', 5)[0].t).toBe('기묘한 이야기')
  })

  it('같은 순위 안에서는 인지도 순서를 지킨다', () => {
    const famous = { ...work(9004, 0, 0), t: '괴물' }
    const obscure = { ...work(9005, 0, 0), t: '괴물' }
    expect(searchWorks([famous, obscure], '괴물', 5).map((w) => w.i)).toEqual([9004, 9005])
  })
})
