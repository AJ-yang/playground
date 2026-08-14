import { readFileSync, writeFileSync } from 'node:fs'
import type { RawWork } from './fetch-catalog'

/**
 * 카탈로그의 각 작품에 붙은 TMDB 키워드를 받아 data/keywords.raw.json으로 쓴다.
 *
 * 작품이 만 편이 넘으므로 순차 요청은 몇 시간이 걸린다. 동시 요청 수를 제한해
 * 병렬로 돌리되, TMDB가 429를 주면 잠깐 쉬고 재시도한다.
 */
const TMDB_API_KEY = process.env.TMDB_API_KEY
if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not set — .env.local을 확인하라')

const CONCURRENCY = 20
const RETRY_DELAY_MS = 2000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function keywordsOf(work: RawWork, attempt = 0): Promise<string[]> {
  const url = `https://api.themoviedb.org/3/${work.media}/${work.id}/keywords?api_key=${TMDB_API_KEY}`
  const response = await fetch(url)
  if (response.status === 429 && attempt < 3) {
    await sleep(RETRY_DELAY_MS)
    return keywordsOf(work, attempt + 1)
  }
  if (!response.ok) return []
  // 영화는 keywords, TV는 results로 온다.
  const data = (await response.json()) as { keywords?: { name: string }[]; results?: { name: string }[] }
  return (data.keywords ?? data.results ?? []).map((k) => k.name)
}

async function main() {
  const works = JSON.parse(readFileSync('data/catalog.raw.json', 'utf8')) as RawWork[]
  const out: Record<string, string[]> = {}

  for (let i = 0; i < works.length; i += CONCURRENCY) {
    const batch = works.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((w) => keywordsOf(w)))
    batch.forEach((w, index) => {
      out[`${w.media}:${w.id}`] = results[index]
    })
    process.stderr.write(`\r  ${Math.min(i + CONCURRENCY, works.length)}/${works.length}`)
  }
  process.stderr.write('\n')

  writeFileSync('data/keywords.raw.json', JSON.stringify(out))
  const empty = Object.values(out).filter((k) => k.length === 0).length
  console.log(`키워드 ${Object.keys(out).length}건 (빈 작품 ${empty}건) → data/keywords.raw.json`)
}

main()
