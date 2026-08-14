import { describe, expect, it } from 'vitest'
import { normalizeGenres, GENRE_INDEX } from './genres'
import { GENRE_LABELS } from './types'

describe('normalizeGenres', () => {
  it('영화 장르 id를 라벨 인덱스로 바꾼다', () => {
    expect(normalizeGenres([28, 878], 0).map((i) => GENRE_LABELS[i]).sort()).toEqual(['SF', '액션'])
  })

  it('TV의 합성 장르를 두 라벨로 쪼갠다', () => {
    expect(normalizeGenres([10759], 1).map((i) => GENRE_LABELS[i]).sort()).toEqual(['모험', '액션'])
  })

  it('TV의 SF&판타지를 SF와 판타지로 쪼갠다', () => {
    expect(normalizeGenres([10765], 1).map((i) => GENRE_LABELS[i]).sort()).toEqual(['SF', '판타지'])
  })

  it('영화와 TV에서 같은 뜻인 장르는 같은 인덱스로 모인다', () => {
    expect(normalizeGenres([18], 0)).toEqual(normalizeGenres([18], 1))
  })

  it('대응 라벨이 없는 장르는 버린다', () => {
    expect(normalizeGenres([10763, 10767], 1)).toEqual([])
  })

  it('중복을 제거한다', () => {
    const out = normalizeGenres([10759, 12], 1)
    expect(new Set(out).size).toBe(out.length)
  })

  it('GENRE_INDEX가 모든 라벨을 덮는다', () => {
    for (const label of GENRE_LABELS) {
      expect(GENRE_INDEX[label], label).toBeGreaterThanOrEqual(0)
    }
  })
})
