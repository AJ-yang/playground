import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { CHUNK_COUNT, detailChunk, detailChunkPath, type DetailChunk, type WorkDetail } from '../lib/gyeol/details'
import { workKey, type Catalog } from '../lib/gyeol/types'

/**
 * 작품별 줄거리·평점을 모아 public/details/NNN.json 512개로 굽는다.
 *
 * 추천받은 작품을 눌렀을 때 "이게 뭔지"를 알려주려면 줄거리가 있어야 한다.
 * 그런데 줄거리를 전부 합치면 한글 UTF-8 기준 수 MB라 색인처럼 통째로
 * 내려보낼 수 없다. 그래서 id로 512개 청크에 나눠 담고, 클라이언트는 누른
 * 작품이 든 청크 하나만 받는다.
 *
 * TMDB 키가 필요하므로 빌드 때만 돈다. 브라우저에서 직접 부르면 키가 번들에
 * 박힌다.
 */
const TMDB_API_KEY = process.env.TMDB_API_KEY
if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not set — .env.local을 확인하라')

const CONCURRENCY = 20
const RETRY_DELAY_MS = 2000

/**
 * 줄거리 길이 상한.
 *
 * 모달에서 읽을 만큼만 있으면 된다. TMDB에는 드물게 수천 자짜리 줄거리가
 * 있는데, 그런 것 몇 개가 청크 하나를 통째로 부풀린다.
 */
const OVERVIEW_LIMIT = 400

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 한국에서 구독으로 볼 수 있는 곳.
 *
 * 대여·구매는 싣지 않는다. "돈 내면 볼 수 있다"는 거의 모든 작품에 해당해서
 * 신호가 되지 못한다. 구독은 이미 내고 있는 것이라 바로 볼 수 있다는 뜻이다.
 */
type TmdbProvider = { provider_id: number; provider_name: string; logo_path: string | null }

type TmdbDetail = {
  overview?: string
  vote_average?: number
  runtime?: number
  episode_run_time?: number[]
  number_of_seasons?: number
}

/** 문장 끝에서 자른다. 중간에서 끊으면 읽다 만 느낌이 난다. */
function trim(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= OVERVIEW_LIMIT) return clean
  const cut = clean.slice(0, OVERVIEW_LIMIT)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (stop > OVERVIEW_LIMIT * 0.6 ? cut.slice(0, stop + 1) : cut.trimEnd()) + '…'
}

/**
 * 같은 서비스의 변종을 하나로 묶는다.
 *
 * TMDB는 "Netflix"와 "Netflix Standard with Ads"를 다른 제공처로 준다. 실측
 * 표본에서 넷플릭스 31편 중 29편이 광고 요금제로도 잡혔다. 그대로 두면 로고가
 * 두 번 뜬다. "Amazon Channel"·"Apple TV Channel" 같은 재판매 채널도 같다.
 */
function canonicalName(name: string): string {
  return name
    .replace(/\s*(Standard|Premium|Basic)?\s*with Ads$/i, '')
    .replace(/\s+(Amazon|Apple TV)\s+Channel$/i, '')
    .trim()
}

async function providersOf(media: 0 | 1, id: number, attempt = 0): Promise<TmdbProvider[]> {
  const path = media === 0 ? 'movie' : 'tv'
  const url = `https://api.themoviedb.org/3/${path}/${id}/watch/providers?api_key=${TMDB_API_KEY}`
  const response = await fetch(url)
  if (response.status === 429 && attempt < 3) {
    await sleep(RETRY_DELAY_MS)
    return providersOf(media, id, attempt + 1)
  }
  if (!response.ok) return []
  const data = (await response.json()) as { results?: { KR?: { flatrate?: TmdbProvider[] } } }
  return data.results?.KR?.flatrate ?? []
}

async function detailOf(
  media: 0 | 1,
  id: number,
  language: string,
  attempt = 0,
): Promise<TmdbDetail | null> {
  const path = media === 0 ? 'movie' : 'tv'
  const url = `https://api.themoviedb.org/3/${path}/${id}?api_key=${TMDB_API_KEY}&language=${language}`
  const response = await fetch(url)
  if (response.status === 429 && attempt < 3) {
    await sleep(RETRY_DELAY_MS)
    return detailOf(media, id, language, attempt + 1)
  }
  if (!response.ok) return null
  return (await response.json()) as TmdbDetail
}

function toDetail(raw: TmdbDetail): WorkDetail {
  const detail: WorkDetail = {
    o: trim(raw.overview ?? ''),
    v: Math.round((raw.vote_average ?? 0) * 10) / 10,
    r: raw.runtime ?? raw.episode_run_time?.[0] ?? 0,
  }
  if (raw.number_of_seasons) detail.s = raw.number_of_seasons
  return detail
}

async function main() {
  const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
  const works = catalog.works
  const details = new Map<string, WorkDetail>()

  let done = 0
  let failed = 0

  for (let i = 0; i < works.length; i += CONCURRENCY) {
    const batch = works.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((w) => detailOf(w.m, w.i, 'ko-KR')))
    batch.forEach((work, index) => {
      const raw = results[index]
      if (raw === null) failed += 1
      else details.set(workKey(work), toDetail(raw))
      done += 1
    })
    process.stderr.write(`\r  한국어 ${done}/${works.length}`)
  }
  process.stderr.write('\n')

  // 한국어 줄거리가 비어 있는 것만 영어로 다시 받는다. TMDB는 번역이 없으면
  // overview를 빈 문자열로 준다 — 없는 것과 구분이 안 되므로 직접 메워야 한다.
  const empty = works.filter((w) => {
    const detail = details.get(workKey(w))
    return detail !== undefined && detail.o === ''
  })
  let filled = 0
  for (let i = 0; i < empty.length; i += CONCURRENCY) {
    const batch = empty.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((w) => detailOf(w.m, w.i, 'en-US')))
    batch.forEach((work, index) => {
      const text = results[index]?.overview
      if (text) {
        details.get(workKey(work))!.o = trim(text)
        filled += 1
      }
    })
    process.stderr.write(`\r  영어 보강 ${Math.min(i + CONCURRENCY, empty.length)}/${empty.length}`)
  }
  if (empty.length > 0) process.stderr.write('\n')

  /*
    한국 구독 제공처를 모은다.

    PRD는 제공처를 명시적으로 뺐다. 근거는 "제공처는 한 달 단위로 바뀌는데
    정적 배포라 틀린 '넷플릭스에 있음'은 없는 것보다 나쁘다"였다. 그 우려는
    지금도 맞다. 그래서 값과 함께 **받은 날짜**를 저장하고 화면에 같이
    보여준다 — 날짜가 붙은 정보는 낡아도 거짓말이 되지 않는다.
  */
  const providerNames = new Map<number, string>()
  const providerLogos = new Map<number, string>()
  let withProvider = 0
  for (let i = 0; i < works.length; i += CONCURRENCY) {
    const batch = works.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((w) => providersOf(w.m, w.i)))
    batch.forEach((work, index) => {
      const detail = details.get(workKey(work))
      if (detail === undefined) return
      const ids: number[] = []
      for (const p of results[index]) {
        const name = canonicalName(p.provider_name)
        // 변종을 묶으면 id가 여럿이므로 이름 기준으로 대표 id를 하나 고른다.
        const known = [...providerNames.entries()].find(([, n]) => n === name)
        const id = known ? known[0] : p.provider_id
        if (!known) {
          providerNames.set(id, name)
          if (p.logo_path) providerLogos.set(id, p.logo_path)
        }
        if (!ids.includes(id)) ids.push(id)
      }
      if (ids.length > 0) {
        detail.w = ids
        withProvider += 1
      }
    })
    process.stderr.write(`\r  제공처 ${Math.min(i + CONCURRENCY, works.length)}/${works.length}`)
  }
  process.stderr.write('\n')

  writeFileSync(
    'public/providers.json',
    JSON.stringify({
      // 화면에 "2026년 8월 기준"으로 찍는다.
      at: new Date().toISOString().slice(0, 7),
      list: Object.fromEntries(
        [...providerNames].map(([id, name]) => [id, { n: name, l: providerLogos.get(id) ?? '' }]),
      ),
    }),
  )

  /*
    추천을 상세 옆에 담는다.

    별도 파일로 두면 결과 화면이 430KB를 통째로 받는데, 정작 필요한 것은 고른
    작품 열몇 편의 것뿐이다. 같은 청크에 넣으면 필요한 조각만 받게 되고,
    포스터를 눌렀을 때 쓰는 캐시와도 공유된다.
  */
  let withRecommendations = 0
  try {
    const recs = JSON.parse(readFileSync('data/recommendations.json', 'utf8')) as Record<string, number[]>
    for (const work of works) {
      const key = workKey(work)
      const ids = recs[key]
      const detail = details.get(key)
      if (detail === undefined || ids === undefined || ids.length === 0) continue
      detail.c = ids
      withRecommendations += 1
    }
  } catch {
    // 아직 추천을 안 구웠을 수 있다. 없으면 추천 없이 나머지를 굽는다.
    console.warn('  data/recommendations.json 없음 — 추천 없이 진행한다')
  }

  // 청크로 나눠 쓴다. 매번 통째로 지우고 다시 써야 지난 실행의 잔재가 안 남는다.
  rmSync('public/details', { recursive: true, force: true })
  mkdirSync('public/details', { recursive: true })

  const chunks: DetailChunk[] = Array.from({ length: CHUNK_COUNT }, () => ({}))
  for (const work of works) {
    const detail = details.get(workKey(work))
    if (detail === undefined) continue
    chunks[detailChunk(work)][workKey(work)] = detail
  }

  let raw = 0
  let gzip = 0
  let biggest = 0
  chunks.forEach((chunk, index) => {
    const json = JSON.stringify(chunk)
    writeFileSync(`public/${detailChunkPath(index)}`, json)
    // 글자 수(json.length)가 아니라 바이트로 잰다. 한글은 UTF-8에서 3바이트라
    // 글자 수로 재면 실제의 3분의 1로 보고되어 gzip이 raw보다 커 보인다.
    raw += Buffer.byteLength(json, 'utf8')
    const packed = gzipSync(json).length
    gzip += packed
    biggest = Math.max(biggest, packed)
  })

  const noOverview = [...details.values()].filter((d) => d.o === '').length
  console.log(`상세 ${details.size}건 → public/details/ (${CHUNK_COUNT}개 청크)`)
  console.log(`  조회 실패 ${failed}건 / 한국어 줄거리 없어 영어로 메운 것 ${filled}건`)
  console.log(`  끝내 줄거리 없는 작품 ${noOverview}건 (${((100 * noOverview) / Math.max(details.size, 1)).toFixed(1)}%)`)
  console.log(`  추천이 담긴 작품 ${withRecommendations}건`)
  console.log(`  한국 구독으로 볼 수 있는 작품 ${withProvider}건 (${((100 * withProvider) / Math.max(details.size, 1)).toFixed(1)}%) / 제공처 ${providerNames.size}종`)
  console.log(`  전체 raw ${(raw / 1024 / 1024).toFixed(1)}MB / gzip ${(gzip / 1024).toFixed(0)}KB`)
  console.log(`  청크 하나 평균 gzip ${(gzip / CHUNK_COUNT / 1024).toFixed(1)}KB / 최대 ${(biggest / 1024).toFixed(1)}KB`)
}

main()
