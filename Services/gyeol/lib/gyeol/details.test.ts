import { describe, expect, it } from 'vitest'
import { CHUNK_COUNT, detailChunk, detailChunkPath, recommendationSources } from './details'
import type { CatalogEntry } from './types'

const work = (m: 0 | 1, i: number): CatalogEntry => ({
  i,
  m,
  t: `작품${i}`,
  y: 2020,
  p: 'a.jpg',
  g: [],
  k: [],
  ko: 0,
})

describe('detailChunk', () => {
  it('언제나 청크 범위 안에 든다', () => {
    for (const id of [0, 1, 511, 512, 999999, 1087891]) {
      const chunk = detailChunk(work(0, id))
      expect(chunk).toBeGreaterThanOrEqual(0)
      expect(chunk).toBeLessThan(CHUNK_COUNT)
    }
  })

  it('같은 작품은 항상 같은 청크로 간다', () => {
    // 빌드가 넣은 곳과 클라이언트가 찾는 곳이 어긋나면 조용히 아무것도 안 뜬다.
    expect(detailChunk(work(0, 680))).toBe(detailChunk(work(0, 680)))
  })

  it('매체가 달라도 id가 같으면 같은 청크다', () => {
    // TMDB id는 매체별로 독립이라 영화 670과 TV 670이 둘 다 존재한다. 한
    // 파일에 같이 담고 안에서 workKey로 가른다.
    expect(detailChunk(work(0, 670))).toBe(detailChunk(work(1, 670)))
  })

  it('경로는 청크 번호를 자리수 맞춰 낸다', () => {
    expect(detailChunkPath(7)).toBe('details/007.json')
    expect(detailChunkPath(511)).toBe('details/511.json')
  })
})

describe('recommendationSources', () => {
  const 기생충 = work(0, 496243)
  const 올드보이 = work(0, 670)
  const 살인의추억 = work(0, 11423)

  it('그 작품을 추천한 고른 작품들을 낸다', () => {
    const sources = recommendationSources(살인의추억, [기생충, 올드보이], {
      '0-496243': [11423, 999],
      '0-670': [11423],
    })
    expect(sources.map((w) => w.i)).toEqual([496243, 670])
  })

  it('추천하지 않은 고른 작품은 빼놓는다', () => {
    const sources = recommendationSources(살인의추억, [기생충, 올드보이], {
      '0-496243': [11423],
      '0-670': [999],
    })
    expect(sources.map((w) => w.i)).toEqual([496243])
  })

  it('매체가 다르면 같은 id라도 근거가 아니다', () => {
    // 추천 목록의 숫자는 고른 작품과 같은 매체를 가리킨다. 영화 추천에 있는
    // 11423을 TV 11423으로 읽으면 엉뚱한 작품이 근거로 붙는다.
    const tv살인 = work(1, 11423)
    expect(recommendationSources(tv살인, [기생충], { '0-496243': [11423] })).toEqual([])
  })

  it('추천 키가 아예 없어도 던지지 않는다', () => {
    expect(recommendationSources(살인의추억, [기생충], {})).toEqual([])
  })
})
