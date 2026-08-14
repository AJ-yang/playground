import { GENRE_LABELS, type GenreLabel, type Media } from './types'

export const GENRE_INDEX = Object.fromEntries(
  GENRE_LABELS.map((label, index) => [label, index]),
) as Record<GenreLabel, number>

/**
 * TMDB 장르 id를 정규 라벨로 매핑한다.
 *
 * TV는 영화와 체계가 달라서 합성 장르를 쓴다. `10759 Action & Adventure`처럼
 * 둘을 묶은 것은 양쪽 라벨로 쪼갠다. 통일하지 않으면 같은 결 조건이 영화에만
 * 걸리고 드라마는 통째로 빠진다.
 *
 * 뉴스·토크·리얼리티처럼 취향과 무관한 장르는 매핑하지 않고 버린다.
 */
const MOVIE_MAP: Record<number, GenreLabel[]> = {
  28: ['액션'], 12: ['모험'], 16: ['애니'], 35: ['코미디'], 80: ['범죄'],
  99: ['다큐'], 18: ['드라마'], 10751: ['가족'], 14: ['판타지'], 36: ['역사'],
  27: ['공포'], 10402: ['음악'], 9648: ['미스터리'], 10749: ['로맨스'],
  878: ['SF'], 53: ['스릴러'], 10752: ['전쟁'], 37: ['서부'],
}

const TV_MAP: Record<number, GenreLabel[]> = {
  10759: ['액션', '모험'],
  10765: ['SF', '판타지'],
  10768: ['전쟁'],
  10762: ['가족'],
  10766: ['드라마'],
  16: ['애니'], 35: ['코미디'], 80: ['범죄'], 99: ['다큐'], 18: ['드라마'],
  10751: ['가족'], 9648: ['미스터리'], 37: ['서부'],
}

export function normalizeGenres(ids: number[], media: Media): number[] {
  const map = media === 0 ? MOVIE_MAP : TV_MAP
  const out = new Set<number>()
  for (const id of ids) {
    for (const label of map[id] ?? []) out.add(GENRE_INDEX[label])
  }
  return [...out]
}
