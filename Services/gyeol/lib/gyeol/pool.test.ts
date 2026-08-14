import { describe, expect, it } from 'vitest'
import { buildGyeolPool } from './pool'
import { GENRE_INDEX } from './genres'
import { workKey, type Catalog, type CatalogEntry, type Gyeol } from './types'
import { makeGyeol } from './gyeol.fixture'

const VOCAB = ['revenge', 'romance', 'zombie']
const TYPES: Gyeol[] = [
  makeGyeol({ id: 'revenge', name: '복수', keywords: ['revenge'], genres: ['범죄'] }),
  makeGyeol({ id: 'love', name: '사랑', keywords: ['romance'], genres: ['로맨스'] }),
  makeGyeol({ id: 'survive', name: '생존', keywords: ['zombie'], genres: ['공포'] }),
]

function work(i: number, ko: 0 | 1, k: number[]): CatalogEntry {
  return { i, m: 0, t: `T${i}`, y: 2020, p: `${i}.jpg`, g: [], k, ko }
}

/** 결마다 한국/해외 후보를 넉넉히 둔다. 앞쪽일수록 유명하다. */
const WORKS: CatalogEntry[] = [
  ...[0, 1, 2].flatMap((kw) =>
    Array.from({ length: 4 }, (_, n) => work(kw * 100 + n, 1, [kw])),
  ),
  ...[0, 1, 2].flatMap((kw) =>
    Array.from({ length: 4 }, (_, n) => work(kw * 100 + 50 + n, 0, [kw])),
  ),
]
const CATALOG: Catalog = { vocabulary: VOCAB, idf: [1, 1, 1], works: WORKS }

describe('buildGyeolPool', () => {
  it('모든 결이 대표작을 갖는다', () => {
    // 장르 층화에서는 48장 중 10장이 한 결이었고 6개 결은 대표작이 없었다
    const pool = buildGyeolPool(CATALOG, TYPES)
    for (const gyeol of TYPES) {
      const has = pool.some((w) => w.k.includes(VOCAB.indexOf(gyeol.keywords[0])))
      expect(has, gyeol.id).toBe(true)
    }
  })

  it('한 결이 전체의 절반을 넘지 않는다', () => {
    const pool = buildGyeolPool(CATALOG, TYPES)
    const counts = TYPES.map(
      (g) => pool.filter((w) => w.k.includes(VOCAB.indexOf(g.keywords[0]))).length,
    )
    for (const count of counts) expect(count / pool.length).toBeLessThanOrEqual(0.5)
  })

  it('결마다 한국 작품과 해외 작품을 하나씩 낸다', () => {
    const pool = buildGyeolPool(CATALOG, TYPES)
    for (const gyeol of TYPES) {
      const mine = pool.filter((w) => w.k.includes(VOCAB.indexOf(gyeol.keywords[0])))
      expect(mine.some((w) => w.ko === 1), `${gyeol.id} 한국`).toBe(true)
      expect(mine.some((w) => w.ko === 0), `${gyeol.id} 해외`).toBe(true)
    }
  })

  it('각 결에서 가장 유명한 것을 가져온다', () => {
    // 카탈로그 순서가 그룹 안에서 vote_count 내림차순이므로 앞쪽이 유명하다
    const pool = buildGyeolPool(CATALOG, TYPES)
    expect(pool.map((w) => w.i)).toContain(0)
    expect(pool.map((w) => w.i)).toContain(50)
  })

  it('같은 작품을 두 번 내지 않는다', () => {
    const pool = buildGyeolPool(CATALOG, TYPES)
    expect(new Set(pool.map(workKey)).size).toBe(pool.length)
  })

  it('후보가 없는 결은 건너뛴다', () => {
    // 어느 작품도 안 걸리는 결이 있어도 던지면 안 된다
    const lonely: Gyeol[] = [
      ...TYPES,
      makeGyeol({ id: 'none', name: '없음', keywords: ['nowhere'], genres: [] }),
    ]
    expect(() => buildGyeolPool(CATALOG, lonely)).not.toThrow()
  })

  it('같은 입력에 같은 결과를 낸다', () => {
    expect(buildGyeolPool(CATALOG, TYPES)).toEqual(buildGyeolPool(CATALOG, TYPES))
  })

  it('장르만 스친 작품을 대표작으로 뽑지 않는다', () => {
    // 조건 키워드가 하나도 없는데 장르 보정만으로 1위가 되는 작품이 카탈로그의
    // 39%다. 「티격태격의 결」은 1,380편 중 90%가 그런 가짜였고, 그래서 후보에
    // romcom 키워드가 없는 「레드슈즈」가 대표작으로 올라왔다.
    const genreOnly: CatalogEntry = {
      i: 999, m: 0, t: '장르만', y: 2020, p: '999.jpg',
      g: [GENRE_INDEX['범죄']], k: [], ko: 1,
    }
    // 이 작품이 카탈로그 맨 앞에 있어도 뽑히면 안 된다
    const catalog: Catalog = { ...CATALOG, works: [genreOnly, ...WORKS] }
    const pool = buildGyeolPool(catalog, TYPES)
    expect(pool.map(workKey)).not.toContain(workKey(genreOnly))
  })
})

