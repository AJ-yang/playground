// lib/gyeol/recommend.test.ts
import { describe, expect, it } from 'vitest'
import { recommend, type RecommendationMap } from './recommend'
import type { CatalogEntry } from './types'

function work(i: number, m: 0 | 1 = 0): CatalogEntry {
  return { i, m, t: `T${i}`, y: 2020, p: `${i}.jpg`, g: [], k: [], ko: 0 }
}

const WORKS = [1, 2, 3, 4, 5, 6].map((i) => work(i))
const MAP: RecommendationMap = {
  '0-1': [3, 4, 5],
  '0-2': [4, 5, 6],
}

describe('recommend', () => {
  it('고른 작품의 추천을 모은다', () => {
    const out = recommend([work(1)], MAP, WORKS, 10)
    expect(out.map((w) => w.i).sort()).toEqual([3, 4, 5])
  })

  it('여러 작품에서 겹쳐 추천된 것을 앞에 둔다', () => {
    // 4와 5는 둘 다에서, 3과 6은 하나에서만 추천된다
    const out = recommend([work(1), work(2)], MAP, WORKS, 10)
    expect(out.slice(0, 2).map((w) => w.i).sort()).toEqual([4, 5])
  })

  it('먼저 고른 작품이 목록을 독식하지 않는다', () => {
    // 추천 대부분은 한 작품에서만 나와 1표씩이다. 표 수로만 정렬하면 동점이
    // 삽입 순서로 갈리고, 그 순서가 곧 고른 순서라 1번 작품의 추천이 줄줄이
    // 앞에 선다. 실제로 "다 처음 고른 영화와 관련된 것뿐"이 됐다.
    const works = [11, 12, 13, 14, 21, 31].map((i) => work(i))
    const map: RecommendationMap = {
      '0-1': [11, 12, 13, 14],
      '0-2': [21],
      '0-3': [31],
    }
    const out = recommend([work(1), work(2), work(3)], map, works, 3)
    expect(out.map((w) => w.i).sort()).toEqual([11, 21, 31])
  })

  it('고른 작품마다 돌아가며 한 편씩 가져간다', () => {
    const works = [11, 12, 21, 22].map((i) => work(i))
    const map: RecommendationMap = { '0-1': [11, 12], '0-2': [21, 22] }
    const out = recommend([work(1), work(2)], map, works, 4).map((w) => w.i)
    // 1번 것 둘이 연달아 나오면 안 된다
    expect(out.slice(0, 2).sort()).toEqual([11, 21])
    expect(out.slice(2).sort()).toEqual([12, 22])
  })

  it('한 작품의 추천이 동나면 남은 작품들로 채운다', () => {
    const works = [11, 21, 22, 23].map((i) => work(i))
    const map: RecommendationMap = { '0-1': [11], '0-2': [21, 22, 23] }
    expect(recommend([work(1), work(2)], map, works, 4)).toHaveLength(4)
  })

  it('이미 고른 작품은 추천하지 않는다', () => {
    const withSelf: RecommendationMap = { '0-1': [1, 3] }
    expect(recommend([work(1)], withSelf, WORKS, 10).map((w) => w.i)).toEqual([3])
  })

  it('개수를 제한한다', () => {
    expect(recommend([work(1)], MAP, WORKS, 2)).toHaveLength(2)
  })

  it('추천 데이터가 없는 작품을 건너뛴다', () => {
    // 추천이 하나도 안 남은 34건은 키 자체가 없다
    expect(() => recommend([work(99)], MAP, WORKS, 10)).not.toThrow()
    expect(recommend([work(99)], MAP, WORKS, 10)).toEqual([])
  })

  it('색인에 없는 추천 id를 버린다', () => {
    const dangling: RecommendationMap = { '0-1': [3, 777] }
    expect(recommend([work(1)], dangling, WORKS, 10).map((w) => w.i)).toEqual([3])
  })

  it('영화와 TV의 같은 id를 구분한다', () => {
    // TMDB id는 매체별로 독립이라 movie 1과 tv 1은 다른 작품이다
    const both: RecommendationMap = { '0-1': [3], '1-1': [4] }
    expect(recommend([work(1, 0)], both, WORKS, 10).map((w) => w.i)).toEqual([3])
  })

  it('고른 것이 없으면 빈 배열을 낸다', () => {
    expect(recommend([], MAP, WORKS, 10)).toEqual([])
  })
})
