# 결(gyeol) 2라운드 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고르는 화면을 두 라운드로 나눈다. 1라운드는 장르 섹션에서 넓게 5편, 2라운드는 붙어 있는 결끼리 맞붙여 좁게 가른다.

**Architecture:** 1라운드가 기준선이 되고 2라운드가 그 위에서 동점을 가른다. 2라운드 승자를 1라운드 선택 뒤에 이어 붙이면 `matchGyeol`이 그대로 처리하므로 **페이로드 포맷도 결과 화면도 바꿀 필요가 없다.** 새 로직은 전부 순수 함수로 `lib/gyeol/`에 두고 TDD로 만든다.

**Tech Stack:** TypeScript, Next.js 16 정적 익스포트, React 19, vitest

---

## 왜 바꾸는가

지금 고르는 화면은 네 그룹(한국/해외 × 영화/TV)을 번갈아 섞은 20장을 깔고 "더 보기"로 20장씩 덧붙인다. 두 가지가 문제다.

**1. 취향 구역이 안 보인다.** 기생충 다음에 오징어 게임, 인터스텔라, 왕좌의 게임이 오니 취향이 뚜렷한 사람도 어디를 봐야 할지 모른다.

**2. 더 고르게 해도 동점이 안 갈린다.** 실측하면 1라운드 5편으로 이미 결판나는 경우와 동전 던지기인 경우가 공존한다.

```
범죄 취향   1위 서늘한 복수 37.6  vs  2위 단서를 줍는 20.8   → 45% 차이, 확정
로맨스 취향  1위 그때로 돌아가는 29.2  vs  2위 마음이 늦게 29.0  → 1% 차이
잡식        화가 나는 20.8 / 계단 20.5 / 소리에 약한 20.3     → 셋이 동점
```

동점인 사용자에게 그리드를 20장 더 줘도 **세 결이 똑같이 올라가서 여전히 동점이다.** 필요한 것은 더 많은 신호가 아니라 **붙어 있는 후보를 겨냥한 신호**다.

## 흐름

```
1라운드  장르 섹션 8개 × 6편 = 48편
         "가장 마음에 드는 5편"
            ↓
2라운드  붙어 있는 두 결을 가르는 작품 한 쌍씩, 최대 6번
         매번 점수를 갱신해 다음으로 붙은 쌍을 겨냥
         "둘 다 아니에요"로 건너뛸 수 있다
            ↓
결과     1라운드 5편 + 2라운드 승자 → matchGyeol
```

## 파일 구조

**생성**

| 파일 | 책임 |
|---|---|
| `lib/gyeol/sections.ts` | 1라운드 장르 섹션 구성 |
| `lib/gyeol/duel.ts` | 2라운드 대결 쌍 선정 |
| `components/SectionGrid.tsx` | 섹션 헤더가 있는 그리드 |
| `components/Duel.tsx` | 두 편 비교 한 판 |

**수정**: `app/pick/page.tsx`(두 라운드로 재구성)

**삭제**: `lib/gyeol/grid.ts`의 `firstGrid`·`nextGrid`. 섹션 방식으로 대체된다. `searchWorks`는 남긴다.

---

## Task 1: 1라운드 섹션 구성

**Files:** Create `lib/gyeol/sections.ts`, `lib/gyeol/sections.test.ts`

- [ ] **Step 1: 테스트를 먼저 쓴다**

```ts
// lib/gyeol/sections.test.ts
import { describe, expect, it } from 'vitest'
import { GENRE_INDEX } from './genres'
import { buildSections, SECTION_DEFS } from './sections'
import { workKey, type CatalogEntry } from './types'

function work(i: number, ko: 0 | 1, m: 0 | 1, g: number[]): CatalogEntry {
  return { i, m, t: `T${i}`, y: 2020, p: `${i}.jpg`, g, k: [], ko }
}

/** 모든 섹션이 채워지도록 장르마다 네 분면을 넉넉히 만든다. */
const WORKS: CatalogEntry[] = SECTION_DEFS.flatMap((def, s) =>
  ([[1, 0], [1, 1], [0, 0], [0, 1]] as [0 | 1, 0 | 1][]).flatMap(([ko, m]) =>
    Array.from({ length: 8 }, (_, n) => work(s * 100 + (ko * 2 + m) * 10 + n, ko, m, [
      GENRE_INDEX[def.genres[0]],
    ])),
  ),
)

describe('buildSections', () => {
  it('정의된 섹션을 모두 낸다', () => {
    expect(buildSections(WORKS)).toHaveLength(SECTION_DEFS.length)
  })

  it('섹션마다 요청한 수만큼 채운다', () => {
    for (const section of buildSections(WORKS)) {
      expect(section.works.length, section.name).toBe(6)
    }
  })

  it('같은 작품이 두 섹션에 나오지 않는다', () => {
    // 기생충은 범죄와 코미디 양쪽에 걸린다. 한 화면에 두 번 나오면 이상하다.
    const all = buildSections(WORKS).flatMap((s) => s.works.map(workKey))
    expect(new Set(all).size).toBe(all.length)
  })

  it('섹션 안에서 한국 작품과 드라마가 섞인다', () => {
    // 영화가 인지도 상위를 독점하면 K-드라마 팬이 고를 것이 없어진다
    for (const section of buildSections(WORKS)) {
      expect(section.works.some((w) => w.ko === 1), `${section.name} 한국`).toBe(true)
      expect(section.works.some((w) => w.m === 1), `${section.name} 드라마`).toBe(true)
    }
  })

  it('같은 입력에 같은 결과를 낸다', () => {
    expect(buildSections(WORKS)).toEqual(buildSections(WORKS))
  })

  it('작품이 부족한 섹션은 있는 만큼만 낸다', () => {
    const thin = WORKS.slice(0, 3)
    for (const section of buildSections(thin)) {
      expect(section.works.length).toBeLessThanOrEqual(6)
    }
  })

  it('드라마 장르를 섹션 기준으로 쓰지 않는다', () => {
    // 작품의 60.7%에 붙어 있어 섹션이 뭉개진다
    for (const def of SECTION_DEFS) expect(def.genres, def.name).not.toContain('드라마')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/gyeol/sections.test.ts`
Expected: FAIL — `Failed to resolve import "./sections"`

- [ ] **Step 3: 구현**

```ts
// lib/gyeol/sections.ts
import { GENRE_INDEX } from './genres'
import { workKey, type CatalogEntry, type GenreLabel } from './types'

export type SectionDef = { name: string; genres: GenreLabel[] }
export type Section = { name: string; works: CatalogEntry[] }

/**
 * 1라운드 섹션.
 *
 * **좁은 것부터 먼저 배정한다.** 작품을 한 섹션에만 넣으므로, 넓은 섹션이
 * 먼저 가져가면 좁은 섹션이 굶는다. 공포는 1,568편뿐이고 코미디는 4,423편이라
 * 코미디를 먼저 배정하면 공포 작품이 코미디로 빨려 들어간다.
 *
 * **드라마 장르는 쓰지 않는다.** 작품의 60.7%에 붙어 있어 섹션이 뭉개진다.
 */
export const SECTION_DEFS: SectionDef[] = [
  { name: '공포·오컬트', genres: ['공포'] },
  { name: '사극·전쟁', genres: ['역사', '전쟁'] },
  { name: '애니·가족', genres: ['애니', '가족'] },
  { name: '로맨스', genres: ['로맨스'] },
  { name: 'SF·판타지', genres: ['SF', '판타지'] },
  { name: '범죄·스릴러', genres: ['범죄', '스릴러', '미스터리'] },
  { name: '액션·모험', genres: ['액션', '모험'] },
  { name: '코미디', genres: ['코미디'] },
]

const PER_SECTION = 6

/**
 * 섹션 안에서도 네 분면을 갈라 뽑는다.
 *
 * 갈라두지 않으면 영화가 인지도 상위를 독점해 오징어 게임도 도깨비도 사라진다.
 * `works` 배열이 한국영화 → 한국TV → 해외영화 → 해외TV 순이라 그냥 앞에서
 * 뽑으면 한국 영화만 나온다.
 */
const QUOTA: { ko: 0 | 1; m: 0 | 1; count: number }[] = [
  { ko: 1, m: 0, count: 2 },
  { ko: 1, m: 1, count: 1 },
  { ko: 0, m: 0, count: 2 },
  { ko: 0, m: 1, count: 1 },
]

export function buildSections(works: CatalogEntry[]): Section[] {
  const used = new Set<string>()

  return SECTION_DEFS.map((def) => {
    const wanted = new Set(def.genres.map((g) => GENRE_INDEX[g]))
    const pool = works.filter(
      (w) => !used.has(workKey(w)) && w.g.some((g) => wanted.has(g)),
    )

    const picked: CatalogEntry[] = []
    const take = (candidates: CatalogEntry[], count: number) => {
      for (const work of candidates) {
        if (picked.length >= PER_SECTION || count <= 0) break
        if (picked.includes(work)) continue
        picked.push(work)
        count -= 1
      }
    }

    for (const quota of QUOTA) {
      take(pool.filter((w) => w.ko === quota.ko && w.m === quota.m), quota.count)
    }
    // 쿼터를 못 채운 분면이 있으면 남은 것으로 메운다.
    take(pool, PER_SECTION - picked.length)

    picked.forEach((w) => used.add(workKey(w)))
    return { name: def.name, works: picked }
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/gyeol/sections.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: 실제 카탈로그로 눈 확인**

```bash
npx tsx -e "
import {readFileSync} from 'node:fs'
import {buildSections} from './lib/gyeol/sections'
import type {Catalog} from './lib/gyeol/types'
const c=JSON.parse(readFileSync('public/catalog.json','utf8')) as Catalog
for (const s of buildSections(c.works)) console.log(s.name.padEnd(12)+s.works.map(w=>w.t+(w.ko?'*':'')+(w.m?'TV':'')).join(' · '))
"
```
기대: 각 줄에 알아볼 만한 작품이 6편씩. 범죄·스릴러에 기생충·올드보이·오징어 게임·다크 나이트가, SF·판타지에 설국열차·인터스텔라·왕좌의 게임이 보여야 한다. **모르는 작품만 있는 섹션이 있으면 멈추고 보고하라.**

- [ ] **Step 6: 커밋**

```bash
git add lib/gyeol/sections.ts lib/gyeol/sections.test.ts
git commit -m "feat: lay out round one as exclusive genre sections"
```

---

## Task 2: 2라운드 대결 쌍 선정

**Files:** Create `lib/gyeol/duel.ts`, `lib/gyeol/duel.test.ts`

- [ ] **Step 1: 테스트를 먼저 쓴다**

```ts
// lib/gyeol/duel.test.ts
import { describe, expect, it } from 'vitest'
import { nextDuel, TIE_THRESHOLD } from './duel'
import type { Catalog, CatalogEntry, Gyeol } from './types'

const VOCAB = ['first love', 'nostalgia', 'slow burn', 'unrequited love', 'revenge']
const TYPES: Gyeol[] = [
  { id: 'back-then', name: '그때로', description: '설명'.repeat(20), keywords: ['first love', 'nostalgia'], genres: ['로맨스'] },
  { id: 'late-heart', name: '늦게', description: '설명'.repeat(20), keywords: ['slow burn', 'unrequited love'], genres: ['로맨스'] },
  { id: 'revenge', name: '복수', description: '설명'.repeat(20), keywords: ['revenge'], genres: ['범죄'] },
]

function work(i: number, k: number[]): CatalogEntry {
  return { i, m: 0, t: `T${i}`, y: 2020, p: `${i}.jpg`, g: [], k, ko: 0 }
}

const WORKS = [work(1, [0, 1]), work(2, [2, 3]), work(3, [4]), work(4, [0]), work(5, [2])]
const CATALOG: Catalog = { vocabulary: VOCAB, idf: [1, 1, 1, 1, 1], works: WORKS }

describe('nextDuel', () => {
  it('점수가 가장 붙은 두 결을 겨냥한다', () => {
    const scores = [
      { id: 'back-then', score: 10 },
      { id: 'late-heart', score: 9.8 },
      { id: 'revenge', score: 2 },
    ]
    const duel = nextDuel(scores, CATALOG, TYPES, new Set())!
    expect([duel.left.gyeolId, duel.right.gyeolId].sort()).toEqual(['back-then', 'late-heart'])
  })

  it('두 결을 실제로 가르는 작품을 뽑는다', () => {
    const scores = [
      { id: 'back-then', score: 10 },
      { id: 'late-heart', score: 9.8 },
      { id: 'revenge', score: 2 },
    ]
    const duel = nextDuel(scores, CATALOG, TYPES, new Set())!
    // 왼쪽은 back-then 키워드만, 오른쪽은 late-heart 키워드만 가져야 한다
    const backThenKeys = new Set([0, 1])
    const lateHeartKeys = new Set([2, 3])
    const left = duel.left.gyeolId === 'back-then' ? duel.left : duel.right
    const right = duel.left.gyeolId === 'back-then' ? duel.right : duel.left
    expect(left.work.k.some((k) => backThenKeys.has(k))).toBe(true)
    expect(left.work.k.some((k) => lateHeartKeys.has(k))).toBe(false)
    expect(right.work.k.some((k) => lateHeartKeys.has(k))).toBe(true)
  })

  it('이미 쓴 작품을 다시 내지 않는다', () => {
    const scores = [
      { id: 'back-then', score: 10 },
      { id: 'late-heart', score: 9.8 },
      { id: 'revenge', score: 2 },
    ]
    const first = nextDuel(scores, CATALOG, TYPES, new Set())!
    const used = new Set([`${first.left.work.m}-${first.left.work.i}`, `${first.right.work.m}-${first.right.work.i}`])
    const second = nextDuel(scores, CATALOG, TYPES, used)
    if (second !== null) {
      expect(used.has(`${second.left.work.m}-${second.left.work.i}`)).toBe(false)
      expect(used.has(`${second.right.work.m}-${second.right.work.i}`)).toBe(false)
    }
  })

  it('1위가 충분히 앞서면 null을 낸다', () => {
    // 이미 결판났으면 더 물을 이유가 없다
    const decided = [
      { id: 'back-then', score: 100 },
      { id: 'late-heart', score: 10 },
      { id: 'revenge', score: 2 },
    ]
    expect(nextDuel(decided, CATALOG, TYPES, new Set())).toBeNull()
  })

  it('가를 작품을 못 찾으면 null을 낸다', () => {
    // 던지면 화면이 죽는다. 호출자가 라운드를 끝낼 수 있어야 한다
    const empty: Catalog = { ...CATALOG, works: [] }
    const scores = [
      { id: 'back-then', score: 10 },
      { id: 'late-heart', score: 9.8 },
      { id: 'revenge', score: 2 },
    ]
    expect(nextDuel(scores, empty, TYPES, new Set())).toBeNull()
  })

  it('TIE_THRESHOLD가 0과 1 사이다', () => {
    expect(TIE_THRESHOLD).toBeGreaterThan(0)
    expect(TIE_THRESHOLD).toBeLessThan(1)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/gyeol/duel.test.ts`
Expected: FAIL — `Failed to resolve import "./duel"`

- [ ] **Step 3: 구현**

```ts
// lib/gyeol/duel.ts
import { workKey, type Catalog, type CatalogEntry, type Gyeol, type GyeolScore } from './types'

/**
 * 1위가 2위보다 이 비율만큼 앞서면 결판난 것으로 본다.
 *
 * 실측에서 범죄 취향은 1라운드만으로 45% 차이가 났고, 로맨스 취향은 1%였다.
 * 이미 벌어진 사람에게 더 묻는 것은 시간 낭비다.
 */
export const TIE_THRESHOLD = 0.3

/** 대결 한쪽. 어느 결을 대표하는 작품인지 같이 들고 다닌다. */
export type DuelSide = { gyeolId: string; gyeolName: string; work: CatalogEntry }
export type Duel = { left: DuelSide; right: DuelSide }

/** 상위 몇 개까지 붙었는지 살필지. 너무 넓히면 무관한 결끼리 붙는다. */
const CANDIDATE_COUNT = 4

/**
 * 다음 대결을 고른다. 결판났거나 가를 작품이 없으면 `null`.
 *
 * 1라운드가 기준선을 잡았으니 2라운드가 할 일은 **붙어 있는 후보를 가르는 것**
 * 하나다. 그리드를 더 주는 것으로는 안 갈린다 — 동점인 결들이 똑같이 올라가기
 * 때문이다.
 *
 * 이것은 옛 선택기의 원리와 같다. "정보가 가장 적은 축을 겨냥한다"가
 * "가장 붙어 있는 결을 겨냥한다"로 바뀌었을 뿐이다.
 */
export function nextDuel(
  scores: GyeolScore[],
  catalog: Catalog,
  gyeolTypes: Gyeol[],
  used: ReadonlySet<string>,
): Duel | null {
  const ranked = [...scores].sort((a, b) => b.score - a.score)
  if (ranked.length < 2) return null

  const top = ranked[0].score
  if (top <= 0) return null
  if ((top - ranked[1].score) / top > TIE_THRESHOLD) return null

  const candidates = ranked.slice(0, CANDIDATE_COUNT)
  const byId = new Map(gyeolTypes.map((g) => [g.id, g]))
  const vocabularyIndex = new Map(catalog.vocabulary.map((k, i) => [k, i]))
  const indicesOf = (gyeol: Gyeol) =>
    new Set(
      gyeol.keywords.map((k) => vocabularyIndex.get(k)).filter((i): i is number => i !== undefined),
    )

  /** 상대 결의 키워드는 없고 자기 결의 키워드만 가진 작품 중 가장 유명한 것. */
  const distinctive = (mine: Set<number>, theirs: Set<number>) =>
    catalog.works.find(
      (w) =>
        !used.has(workKey(w)) &&
        w.k.some((k) => mine.has(k)) &&
        !w.k.some((k) => theirs.has(k)),
    )

  // 가장 붙은 쌍부터 시도한다. 가를 작품이 없으면 다음 쌍으로 넘어간다.
  const pairs: [GyeolScore, GyeolScore][] = []
  for (let a = 0; a < candidates.length; a += 1) {
    for (let b = a + 1; b < candidates.length; b += 1) pairs.push([candidates[a], candidates[b]])
  }
  pairs.sort((x, y) => Math.abs(x[0].score - x[1].score) - Math.abs(y[0].score - y[1].score))

  for (const [first, second] of pairs) {
    const one = byId.get(first.id)
    const two = byId.get(second.id)
    if (!one || !two) continue

    const oneKeys = indicesOf(one)
    const twoKeys = indicesOf(two)
    const leftWork = distinctive(oneKeys, twoKeys)
    if (!leftWork) continue
    const rightWork = catalog.works.find(
      (w) =>
        workKey(w) !== workKey(leftWork) &&
        !used.has(workKey(w)) &&
        w.k.some((k) => twoKeys.has(k)) &&
        !w.k.some((k) => oneKeys.has(k)),
    )
    if (!rightWork) continue

    return {
      left: { gyeolId: one.id, gyeolName: one.name, work: leftWork },
      right: { gyeolId: two.id, gyeolName: two.name, work: rightWork },
    }
  }

  return null
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/gyeol/duel.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: 실제 카탈로그로 눈 확인**

```bash
npx tsx -e "
import {readFileSync} from 'node:fs'
import {GYEOL_TYPES} from './data/gyeol-types'
import {matchGyeol} from './lib/gyeol/match'
import {nextDuel} from './lib/gyeol/duel'
import {workKey} from './lib/gyeol/types'
import type {Catalog} from './lib/gyeol/types'
const c=JSON.parse(readFileSync('public/catalog.json','utf8')) as Catalog
const f=(t:string)=>c.works.find(w=>w.t===t)!
for (const [name,titles] of [['로맨스',['아가씨','헤어질 결심','타이타닉','도깨비','20세기 소녀']],['잡식',['기생충','타이타닉','인터스텔라','도깨비','코코']]] as [string,string[]][]) {
  const picks=titles.map(f); const used=new Set(picks.map(workKey))
  console.log('### '+name)
  for (let n=0;n<4;n++) {
    const d=nextDuel(matchGyeol(picks,c,GYEOL_TYPES),c,GYEOL_TYPES,used)
    if(!d){console.log('  결판남');break}
    console.log('  '+d.left.gyeolName+' ['+d.left.work.t+']  vs  '+d.right.gyeolName+' ['+d.right.work.t+']')
    picks.push(d.left.work); used.add(workKey(d.left.work)); used.add(workKey(d.right.work))
  }
}
"
```
기대: 로맨스 취향에서 「그때로 돌아가는 결」과 「마음이 늦게 도착하는 결」이 맞붙고, 각 쪽에 그 결다운 작품이 나온다. **아무도 모르는 작품이 나오거나 같은 결이 반복되면 멈추고 보고하라.**

- [ ] **Step 6: 커밋**

```bash
git add lib/gyeol/duel.ts lib/gyeol/duel.test.ts
git commit -m "feat: pit the tied gyeol candidates against each other"
```

---

## Task 3: 화면 재구성

**Files:** Create `components/SectionGrid.tsx`, `components/Duel.tsx`, Modify `app/pick/page.tsx`, `lib/gyeol/grid.ts`

- [ ] **Step 1: 섹션 그리드**

```tsx
// components/SectionGrid.tsx
'use client'

import { WorkTile } from './WorkTile'
import { workKey, type CatalogEntry } from '@/lib/gyeol/types'
import type { Section } from '@/lib/gyeol/sections'

export function SectionGrid({
  sections,
  selected,
  onToggle,
}: {
  sections: Section[]
  selected: ReadonlySet<string>
  onToggle: (work: CatalogEntry) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.name}>
          <h2 className="mb-2 text-sm font-bold text-neutral-400">{section.name}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {section.works.map((work) => (
              <WorkTile
                key={workKey(work)}
                work={work}
                selected={selected.has(workKey(work))}
                onToggle={() => onToggle(work)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 대결 화면**

```tsx
// components/Duel.tsx
'use client'

import type { Duel as DuelData } from '@/lib/gyeol/duel'
import type { CatalogEntry } from '@/lib/gyeol/types'

export function Duel({
  duel,
  round,
  total,
  onPick,
  onSkip,
}: {
  duel: DuelData
  round: number
  total: number
  onPick: (work: CatalogEntry) => void
  onSkip: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <p className="text-sm text-neutral-500">
          {round} / {total}
        </p>
        <p className="mt-1 break-keep text-lg font-bold">어느 쪽이 더 끌리나요?</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[duel.left, duel.right].map((side) => (
          <button
            key={side.gyeolId}
            onClick={() => onPick(side.work)}
            className="overflow-hidden rounded-2xl bg-neutral-900 text-left transition hover:ring-4 hover:ring-white/60 focus:outline-none focus:ring-4 focus:ring-white/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://image.tmdb.org/t/p/w342/${side.work.p}`}
              alt={side.work.t}
              className="aspect-[2/3] w-full object-cover"
            />
            <span className="block break-keep p-3 text-sm font-bold">{side.work.t}</span>
          </button>
        ))}
      </div>

      <button
        onClick={onSkip}
        className="mx-auto rounded-full border border-neutral-700 px-6 py-2.5 text-sm text-neutral-400 transition hover:bg-neutral-900"
      >
        둘 다 아니에요
      </button>
    </div>
  )
}
```

- [ ] **Step 3: `grid.ts`에서 죽은 함수를 지운다**

`firstGrid`와 `nextGrid`, 그리고 그것들만 쓰던 `interleave`·`byGroup`·`GROUPS`를 지운다. `searchWorks`는 남긴다. `lib/gyeol/grid.test.ts`에서도 해당 describe 블록을 지운다.

- [ ] **Step 4: 고르는 화면을 두 라운드로**

```tsx
// app/pick/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Duel } from '@/components/Duel'
import { SectionGrid } from '@/components/SectionGrid'
import { WorkGrid } from '@/components/WorkGrid'
import { GYEOL_TYPES } from '@/data/gyeol-types'
import { nextDuel } from '@/lib/gyeol/duel'
import { searchWorks } from '@/lib/gyeol/grid'
import { matchGyeol } from '@/lib/gyeol/match'
import { encodePicks } from '@/lib/gyeol/payload'
import { buildSections } from '@/lib/gyeol/sections'
import { useCatalog } from '@/lib/gyeol/use-catalog'
import { workKey, type CatalogEntry } from '@/lib/gyeol/types'

const ROUND_ONE_PICKS = 5
const MAX_DUELS = 6

export default function PickPage() {
  const router = useRouter()
  const { catalog, failed } = useCatalog()
  const [picks, setPicks] = useState<CatalogEntry[]>([])
  const [duelsDone, setDuelsDone] = useState(0)
  const [inRoundTwo, setInRoundTwo] = useState(false)
  const [query, setQuery] = useState('')
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set())

  const selected = useMemo(() => new Set(picks.map(workKey)), [picks])
  const sections = useMemo(() => (catalog ? buildSections(catalog.works) : []), [catalog])
  const searchHits = useMemo(
    () => (catalog ? searchWorks(catalog.works, query, 12) : []),
    [catalog, query],
  )

  const duel = useMemo(() => {
    if (!catalog || !inRoundTwo || duelsDone >= MAX_DUELS) return null
    return nextDuel(matchGyeol(picks, catalog, GYEOL_TYPES), catalog, GYEOL_TYPES, seen)
    // picks가 바뀌면 다음 대결이 새로 뽑힌다. seen은 같이 갱신된다.
  }, [catalog, inRoundTwo, duelsDone, picks, seen])

  function toggle(work: CatalogEntry) {
    const key = workKey(work)
    setPicks((current) =>
      current.some((w) => workKey(w) === key)
        ? current.filter((w) => workKey(w) !== key)
        : [...current, work],
    )
  }

  function finish(finalPicks: CatalogEntry[]) {
    router.push(`/result/?p=${encodePicks(finalPicks.map((w) => ({ i: w.i, m: w.m })))}`)
  }

  function answerDuel(winner: CatalogEntry | null) {
    if (duel === null) return
    setSeen((current) => new Set([...current, workKey(duel.left.work), workKey(duel.right.work)]))
    if (winner !== null) setPicks((current) => [...current, winner])
    setDuelsDone((n) => n + 1)
  }

  if (failed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="break-keep text-neutral-300">작품 목록을 불러오지 못했어요.</p>
        <button onClick={() => location.reload()} className="rounded-full bg-white px-6 py-3 font-bold text-black">
          다시 시도
        </button>
      </main>
    )
  }

  if (!catalog) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse text-neutral-500">작품을 불러오는 중…</p>
      </main>
    )
  }

  // 2라운드가 끝났거나 더 물을 것이 없으면 결과로 보낸다.
  if (inRoundTwo && duel === null) {
    finish(picks)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse text-neutral-500">결을 읽는 중…</p>
      </main>
    )
  }

  if (inRoundTwo) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-6">
        <Duel
          duel={duel!}
          round={duelsDone + 1}
          total={MAX_DUELS}
          onPick={(work) => answerDuel(work)}
          onSkip={() => answerDuel(null)}
        />
      </main>
    )
  }

  const remaining = ROUND_ONE_PICKS - picks.length

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="sticky top-0 z-10 -mx-4 bg-neutral-950/90 px-4 py-3 backdrop-blur">
        <p className="break-keep text-sm text-neutral-400">가장 마음에 드는 {ROUND_ONE_PICKS}편을 골라주세요</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-lg font-bold">
            {picks.length} / {ROUND_ONE_PICKS}
          </span>
          {remaining > 0 ? (
            <span className="text-sm text-neutral-500">{remaining}편 더</span>
          ) : (
            <button
              onClick={() => {
                setSeen(new Set(picks.map(workKey)))
                setInRoundTwo(true)
              }}
              className="ml-auto rounded-full bg-white px-5 py-2 font-bold text-black"
            >
              다음
            </button>
          )}
        </div>
      </header>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="찾는 작품이 없다면 제목으로 검색"
        className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:ring-2 focus:ring-white/40"
      />

      {query.trim() !== '' && <WorkGrid works={searchHits} selected={selected} onToggle={toggle} />}

      <SectionGrid sections={sections} selected={selected} onToggle={toggle} />
    </main>
  )
}
```

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npm run build`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: split picking into a broad round and a tie-breaking round"
```

---

## Task 4: 브라우저 검증

**여기가 진짜 관문이다.** 단위 테스트는 순수 함수만 덮는다.

- [ ] **Step 1: 개발 서버에서 확인**

1. `/pick/` — **섹션 헤더 8개**가 보이고 각 6편. 범죄·스릴러에 기생충·오징어 게임, SF·판타지에 인터스텔라·왕좌의 게임이 있어야 한다
2. 5편을 고르면 "다음"이 나타난다. 4편에서는 안 나온다
3. "다음" → **대결 화면으로 바뀐다.** 두 편이 나란히 뜨고 `1 / 6`이 보인다
4. 한쪽을 고르면 다음 대결로 넘어가고 카운터가 오른다
5. "둘 다 아니에요"를 눌러도 다음으로 넘어간다
6. 6번을 채우거나 결판나면 결과로 간다
7. **로맨스만 고르고 대결을 보면** 「그때로 돌아가는」과 「마음이 늦게 도착하는」이 맞붙어야 한다
8. **범죄만 고르면** 이미 결판나서 대결이 짧게 끝나거나 바로 결과로 갈 수 있다

- [ ] **Step 2: 콘솔 에러 0 확인**

- [ ] **Step 3: 모바일 375px에서 확인**

섹션 그리드가 3열, 대결이 2열로 뜨고 가로 스크롤이 없어야 한다.

- [ ] **Step 4: 발견한 문제를 고치고 커밋**

---

## Task 2 실패 기록 (2026-07-31)

**위 `duel.ts` 코드는 실제 카탈로그에서 무너졌다.** 단위 테스트 6개는 전부 통과했지만 Step 5의 눈 확인에서 드러났다. 로맨스 5편(아가씨·헤어질 결심·타이타닉·도깨비·20세기 소녀)을 고른 사용자에게 나온 대결이 이렇다.

```
계단을 오르내리는 결 [기생충]   vs  단서를 줍는 결 [살인의 추억]
그때로 돌아가는 결 [택시운전사]  vs  마음이 늦게 도착하는 결 [버닝]
계단을 오르내리는 결 [마녀]     vs  화가 나는 결 [판도라]
```

로맨스를 골랐는데 기생충·살인의 추억·마녀·판도라가 나온다. 결함이 둘이다.

**1. `distinctive()`가 사용자 취향을 보지 않는다.** `catalog.works.find(...)`인데 `works` 배열은 한국 영화가 vote_count 순으로 맨 앞이다(`기생충 · 설국열차 · 올드보이 · 부산행 · 살인의 추억`). 조건 키워드만 맞으면 취향과 무관하게 항상 여기서 먼저 걸린다. 주석에는 "가장 유명한 것"이라 써놓고 구현은 "카탈로그 순서 첫 번째"로 했는데 그 둘이 같지 않았다.

**2. 쌍 정렬이 1위를 겨냥하지 않는다.** 실제 점수는 1위 29.2 / 2위 28.9로 붙어 있는데 첫 대결이 3위(15.1) vs 4위(15.0)로 나왔다. 쌍을 점수 차 절댓값으로만 정렬해서 하위권의 더 붙은 쌍이 1·2위를 제쳤다. **가르는 값어치는 1위 근처에 있는데 엉뚱한 데를 팠다.**

**다음 시도에서 고쳐야 할 것**

- 대결을 **"현재 1위 vs 도전자"로 고정**한다. 도전자는 2·3위 중 1위와 가장 붙은 것. 하위권끼리 붙이지 않는다.
- `distinctive()`는 **사용자가 고른 작품과 장르가 겹치는 범위 안에서** 뽑는다. 로맨스를 고르면 로맨스 작품이 나와야 한다.
- 인지도 순서가 필요하면 카탈로그 배열 순서에 기대지 마라. 그 순서는 한국 영화 우선이지 전역 인지도가 아니다.

이 실패는 **단위 테스트가 초록인 채로 기능이 죽는** 이 프로젝트의 세 번째 사례다. 앞선 둘은 그리드 적응(장르가 96.3%를 매칭)과 결 매칭(균등 가중이 희귀 키워드 결을 죽임)이었다.

## 미해결

- **대결이 한 번도 안 나오는 사용자가 있다.** 1라운드에서 이미 30% 이상 벌어지면 `nextDuel`이 바로 `null`을 낸다. 의도한 동작이지만 "다음"을 눌렀는데 결과가 바로 나오면 건너뛴 것처럼 느껴질 수 있다. 브라우저 검증에서 실제 빈도를 보고 판단한다.
- **2라운드 작품도 안 본 것일 수 있다.** 1라운드가 취향 영역을 좁혀놔서 확률은 낮지만 0은 아니다. "둘 다 아니에요"가 그 자리를 메운다.
