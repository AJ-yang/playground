import { describe, expect, it } from 'vitest'
import { matchGyeol, GENRE_BONUS } from './match'
import { GENRE_INDEX } from './genres'
import type { Catalog, CatalogEntry, Gyeol } from './types'
import { makeGyeol } from './gyeol.fixture'

const VOCAB = ['chaebol', 'murder', 'revenge']
const TYPES: Gyeol[] = [
  makeGyeol({ id: 'revenge', name: '서늘한 복수의 결', keywords: ['revenge', 'murder'], genres: ['범죄'] }),
  makeGyeol({ id: 'stairs', name: '계단을 오르내리는 결', keywords: ['chaebol'], genres: ['로맨스'] }),
]

function work(k: number[], g: number[] = []): CatalogEntry {
  return { i: 1, m: 0, t: 'T', y: 2020, p: 'a.jpg', g, k, ko: 0 }
}

/** murder는 흔하고(idf 낮음) chaebol은 드물다(idf 높음). */
const CATALOG: Catalog = { vocabulary: VOCAB, idf: [5, 1, 2], works: [] }

describe('matchGyeol', () => {
  it('조건 키워드가 맞으면 그 결의 점수가 오른다', () => {
    const scores = matchGyeol([work([2])], CATALOG, TYPES)
    expect(scores.find((s) => s.id === 'revenge')!.score).toBeGreaterThan(0)
  })

  it('희귀 키워드 하나가 흔한 키워드 하나를 이긴다', () => {
    const scores = matchGyeol([work([0]), work([1])], CATALOG, TYPES)
    const stairs = scores.find((s) => s.id === 'stairs')!.score
    const revenge = scores.find((s) => s.id === 'revenge')!.score
    expect(stairs).toBeGreaterThan(revenge)
  })

  it('장르가 맞으면 보정 점수가 붙는다', () => {
    const withGenre = matchGyeol([work([], [GENRE_INDEX['범죄']])], CATALOG, TYPES)
    expect(withGenre.find((s) => s.id === 'revenge')!.score).toBeCloseTo(GENRE_BONUS)
  })

  it('점수가 높은 순으로 정렬해 반환한다', () => {
    const scores = matchGyeol([work([0, 2])], CATALOG, TYPES)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score)
    }
  })

  it('넘긴 결 수만큼 반환한다', () => {
    expect(matchGyeol([work([0])], CATALOG, TYPES)).toHaveLength(TYPES.length)
  })

  it('고른 작품이 없으면 전부 0점이다', () => {
    const scores = matchGyeol([], CATALOG, TYPES)
    expect(scores.every((s) => s.score === 0)).toBe(true)
  })

  it('여러 작품의 신호가 누적된다', () => {
    const one = matchGyeol([work([2])], CATALOG, TYPES)
    const two = matchGyeol([work([2]), work([2])], CATALOG, TYPES)
    expect(two.find((s) => s.id === 'revenge')!.score)
      .toBeGreaterThan(one.find((s) => s.id === 'revenge')!.score)
  })

  it('어휘 밖 인덱스를 무시한다', () => {
    // 색인이 갱신되며 어휘가 줄면 옛 링크가 범위 밖 인덱스를 담고 올 수 있다
    expect(() => matchGyeol([work([99])], CATALOG, TYPES)).not.toThrow()
  })
})
