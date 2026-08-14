import { GENRE_INDEX } from './genres'
import type { Catalog, CatalogEntry, Gyeol, GyeolScore } from './types'

/**
 * 장르가 맞을 때 붙는 고정 점수.
 *
 * 키워드 IDF에 비해 작게 잡는다. 장르는 커버리지가 100%지만 드라마 하나가
 * 작품의 60.7%에 붙어 있어 변별력이 낮다. 보정 이상의 역할을 주면 결이
 * 장르로 뭉개진다.
 */
export const GENRE_BONUS = 0.4

/**
 * 고른 작품들로 결별 점수를 낸다. 점수가 높은 순으로 정렬해 돌려준다.
 *
 * 순수 함수다. 카탈로그와 결 정의를 인자로 받으므로 테스트가 실제 데이터에
 * 의존하지 않고, 클라이언트에서도 그대로 돌아간다.
 */
export function matchGyeol(
  picks: CatalogEntry[],
  catalog: Catalog,
  gyeolTypes: Gyeol[],
): GyeolScore[] {
  const vocabularyIndex = new Map(catalog.vocabulary.map((k, i) => [k, i]))

  const scores = gyeolTypes.map((gyeol) => {
    const wanted = new Set(
      gyeol.keywords.map((k) => vocabularyIndex.get(k)).filter((i): i is number => i !== undefined),
    )
    const wantedGenres = new Set(gyeol.genres.map((g) => GENRE_INDEX[g]))

    let score = 0
    for (const work of picks) {
      for (const index of new Set(work.k)) {
        if (wanted.has(index)) score += catalog.idf[index] ?? 0
      }
      for (const genre of new Set(work.g)) {
        if (wantedGenres.has(genre)) score += GENRE_BONUS
      }
    }
    return { id: gyeol.id, score }
  })

  return scores.sort((a, b) => b.score - a.score)
}
