import { writeFileSync } from 'node:fs'

/**
 * TMDB discover로 카탈로그 후보를 긁어 data/catalog.raw.json으로 쓴다.
 *
 * 국적별로 하한이 다른 이유는 TMDB 투표자가 서구권이기 때문이다. 단일 하한
 * 300을 적용하면 슬기로운 의사생활(174표), 미생(76표), 무빙(299표)이 전부
 * 탈락해 한국 드라마가 81편만 남는다.
 *
 * popularity로 정렬하지 않는다. 최근 조회 트래픽 지표라 인지도와 무관하고,
 * 정렬에 쓰면 아무도 모르는 최신작이 상위를 채운다.
 */
const TMDB_API_KEY = process.env.TMDB_API_KEY
if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not set — .env.local을 확인하라')

const DISCOVER_PAGE_LIMIT = 500

export type RawWork = {
  id: number
  media: 'movie' | 'tv'
  title: string
  year: number
  poster: string
  genreIds: number[]
  korean: boolean
}

type DiscoverResult = {
  id: number
  poster_path: string | null
  genre_ids?: number[]
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
}

async function discoverPage(
  media: 'movie' | 'tv',
  page: number,
  korean: boolean,
): Promise<{ results: DiscoverResult[]; totalPages: number }> {
  const url = new URL(`https://api.themoviedb.org/3/discover/${media}`)
  url.searchParams.set('api_key', TMDB_API_KEY!)
  url.searchParams.set('language', 'ko-KR')
  url.searchParams.set('sort_by', 'vote_count.desc')
  url.searchParams.set('vote_count.gte', korean ? '50' : '300')
  url.searchParams.set('page', String(page))
  if (korean) url.searchParams.set('with_original_language', 'ko')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`TMDB discover ${media} p${page}: ${response.status}`)
  const data = (await response.json()) as { results?: DiscoverResult[]; total_pages?: number }
  return { results: data.results ?? [], totalPages: data.total_pages ?? 0 }
}

function toRawWork(item: DiscoverResult, media: 'movie' | 'tv', korean: boolean): RawWork | null {
  const title = media === 'movie' ? item.title : item.name
  const date = media === 'movie' ? item.release_date : item.first_air_date
  if (!title || !item.poster_path) return null
  return {
    id: item.id,
    media,
    title,
    year: Number((date ?? '0').slice(0, 4)) || 0,
    poster: item.poster_path.slice(1),
    genreIds: item.genre_ids ?? [],
    korean,
  }
}

async function collect(media: 'movie' | 'tv', korean: boolean): Promise<RawWork[]> {
  const first = await discoverPage(media, 1, korean)
  const pages = Math.min(first.totalPages, DISCOVER_PAGE_LIMIT)
  if (first.totalPages > DISCOVER_PAGE_LIMIT) {
    console.warn(
      `  주의: ${media}/${korean ? 'ko' : 'etc'}의 총 페이지가 ${first.totalPages}로 상한 ${DISCOVER_PAGE_LIMIT}을 넘었다. 꼬리가 잘린다.`,
    )
  }

  const out = first.results.map((r) => toRawWork(r, media, korean)).filter((w): w is RawWork => w !== null)
  for (let page = 2; page <= pages; page += 1) {
    const { results } = await discoverPage(media, page, korean)
    out.push(...results.map((r) => toRawWork(r, media, korean)).filter((w): w is RawWork => w !== null))
    if (page % 50 === 0) process.stderr.write(`\r  ${media}/${korean ? 'ko' : 'etc'} ${page}/${pages}`)
  }
  process.stderr.write('\n')
  return out
}

async function main() {
  const groups = await Promise.all([
    collect('movie', true),
    collect('tv', true),
    collect('movie', false),
    collect('tv', false),
  ])

  // 한국 작품 그룹을 먼저 넣어 양쪽에 걸리는 작품이 korean으로 남게 한다.
  const byKey = new Map<string, RawWork>()
  for (const group of groups) {
    for (const work of group) {
      const key = `${work.media}:${work.id}`
      if (!byKey.has(key)) byKey.set(key, work)
    }
  }

  const works = [...byKey.values()]
  writeFileSync('data/catalog.raw.json', JSON.stringify(works))
  const korean = works.filter((w) => w.korean).length
  console.log(`카탈로그 ${works.length}편 (한국 ${korean}편) → data/catalog.raw.json`)
}

main()
