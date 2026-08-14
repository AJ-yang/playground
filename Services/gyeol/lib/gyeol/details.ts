import { workKey, type CatalogEntry } from './types'
import type { RecommendationMap } from './recommend'

/**
 * 작품 상세를 쪼개 담는 파일 수.
 *
 * 줄거리를 전부 합치면 한글 UTF-8 기준 수 MB라 색인처럼 통째로 내려보낼 수
 * 없다. 그렇다고 작품마다 파일을 만들면 12,595개가 되어 gh-pages force push가
 * 감당하지 못한다(추천을 한 파일로 합친 것과 같은 이유). 512개면 파일 하나에
 * 25편쯤 들어가 한 번 누를 때 받는 양이 작다.
 */
export const CHUNK_COUNT = 512

/** 작품 상세. 필드 이름을 짧게 두는 이유는 파일 크기 때문이다. */
export type WorkDetail = {
  /** 줄거리. 한국어가 없으면 영어, 그것도 없으면 빈 문자열 */
  o: string
  /** TMDB 평점(10점 만점). 표가 없으면 0 */
  v: number
  /** 영화는 상영 시간(분), 드라마는 회당 길이(분). 미상이면 0 */
  r: number
  /** 드라마의 시즌 수. 영화면 없다 */
  s?: number
  /** 한국에서 구독으로 볼 수 있는 곳(제공처 id). 없으면 필드 자체가 없다 */
  w?: number[]
  /**
   * 이 작품을 좋아한 사람에게 권할 만한 작품(같은 매체의 TMDB id).
   *
   * 추천을 한 파일로 합치면 결과 화면이 430KB를 받는데, 실제로 필요한 것은
   * 고른 작품 열몇 편의 것뿐이다. 상세와 같은 청크에 담아 필요한 조각만
   * 받는다 — 청크 하나가 0.8KB 늘고 캐시도 상세와 공유된다.
   */
  c?: number[]
}

export type DetailChunk = Record<string, WorkDetail>

/**
 * 작품이 담긴 청크 번호.
 *
 * 매체를 섞지 않고 id만 쓴다. 영화 670과 TV 670이 같은 파일에 들어가되 안에서는
 * `workKey`로 갈린다 — 실제로 177건이 겹친다.
 */
export function detailChunk(work: { i: number }): number {
  return work.i % CHUNK_COUNT
}

/** 청크 파일 경로. 자리수를 맞춰 정렬이 흐트러지지 않게 한다. */
export function detailChunkPath(chunk: number): string {
  return `details/${String(chunk).padStart(3, '0')}.json`
}

/**
 * 고른 작품 중 이 작품을 추천한 것들.
 *
 * 추천 목록에 담긴 숫자는 **고른 작품과 같은 매체**의 TMDB id다. 매체를 안
 * 맞추면 영화 추천에 있는 11423을 TV 11423으로 읽어 엉뚱한 근거가 붙는다.
 */
export function recommendationSources(
  work: CatalogEntry,
  picks: CatalogEntry[],
  recommendations: RecommendationMap,
): CatalogEntry[] {
  return picks.filter(
    (pick) =>
      pick.m === work.m && (recommendations[workKey(pick)] ?? []).includes(work.i),
  )
}
