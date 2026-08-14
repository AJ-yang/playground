import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { computeAffinity, nearbyGyeols } from '../lib/gyeol/nearby'
import { buildGyeolPool } from '../lib/gyeol/pool'
import { GYEOL_TYPES } from '../data/gyeol-types'
import { normalizeGenres } from '../lib/gyeol/genres'
import { computeIdf } from '../lib/gyeol/idf'
import { buildVocabulary } from '../lib/gyeol/vocabulary'
import type { Catalog, CatalogEntry } from '../lib/gyeol/types'
import type { RawWork } from './fetch-catalog'

/**
 * 원본 둘을 합쳐 브라우저가 받을 public/catalog.json을 만든다.
 *
 * 조건 키워드 어휘 밖의 키워드는 담지 않는다. 점수에 들어가지 않으므로 색인에
 * 있을 이유가 없고, 이 덕분에 제작 메타데이터를 걸러낼 별도 차단 목록이
 * 필요 없다.
 */
function main() {
  const works = JSON.parse(readFileSync('data/catalog.raw.json', 'utf8')) as RawWork[]
  const keywords = JSON.parse(readFileSync('data/keywords.raw.json', 'utf8')) as Record<string, string[]>

  const vocabulary = buildVocabulary(GYEOL_TYPES)
  const vocabularyIndex = new Map(vocabulary.map((k, i) => [k, i]))

  const entries: CatalogEntry[] = works.map((work) => {
    const media = work.media === 'movie' ? 0 : 1
    const names = keywords[`${work.media}:${work.id}`] ?? []
    const k = [
      ...new Set(
        names
          .map((name) => vocabularyIndex.get(name))
          .filter((index): index is number => index !== undefined),
      ),
    ].sort((a, b) => a - b)

    return {
      i: work.id,
      m: media as 0 | 1,
      t: work.title,
      y: work.year,
      p: work.poster,
      g: normalizeGenres(work.genreIds, media as 0 | 1),
      k,
      ko: work.korean ? 1 : 0,
    }
  })

  const idf = computeIdf(vocabulary.length, entries.map((e) => e.k))
  const catalog: Catalog = { vocabulary, idf, works: entries }

  mkdirSync('public', { recursive: true })
  const json = JSON.stringify(catalog)
  writeFileSync('public/catalog.json', json)

  /*
    1라운드 그리드 후보를 같이 굽는다.
    
    이 계산은 12,595편을 전부 훑어야 해서 데스크톱에서도 168ms가 걸리고,
    무엇보다 그걸 하려고 클라이언트가 색인 607KB를 통째로 기다려야 했다.
    후보는 사용자와 무관하게 정해지므로 미리 구워두면 첫 화면이 2.8KB로 뜬다.
    
    **카탈로그와 같은 스크립트에서 만들어야 한다.** 후보의 `k`는 이 색인의
    어휘 인덱스라, 따로 만들면 어휘가 바뀔 때 조용히 어긋난다.
  */
  const poolJson = JSON.stringify(buildGyeolPool(catalog, GYEOL_TYPES))
  writeFileSync('public/pool.json', poolJson)

  /*
    가까운 결도 같이 굽는다.

    **키워드 교집합으로 재면 안 된다.** 25개 결은 서로 구별되도록 겹치지 않게
    정의되어 있어서, 그렇게 재면 15개 결에 이웃이 하나도 안 나온다. 작품을
    매개로 — 한 작품이 두 결의 상위에 함께 걸린 횟수로 — 재야 25개 전부
    이웃이 생긴다.

    계산에 12,595편을 훑어야 하므로 클라이언트에서 돌릴 수 없다. 결과는
    결마다 id 세 개뿐이라 파일이 1KB도 안 된다.
  */
  const affinity = computeAffinity(catalog, GYEOL_TYPES)
  const nearby = Object.fromEntries(
    GYEOL_TYPES.map((g) => [g.id, nearbyGyeols(g.id, affinity, GYEOL_TYPES, 3).map((n) => n.id)]),
  )
  const nearbyJson = JSON.stringify(nearby)
  writeFileSync('public/nearby.json', nearbyJson)

  const matched = entries.filter((e) => e.k.length > 0).length
  console.log(`작품 ${entries.length}편 → public/catalog.json`)
  console.log(`  1라운드 후보 → public/pool.json (gzip ${(gzipSync(poolJson).length / 1024).toFixed(1)}KB)`)
  console.log(`  가까운 결 → public/nearby.json (${nearbyJson.length}B, 이웃 없는 결 ${Object.values(nearby).filter((v) => v.length === 0).length}개)`)
  console.log(`  어휘 ${vocabulary.length}종`)
  console.log(`  조건 키워드를 1개 이상 가진 작품 ${matched}편 (${((100 * matched) / entries.length).toFixed(1)}%)`)
  console.log(`  raw ${(json.length / 1024).toFixed(0)}KB / gzip ${(gzipSync(json).length / 1024).toFixed(0)}KB`)
}

main()
