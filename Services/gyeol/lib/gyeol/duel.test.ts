import { describe, expect, it } from 'vitest'
import { nextDuel } from './duel'
import { GENRE_INDEX } from './genres'
import { workKey, type Catalog, type CatalogEntry, type Gyeol } from './types'
import { makeGyeol } from './gyeol.fixture'

const VOCAB = ['first love', 'nostalgia', 'youth', 'slow burn', 'unrequited love', 'revenge', 'murder']
const [FIRST_LOVE, NOSTALGIA, YOUTH, SLOW_BURN, UNREQUITED, REVENGE, MURDER] = [0, 1, 2, 3, 4, 5, 6]

const TYPES: Gyeol[] = [
  makeGyeol({ id: 'back-then', name: '그때로', keywords: ['first love', 'nostalgia', 'youth'], genres: ['로맨스'] }),
  makeGyeol({ id: 'late-heart', name: '늦게', keywords: ['slow burn', 'unrequited love'], genres: ['로맨스'] }),
  makeGyeol({ id: 'revenge', name: '복수', keywords: ['revenge', 'murder'], genres: ['범죄'] }),
]

function work(i: number, k: number[], g: number[] = []): CatalogEntry {
  return { i, m: 0, t: `T${i}`, y: 2020, p: `${i}.jpg`, g, k, ko: 0 }
}

const ROMANCE = GENRE_INDEX['로맨스']
const CRIME = GENRE_INDEX['범죄']

/** 로맨스 두 결과 범죄 결의 대표작을 각각 둔다. 앞쪽일수록 유명하다. */
const WORKS = [
  work(1, [REVENGE, MURDER], [CRIME]),
  work(2, [FIRST_LOVE, NOSTALGIA, YOUTH], [ROMANCE]),
  work(3, [SLOW_BURN, UNREQUITED], [ROMANCE]),
  work(4, [FIRST_LOVE], [ROMANCE]),
  work(5, [UNREQUITED], [ROMANCE]),
  work(6, [], [ROMANCE]),
]
const CATALOG: Catalog = { vocabulary: VOCAB, idf: VOCAB.map(() => 1), works: WORKS }

/** 로맨스를 고른 사용자. */
const PICKS = [work(90, [FIRST_LOVE], [ROMANCE]), work(91, [UNREQUITED], [ROMANCE])]

const TIED = [
  { id: 'back-then', score: 10 },
  { id: 'late-heart', score: 9.6 },
  { id: 'revenge', score: 2 },
]

describe('nextDuel', () => {
  it('1위와 도전자를 붙인다', () => {
    // 하위권끼리 붙이면 안 된다. 가르는 값어치는 1위 근처에 있다.
    const duel = nextDuel(PICKS, TIED, CATALOG, TYPES, new Set())!
    expect([duel.left.gyeolId, duel.right.gyeolId]).toContain('back-then')
  })

  it('하위권이 더 붙어 있어도 1위를 겨냥한다', () => {
    // 3·4위가 0.01 차이여도 1위 대결이 먼저다. 예전 구현은 점수 차 절댓값만
    // 보고 정렬해서 3위 vs 4위를 먼저 물었다.
    const scores = [
      { id: 'back-then', score: 10 },
      { id: 'late-heart', score: 9.0 },
      { id: 'revenge', score: 8.99 },
    ]
    const duel = nextDuel(PICKS, scores, CATALOG, TYPES, new Set())!
    expect([duel.left.gyeolId, duel.right.gyeolId]).toContain('back-then')
  })

  it('양쪽 작품이 자기 결의 키워드를 실제로 갖는다', () => {
    // 장르만 스친 작품은 그 결을 대표하지 못한다. 카탈로그의 39%가 그렇다.
    const duel = nextDuel(PICKS, TIED, CATALOG, TYPES, new Set())!
    const keys: Record<string, number[]> = {
      'back-then': [FIRST_LOVE, NOSTALGIA, YOUTH],
      'late-heart': [SLOW_BURN, UNREQUITED],
    }
    for (const side of [duel.left, duel.right]) {
      expect(side.work.k.some((k) => keys[side.gyeolId].includes(k)), side.gyeolId).toBe(true)
    }
  })

  it('상대 결의 키워드를 가진 작품은 쓰지 않는다', () => {
    // 양쪽 키워드를 다 가진 작품으로는 두 결을 가를 수 없다
    const duel = nextDuel(PICKS, TIED, CATALOG, TYPES, new Set())!
    const other: Record<string, number[]> = {
      'back-then': [SLOW_BURN, UNREQUITED],
      'late-heart': [FIRST_LOVE, NOSTALGIA, YOUTH],
    }
    for (const side of [duel.left, duel.right]) {
      expect(side.work.k.some((k) => other[side.gyeolId].includes(k)), side.gyeolId).toBe(false)
    }
  })

  it('사용자가 고른 것과 장르가 겹치는 작품을 쓴다', () => {
    // 로맨스를 골랐는데 기생충·살인의 추억이 나오면 안 된다. 예전 구현은
    // 카탈로그 순서 첫 매치를 집어서 취향과 무관한 유명 한국영화가 나왔다.
    const duel = nextDuel(PICKS, TIED, CATALOG, TYPES, new Set())!
    for (const side of [duel.left, duel.right]) {
      expect(side.work.g).toContain(ROMANCE)
    }
  })

  it('충분히 맞는 것들 중 가장 유명한 것을 고른다', () => {
    // 강도만 최대화하면 「기묘한 이야기」(그룹 1위)가 6번째 대결까지 안 나오고
    // 콜 미 바이 유어 네임(#232)·트윈 픽스(#163)가 먼저 나왔다. 첫 판이 가장
    // 알아볼 만해야 한다.
    // 앞 = 유명, 강도 2/3 (관문 통과) · 뒤 = 덜 유명, 강도 3/3
    const famousEnough = work(20, [FIRST_LOVE, NOSTALGIA], [ROMANCE])
    const obscureStronger = work(21, [FIRST_LOVE, NOSTALGIA, YOUTH], [ROMANCE])
    const catalog: Catalog = {
      ...CATALOG,
      works: [famousEnough, obscureStronger, work(22, [SLOW_BURN], [ROMANCE])],
    }
    const duel = nextDuel(PICKS, TIED, catalog, TYPES, new Set())!
    const backThen = duel.left.gyeolId === 'back-then' ? duel.left : duel.right
    expect(backThen.work.i).toBe(20)
  })

  it('약하게만 맞는 작품은 유명해도 쓰지 않는다', () => {
    // 「살인의 추억」이 1980s 하나로 「그때로 돌아가는 결」 대표가 됐다.
    // 강도가 최댓값에 한참 못 미치면 관문에서 걸린다 (1/3 < 60%)
    const weak = work(10, [NOSTALGIA], [ROMANCE])
    const strong = work(11, [FIRST_LOVE, NOSTALGIA, YOUTH], [ROMANCE])
    const catalog: Catalog = {
      ...CATALOG,
      // 약한 쪽이 카탈로그 앞(더 유명)에 있어도 강한 쪽이 뽑혀야 한다
      works: [weak, strong, work(12, [SLOW_BURN], [ROMANCE])],
    }
    const duel = nextDuel(PICKS, TIED, catalog, TYPES, new Set())!
    const backThen = duel.left.gyeolId === 'back-then' ? duel.left : duel.right
    expect(backThen.work.i).toBe(11)
  })

  it('같은 작품을 양쪽에 놓지 않는다', () => {
    const duel = nextDuel(PICKS, TIED, CATALOG, TYPES, new Set())!
    expect(workKey(duel.left.work)).not.toBe(workKey(duel.right.work))
  })

  it('이미 쓴 작품을 다시 내지 않는다', () => {
    const first = nextDuel(PICKS, TIED, CATALOG, TYPES, new Set())!
    const used = new Set([workKey(first.left.work), workKey(first.right.work)])
    const second = nextDuel(PICKS, TIED, CATALOG, TYPES, used)
    if (second !== null) {
      expect(used.has(workKey(second.left.work))).toBe(false)
      expect(used.has(workKey(second.right.work))).toBe(false)
    }
  })

  it('1위가 앞서 있어도 대결을 낸다', () => {
    // 조기 종료를 두었더니 5편 기준 48%가 대결을 한 번도 못 봤다.
    // 기능이 절반에게 안 보이는 것은 최적화가 아니라 결함이다.
    const decided = [
      { id: 'back-then', score: 100 },
      { id: 'late-heart', score: 10 },
      { id: 'revenge', score: 2 },
    ]
    expect(nextDuel(PICKS, decided, CATALOG, TYPES, new Set())).not.toBeNull()
  })

  it('가를 작품을 못 찾으면 null을 낸다', () => {
    // 던지면 화면이 죽는다. 호출자가 라운드를 끝낼 수 있어야 한다
    const empty: Catalog = { ...CATALOG, works: [] }
    expect(nextDuel(PICKS, TIED, empty, TYPES, new Set())).toBeNull()
  })

  it('점수가 전부 0이면 null을 낸다', () => {
    const zero = TYPES.map((g) => ({ id: g.id, score: 0 }))
    expect(nextDuel(PICKS, zero, CATALOG, TYPES, new Set())).toBeNull()
  })
})
