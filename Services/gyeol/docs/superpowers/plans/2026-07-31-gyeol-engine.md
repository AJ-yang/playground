# 결(gyeol) 데이터·매칭 엔진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TMDB에서 카탈로그·키워드·추천을 긁어 정적 파일로 굽고, 고른 작품들로 25개 결 중 하나를 판정하는 순수 함수를 만든다.

**Architecture:** 브라우저로 내려가는 색인은 크기가 전부이므로, 작품마다 **결 조건에 등장하는 키워드 118종의 인덱스만** 담는다(`sequel` 같은 잡음은 애초에 색인에 안 들어간다). 장르는 movie/tv에서 id가 갈리므로 빌드 시점에 정규 라벨로 통일한다. 매칭은 IDF 가중 합이며 순수 함수라 노드에서 전부 테스트된다. UI는 이 계획에 없다.

**Tech Stack:** TypeScript, Next.js 16 정적 익스포트, vitest, tsx, TMDB API v3

---

## 사전 확인

이 계획은 아래 두 문서를 전제한다. 착수 전에 읽어라.

- `docs/superpowers/specs/2026-07-31-gyeol-prd.md` — 제품 정의, 카탈로그 경계, 아키텍처
- `docs/superpowers/specs/2026-07-31-gyeol-types.md` — 결 25종의 이름·설명·조건, IDF 근거

`.env.local`에 `TMDB_API_KEY`가 있어야 한다. `tsx`는 `.env.local`을 자동으로 읽지 않으므로 npm 스크립트에 `--env-file=.env.local`을 물린다.

## 파일 구조

**삭제**

| 파일 | 이유 |
|---|---|
| `lib/selector.ts`, `lib/selector.test.ts` | 축 격리 페어 선택. 입력이 그리드 골라담기로 바뀌어 불필요 |
| `lib/scoring.ts`, `lib/scoring.test.ts` | 4축 점수 |
| `lib/pool-health.ts`, `lib/pool-health.test.ts` | 축 격리 검증 |
| `lib/works-pool.test.ts` | 240편 풀 회귀 |
| `lib/types.ts` | 4축 타입 |
| `lib/__fixtures__/pool.ts`, `lib/__fixtures__/must-pair.ts` | 축 픽스처 |
| `data/story-types.ts`, `data/story-types.test.ts` | 16유형 |
| `data/labels.json`, `data/works.json`, `data/candidates.json` | 수작업 라벨과 240편 풀 |
| `scripts/fetch-candidates.ts`, `scripts/build-pool.ts` | 옛 파이프라인 |
| `lib/payload.ts`, `lib/payload.test.ts` | 12쌍 고정 24바이트 포맷. 새 페이로드는 TMDB id를 가변 길이로 담아 완전히 다르다 |

`lib/payload.ts`를 남기려다 말았다. `lib/types.ts`에서 `ROUNDS`와 `Choice`를 가져오므로 타입을 지우는 순간 컴파일이 깨진다. 어차피 포맷이 통째로 바뀌므로 계획 2에서 새로 쓴다.

`lib/rng.ts`는 **남긴다.** import가 하나도 없는 독립 모듈이고 테스트도 붙어 있다. 그리드 적응 로직에서 결정론적 셔플이 필요해질 수 있다.

**생성**

| 파일 | 책임 |
|---|---|
| `lib/gyeol/types.ts` | 공용 타입. 다른 모듈이 전부 여기서 가져간다 |
| `lib/gyeol/genres.ts` | TMDB 장르 id(movie/tv) → 정규 라벨 |
| `data/gyeol-types.ts` | 결 25종 데이터 |
| `lib/gyeol/vocabulary.ts` | 결 조건에서 조건 키워드 어휘를 뽑는다 |
| `lib/gyeol/idf.ts` | 문서빈도 → IDF |
| `lib/gyeol/match.ts` | 고른 작품들 → 결 판정 |
| `scripts/fetch-catalog.ts` | TMDB discover → `data/catalog.raw.json` |
| `scripts/fetch-keywords.ts` | 작품별 키워드 → `data/keywords.raw.json` |
| `scripts/build-catalog.ts` | 위 둘 + 결 어휘 → `public/catalog.json` |
| `scripts/fetch-recommendations.ts` | 작품별 추천 → `public/rec/<m>-<id>.json` |
| `lib/gyeol/catalog.test.ts` | 실제 생성된 `public/catalog.json` 회귀 |

---

## Task 1: 공용 타입

**Files:**
- Create: `lib/gyeol/types.ts`

- [ ] **Step 1: 타입 파일을 만든다**

```ts
// lib/gyeol/types.ts

/** 0 = 영화, 1 = TV. 색인 크기를 줄이려고 문자열 대신 숫자를 쓴다. */
export type Media = 0 | 1

/** movie/tv에서 TMDB 장르 id가 갈리므로 빌드 시점에 이 라벨로 통일한다. */
export const GENRE_LABELS = [
  '액션', '모험', '애니', '코미디', '범죄', '다큐', '드라마', '가족',
  '판타지', '역사', '공포', '음악', '미스터리', '로맨스', 'SF', '스릴러',
  '전쟁', '서부',
] as const

export type GenreLabel = (typeof GENRE_LABELS)[number]

/**
 * 브라우저로 내려가는 작품 한 건.
 *
 * 키를 한 글자로 줄인 이유는 색인이 통째로 다운로드되기 때문이다. 작품 하나가
 * 44바이트 안팎이어야 13,000편을 감당할 수 있다.
 *
 * `k`는 키워드 이름이 아니라 **조건 키워드 어휘의 인덱스**다. 결 조건에 등장하지
 * 않는 키워드(`sequel`, `aftercreditsstinger` 등)는 점수에 절대 들어가지 않으므로
 * 색인에도 담지 않는다.
 */
export type CatalogEntry = {
  /** TMDB id */
  i: number
  m: Media
  /** 제목 */
  t: string
  /** 연도. 미상이면 0 */
  y: number
  /** 포스터 경로. 앞 슬래시를 뗀 형태 */
  p: string
  /** GENRE_LABELS 인덱스 */
  g: number[]
  /** 조건 키워드 어휘 인덱스 */
  k: number[]
  /** 한국어 작품이면 1 */
  ko: 0 | 1
}

/** 브라우저가 받는 색인 전체. IDF를 같이 실어 클라이언트가 계산하지 않게 한다. */
export type Catalog = {
  /** 조건 키워드 어휘. CatalogEntry.k가 이 배열의 인덱스를 가리킨다 */
  vocabulary: string[]
  /** vocabulary와 같은 길이. 인덱스별 IDF 점수 */
  idf: number[]
  works: CatalogEntry[]
}

export type Gyeol = {
  /** 안정적인 식별자. 공유 링크나 통계에서 쓰므로 바꾸지 않는다 */
  id: string
  name: string
  description: string
  /** TMDB 키워드 이름. 실존하는 것만 쓴다 */
  keywords: string[]
  genres: GenreLabel[]
}

export type GyeolScore = { id: string; score: number }
```

- [ ] **Step 2: 타입만 있는 파일이라 컴파일로 검증한다**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (기존 파일의 에러가 섞여 나오면 Task 2에서 삭제하므로 무시)

- [ ] **Step 3: 커밋**

```bash
git add lib/gyeol/types.ts
git commit -m "feat: add gyeol shared types"
```

---

## Task 2: 옛 4축 코드 삭제

**Files:**
- Delete: 위 "파일 구조 / 삭제" 표의 모든 파일

- [ ] **Step 1: 삭제하기 전에 무엇이 이들을 참조하는지 확인한다**

Run:
```bash
grep -rn --include='*.ts' --include='*.tsx' -e "lib/selector" -e "lib/scoring" -e "lib/types" -e "story-types" -e "pool-health" -e "works.json" app components lib data scripts
```
Expected: `app/play/page.tsx`, `app/r/[code]/page.tsx`, `app/r/[code]/opengraph-image.tsx`, `components/ResultDetails.tsx`, `components/AxisBars.tsx`가 걸린다. 이들은 계획 2에서 새로 쓰므로 함께 지운다.

- [ ] **Step 2: 지운다**

```bash
git rm lib/selector.ts lib/selector.test.ts lib/scoring.ts lib/scoring.test.ts \
       lib/pool-health.ts lib/pool-health.test.ts lib/works-pool.test.ts lib/types.ts \
       lib/payload.ts lib/payload.test.ts \
       lib/__fixtures__/pool.ts lib/__fixtures__/must-pair.ts \
       data/story-types.ts data/story-types.test.ts \
       data/labels.json data/works.json data/candidates.json \
       scripts/fetch-candidates.ts scripts/build-pool.ts
git rm -r "app/r" app/play components/AxisBars.tsx components/ResultDetails.tsx components/ShareButton.tsx
```

- [ ] **Step 3: 랜딩을 임시로 최소화한다**

`app/page.tsx`가 `/play`를 링크하는데 그 경로가 사라졌다. 계획 2에서 다시 만들 때까지 링크만 뗀다.

```tsx
// app/page.tsx
export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="text-4xl font-black leading-tight sm:text-5xl">결</h1>
      <p className="break-keep leading-relaxed text-neutral-400">준비 중입니다.</p>
    </main>
  )
}
```

- [ ] **Step 4: 빌드와 테스트가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run && npx eslint`
Expected: tsc 에러 0, 테스트는 `lib/rng.test.ts`만 남아 통과, lint 통과

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore: remove the four-axis engine

입력이 그리드 골라담기로 바뀌면서 축 격리 선택기와 4축 점수 계산이
전부 근거를 잃었다. 작품마다 사람이 축을 라벨링하던 구조도 함께
버린다. 그것이 풀 240편 상한의 원인이었다."
```

---

## Task 3: 장르 정규화

TMDB는 영화와 TV에 다른 장르 체계를 쓴다. TV의 `10759 Action & Adventure`는 영화의 `28 액션` + `12 모험`에 해당하고, `10765 Sci-Fi & Fantasy`는 `878 SF` + `14 판타지`에 해당한다. 이걸 통일하지 않으면 같은 결 조건이 영화에만 걸린다.

**Files:**
- Create: `lib/gyeol/genres.ts`
- Test: `lib/gyeol/genres.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// lib/gyeol/genres.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeGenres, GENRE_INDEX } from './genres'
import { GENRE_LABELS } from './types'

describe('normalizeGenres', () => {
  it('영화 장르 id를 라벨 인덱스로 바꾼다', () => {
    // 28 액션, 878 SF
    expect(normalizeGenres([28, 878], 0).map((i) => GENRE_LABELS[i]).sort()).toEqual(['SF', '액션'])
  })

  it('TV의 합성 장르를 두 라벨로 쪼갠다', () => {
    // 10759 Action & Adventure -> 액션 + 모험
    expect(normalizeGenres([10759], 1).map((i) => GENRE_LABELS[i]).sort()).toEqual(['모험', '액션'])
  })

  it('TV의 SF&판타지를 SF와 판타지로 쪼갠다', () => {
    expect(normalizeGenres([10765], 1).map((i) => GENRE_LABELS[i]).sort()).toEqual(['SF', '판타지'])
  })

  it('영화와 TV에서 같은 뜻인 장르는 같은 인덱스로 모인다', () => {
    // 18 드라마는 양쪽 공통
    expect(normalizeGenres([18], 0)).toEqual(normalizeGenres([18], 1))
  })

  it('대응 라벨이 없는 장르는 버린다', () => {
    // 10763 뉴스, 10767 토크는 취향과 무관하다
    expect(normalizeGenres([10763, 10767], 1)).toEqual([])
  })

  it('중복을 제거한다', () => {
    // TV에서 10759(액션+모험)와 12(모험)가 같이 오면 모험이 두 번 나오면 안 된다
    const out = normalizeGenres([10759, 12], 1)
    expect(new Set(out).size).toBe(out.length)
  })

  it('GENRE_INDEX가 모든 라벨을 덮는다', () => {
    for (const label of GENRE_LABELS) {
      expect(GENRE_INDEX[label], label).toBeGreaterThanOrEqual(0)
    }
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run lib/gyeol/genres.test.ts`
Expected: FAIL — `Failed to resolve import "./genres"`

- [ ] **Step 3: 최소 구현을 쓴다**

```ts
// lib/gyeol/genres.ts
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run lib/gyeol/genres.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: 커밋**

```bash
git add lib/gyeol/genres.ts lib/gyeol/genres.test.ts
git commit -m "feat: normalize TMDB movie and tv genres to one label set

TV의 Action & Adventure는 영화의 액션과 모험을 묶은 것이라 통일하지
않으면 같은 결 조건이 영화에만 걸린다."
```

---

## Task 4: 결 25종 데이터

`docs/superpowers/specs/2026-07-31-gyeol-types.md`의 25개를 그대로 옮긴다. **문안을 임의로 고치지 마라.** 그 문서가 정본이고 문장이 제품의 대부분이다.

**Files:**
- Create: `data/gyeol-types.ts`
- Test: `data/gyeol-types.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// data/gyeol-types.test.ts
import { describe, expect, it } from 'vitest'
import { GYEOL_TYPES } from './gyeol-types'
import { GENRE_LABELS } from '../lib/gyeol/types'

describe('GYEOL_TYPES', () => {
  it('25개다', () => {
    expect(GYEOL_TYPES).toHaveLength(25)
  })

  it('id가 서로 겹치지 않는다', () => {
    const ids = GYEOL_TYPES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('이름이 서로 겹치지 않는다', () => {
    const names = GYEOL_TYPES.map((g) => g.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('모든 결이 이름과 설명을 갖는다', () => {
    for (const g of GYEOL_TYPES) {
      expect(g.name.length, g.id).toBeGreaterThan(0)
      expect(g.description.length, g.id).toBeGreaterThan(20)
    }
  })

  it('설명이 사용자를 인격으로 규정하지 않는다', () => {
    // 우리가 잰 것은 무엇을 골랐는가뿐이다. PRD 1절.
    for (const g of GYEOL_TYPES) {
      expect(g.description, g.id).not.toMatch(/당신은 .*사람입니다/)
    }
  })

  it('모든 결이 조건 키워드를 2개 이상 갖는다', () => {
    // 하나뿐이면 그 키워드가 드문 순간 아무도 안 걸린다
    for (const g of GYEOL_TYPES) {
      expect(g.keywords.length, g.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('장르 조건이 정규 라벨만 쓴다', () => {
    for (const g of GYEOL_TYPES) {
      for (const label of g.genres) {
        expect(GENRE_LABELS, `${g.id}: ${label}`).toContain(label)
      }
    }
  })

  it('드라마 장르를 조건에 쓰지 않는다', () => {
    // 작품의 60.7%에 붙어 있어 변별력이 없다. PRD 4절.
    for (const g of GYEOL_TYPES) {
      expect(g.genres, g.id).not.toContain('드라마')
    }
  })

  it('조건 키워드가 소문자다', () => {
    // TMDB 키워드는 전부 소문자다. 대문자가 섞이면 조용히 매칭에 실패한다.
    for (const g of GYEOL_TYPES) {
      for (const k of g.keywords) {
        expect(k, `${g.id}: ${k}`).toBe(k.toLowerCase())
      }
    }
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run data/gyeol-types.test.ts`
Expected: FAIL — `Failed to resolve import "./gyeol-types"`

- [ ] **Step 3: 데이터를 옮긴다**

스펙 문서의 25개를 아래 형태로 옮긴다. 처음 두 개를 예로 든다. **나머지 23개도 같은 방식으로 전부 채워라.** `장르` 줄에 `드라마`가 있던 결(4, 12, 14, 17, 18, 20, 21, 22, 24, 25)은 위 테스트가 막으므로 드라마를 뺀 나머지만 옮긴다.

```ts
// data/gyeol-types.ts
import type { Gyeol } from '../lib/gyeol/types'

/**
 * 정본은 docs/superpowers/specs/2026-07-31-gyeol-types.md 다.
 * 문안을 고칠 일이 생기면 그 문서를 먼저 고치고 여기로 옮긴다.
 *
 * 조건 키워드는 TMDB에 실존하는 것만 쓴다. 스펙 작성 시 123개를 전수
 * 검사해 118개 실존을 확인했고 없던 5개는 대체어로 바꿨다.
 *
 * `genres`에 '드라마'를 넣지 않는다. 작품의 60.7%에 붙어 있어 변별력이 없다.
 */
export const GYEOL_TYPES: Gyeol[] = [
  {
    id: 'revenge',
    name: '서늘한 복수의 결',
    description:
      '소리치는 분노를 믿지 않습니다. 참던 사람이 마침내 움직이는 순간을 위해 앞의 두 시간을 견딜 수 있는 사람입니다. 평화로운 오프닝은 좀 못 참고요.',
    keywords: ['revenge', 'murder', 'neo-noir', 'corruption', 'gangster', 'organized crime'],
    genres: ['범죄', '스릴러'],
  },
  {
    id: 'clue',
    name: '단서를 줍는 결',
    description:
      '범인이 누구인지보다 어떻게 알아냈는지가 궁금합니다. 결말을 먼저 본 적은 한 번도 없습니다. 그런 사람을 좀 경멸하는 편이고요.',
    keywords: ['investigation', 'detective', 'police', 'serial killer', 'mystery', 'missing person'],
    genres: ['미스터리', '범죄'],
  },
  // ... 나머지 23개를 스펙 문서 순서대로 채운다
]
```

id는 스펙 문서 순서대로 다음을 쓴다. **바꾸지 마라** — 공유 링크와 통계가 이 값을 참조한다.

| # | id | 이름 |
|---|---|---|
| 1 | `revenge` | 서늘한 복수의 결 |
| 2 | `clue` | 단서를 줍는 결 |
| 3 | `suspicion` | 의심이 자라는 결 |
| 4 | `anger` | 화가 나는 결 |
| 5 | `dark-room` | 불 끄고 보는 결 |
| 6 | `survivor` | 끝까지 남는 결 |
| 7 | `smash` | 크게 부수는 결 |
| 8 | `cape` | 망토를 믿는 결 |
| 9 | `far-sight` | 멀리 보는 결 |
| 10 | `rewind` | 되돌리고 싶은 결 |
| 11 | `other-rules` | 규칙이 다른 세계의 결 |
| 12 | `late-heart` | 마음이 늦게 도착하는 결 |
| 13 | `bicker` | 티격태격의 결 |
| 14 | `back-then` | 그때로 돌아가는 결 |
| 15 | `growing-up` | 어른이 되는 중인 결 |
| 16 | `together` | 같이 가는 결 |
| 17 | `dinner-table` | 밥상 앞의 결 |
| 18 | `laugh-then-chill` | 웃다가 서늘해지는 결 |
| 19 | `no-thinking` | 아무 생각 없고 싶은 결 |
| 20 | `old-clothes` | 옛 옷을 입은 결 |
| 21 | `stairs` | 계단을 오르내리는 결 |
| 22 | `real-happened` | 진짜 있었던 결 |
| 23 | `drawn-tears` | 그림으로 우는 결 |
| 24 | `sound` | 소리에 약한 결 |
| 25 | `lingering` | 오래 남는 결 |

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run data/gyeol-types.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: 커밋**

```bash
git add data/gyeol-types.ts data/gyeol-types.test.ts
git commit -m "feat: add the 25 gyeol type definitions"
```

---

## Task 5: 조건 키워드 어휘

**Files:**
- Create: `lib/gyeol/vocabulary.ts`
- Test: `lib/gyeol/vocabulary.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// lib/gyeol/vocabulary.test.ts
import { describe, expect, it } from 'vitest'
import { buildVocabulary } from './vocabulary'
import type { Gyeol } from './types'

const FIXTURE: Gyeol[] = [
  { id: 'a', name: 'A', description: '설명'.repeat(20), keywords: ['revenge', 'murder'], genres: ['범죄'] },
  { id: 'b', name: 'B', description: '설명'.repeat(20), keywords: ['murder', 'police'], genres: ['미스터리'] },
]

describe('buildVocabulary', () => {
  it('모든 결의 조건 키워드를 합집합으로 모은다', () => {
    expect(new Set(buildVocabulary(FIXTURE))).toEqual(new Set(['revenge', 'murder', 'police']))
  })

  it('중복을 제거한다', () => {
    const vocab = buildVocabulary(FIXTURE)
    expect(new Set(vocab).size).toBe(vocab.length)
  })

  it('순서가 결정적이다', () => {
    // 색인의 k가 이 배열의 인덱스를 가리키므로 순서가 흔들리면 색인이 통째로 어긋난다
    expect(buildVocabulary(FIXTURE)).toEqual(buildVocabulary(FIXTURE))
    expect(buildVocabulary(FIXTURE)).toEqual([...buildVocabulary(FIXTURE)].sort())
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run lib/gyeol/vocabulary.test.ts`
Expected: FAIL — `Failed to resolve import "./vocabulary"`

- [ ] **Step 3: 최소 구현을 쓴다**

```ts
// lib/gyeol/vocabulary.ts
import type { Gyeol } from './types'

/**
 * 결 조건에 등장하는 키워드만 모은다.
 *
 * 이 어휘 밖의 키워드는 점수에 절대 들어가지 않으므로 색인에도 담지 않는다.
 * `sequel`이나 `aftercreditsstinger` 같은 제작 메타데이터가 자동으로 걸러지는
 * 것이 이 구조의 이점이다. 별도의 차단 목록이 필요 없다.
 *
 * **정렬해서 반환하는 이유**: CatalogEntry.k가 이 배열의 인덱스를 담으므로
 * 순서가 흔들리면 이미 구워둔 색인이 통째로 다른 키워드를 가리킨다.
 */
export function buildVocabulary(gyeolTypes: Gyeol[]): string[] {
  const all = new Set<string>()
  for (const g of gyeolTypes) {
    for (const k of g.keywords) all.add(k)
  }
  return [...all].sort()
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run lib/gyeol/vocabulary.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: 커밋**

```bash
git add lib/gyeol/vocabulary.ts lib/gyeol/vocabulary.test.ts
git commit -m "feat: derive the condition keyword vocabulary from gyeol types"
```

---

## Task 6: IDF 계산

**Files:**
- Create: `lib/gyeol/idf.ts`
- Test: `lib/gyeol/idf.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// lib/gyeol/idf.test.ts
import { describe, expect, it } from 'vitest'
import { computeIdf } from './idf'

describe('computeIdf', () => {
  it('흔한 키워드가 드문 키워드보다 낮은 점수를 받는다', () => {
    // 어휘 [흔함, 드묾], 작품 4편 중 3편이 0번을, 1편이 1번을 갖는다
    const idf = computeIdf(2, [[0], [0], [0], [1]])
    expect(idf[0]).toBeLessThan(idf[1])
  })

  it('아무 작품에도 없는 키워드도 점수를 낸다', () => {
    // 0으로 나누기가 나면 매칭이 NaN으로 죽는다
    const idf = computeIdf(2, [[0], [0]])
    expect(Number.isFinite(idf[1])).toBe(true)
    expect(idf[1]).toBeGreaterThan(0)
  })

  it('어휘 길이만큼 반환한다', () => {
    expect(computeIdf(5, [[0, 1]])).toHaveLength(5)
  })

  it('한 작품이 같은 키워드를 두 번 가져도 한 번으로 센다', () => {
    const dup = computeIdf(1, [[0, 0], [0, 0]])
    const single = computeIdf(1, [[0], [0]])
    expect(dup[0]).toBeCloseTo(single[0])
  })

  it('모든 점수가 양수다', () => {
    // log 안의 값이 1 이하가 되면 0이나 음수가 나와 흔한 키워드가 감점이 된다
    const idf = computeIdf(3, [[0, 1, 2], [0, 1, 2]])
    for (const v of idf) expect(v).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run lib/gyeol/idf.test.ts`
Expected: FAIL — `Failed to resolve import "./idf"`

- [ ] **Step 3: 최소 구현을 쓴다**

```ts
// lib/gyeol/idf.ts

/**
 * 조건 키워드별 IDF를 낸다.
 *
 * 균등 가중을 주면 흔한 키워드로 만든 결이 희귀한 키워드로 만든 결을 이긴다.
 * `murder`·`revenge`는 카탈로그에 널려 있고 `whistleblower`·`concert`는 드물어서,
 * 스펙 작성 시 측정에서 「화가 나는 결」과 「소리에 약한 결」이 한 번도 1위를
 * 못 했다. IDF를 넣자 25개가 전부 등장했다.
 *
 * `+1` 보정은 df가 0인 키워드에서 0으로 나누기를 막는다. 그 경우에도 유한한
 * 큰 값이 나와야 매칭이 NaN으로 죽지 않는다.
 *
 * @param vocabularySize 어휘 길이
 * @param workKeywordIndices 작품별 조건 키워드 인덱스 목록
 */
export function computeIdf(vocabularySize: number, workKeywordIndices: number[][]): number[] {
  const df = new Array<number>(vocabularySize).fill(0)
  for (const indices of workKeywordIndices) {
    for (const index of new Set(indices)) {
      if (index >= 0 && index < vocabularySize) df[index] += 1
    }
  }
  const total = workKeywordIndices.length
  return df.map((count) => Math.log((total + 1) / (count + 1)) + 1)
}
```

`+ 1`을 더하는 이유: 모든 작품이 가진 키워드는 `log(1) = 0`이 되어 점수에서 사라진다. 조건에 맞았다는 사실 자체에 최소 점수를 주려면 바닥이 필요하다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run lib/gyeol/idf.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: 커밋**

```bash
git add lib/gyeol/idf.ts lib/gyeol/idf.test.ts
git commit -m "feat: weight condition keywords by inverse document frequency"
```

---

## Task 7: 결 매칭

**Files:**
- Create: `lib/gyeol/match.ts`
- Test: `lib/gyeol/match.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// lib/gyeol/match.test.ts
import { describe, expect, it } from 'vitest'
import { matchGyeol, GENRE_BONUS } from './match'
import { GENRE_INDEX } from './genres'
import type { Catalog, CatalogEntry, Gyeol } from './types'

const VOCAB = ['chaebol', 'murder', 'revenge']
const TYPES: Gyeol[] = [
  {
    id: 'revenge', name: '서늘한 복수의 결', description: '설명'.repeat(20),
    keywords: ['revenge', 'murder'], genres: ['범죄'],
  },
  {
    id: 'stairs', name: '계단을 오르내리는 결', description: '설명'.repeat(20),
    keywords: ['chaebol'], genres: ['로맨스'],
  },
]

function work(k: number[], g: number[] = []): CatalogEntry {
  return { i: 1, m: 0, t: 'T', y: 2020, p: 'a.jpg', g, k, ko: 0 }
}

/** murder는 흔하고(idf 낮음) chaebol은 드물다(idf 높음). */
const CATALOG: Catalog = { vocabulary: VOCAB, idf: [5, 1, 2], works: [] }

describe('matchGyeol', () => {
  it('조건 키워드가 맞으면 그 결의 점수가 오른다', () => {
    const scores = matchGyeol([work([2])], CATALOG, TYPES)
    expect(scores.find((s) => s.id === 'revenge')!.score).toBeGreaterThan(0)
  })

  it('희귀 키워드 하나가 흔한 키워드 하나를 이긴다', () => {
    // chaebol(idf 5) 한 번 vs murder(idf 1) 한 번
    const scores = matchGyeol([work([0]), work([1])], CATALOG, TYPES)
    const stairs = scores.find((s) => s.id === 'stairs')!.score
    const revenge = scores.find((s) => s.id === 'revenge')!.score
    expect(stairs).toBeGreaterThan(revenge)
  })

  it('장르가 맞으면 보정 점수가 붙는다', () => {
    const withGenre = matchGyeol([work([], [GENRE_INDEX['범죄']])], CATALOG, TYPES)
    expect(withGenre.find((s) => s.id === 'revenge')!.score).toBeCloseTo(GENRE_BONUS)
  })

  it('점수가 높은 순으로 정렬해 반환한다', () => {
    const scores = matchGyeol([work([0, 2])], CATALOG, TYPES)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score)
    }
  })

  it('25개가 아니라 넘긴 결 수만큼 반환한다', () => {
    expect(matchGyeol([work([0])], CATALOG, TYPES)).toHaveLength(TYPES.length)
  })

  it('고른 작품이 없으면 전부 0점이다', () => {
    // 결과 화면이 빈 선택으로 열리는 경우가 있으면 여기서 터지면 안 된다
    const scores = matchGyeol([], CATALOG, TYPES)
    expect(scores.every((s) => s.score === 0)).toBe(true)
  })

  it('여러 작품의 신호가 누적된다', () => {
    const one = matchGyeol([work([2])], CATALOG, TYPES)
    const two = matchGyeol([work([2]), work([2])], CATALOG, TYPES)
    expect(two.find((s) => s.id === 'revenge')!.score)
      .toBeGreaterThan(one.find((s) => s.id === 'revenge')!.score)
  })

  it('어휘 밖 인덱스를 무시한다', () => {
    // 색인이 갱신되며 어휘가 줄면 옛 링크가 범위 밖 인덱스를 담고 올 수 있다
    expect(() => matchGyeol([work([99])], CATALOG, TYPES)).not.toThrow()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run lib/gyeol/match.test.ts`
Expected: FAIL — `Failed to resolve import "./match"`

- [ ] **Step 3: 최소 구현을 쓴다**

```ts
// lib/gyeol/match.ts
import { GENRE_INDEX } from './genres'
import type { Catalog, CatalogEntry, Gyeol, GyeolScore } from './types'

/**
 * 장르가 맞을 때 붙는 고정 점수.
 *
 * 키워드 IDF에 비해 작게 잡는다. 장르는 커버리지가 100%지만 드라마 하나가
 * 작품의 60.7%에 붙어 있어 변별력이 낮다 (PRD 4절). 보정 이상의 역할을 주면
 * 결이 장르로 뭉개진다.
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run lib/gyeol/match.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: 커밋**

```bash
git add lib/gyeol/match.ts lib/gyeol/match.test.ts
git commit -m "feat: score gyeol types from picked works"
```

---

## Task 8: TMDB 카탈로그 수집

카탈로그 경계는 PRD 8절이 정했다. **한국어 작품은 `vote_count >= 50`, 그 외는 `>= 300`.** 단일 하한을 쓰면 한국 드라마가 81편으로 줄어 그리드를 채울 수 없다.

TMDB `discover`는 페이지 500이 상한이다. 영화가 그 경계에 걸리므로 도달한 페이지 수를 로그로 남긴다.

**Files:**
- Create: `scripts/fetch-catalog.ts`
- Modify: `package.json` (스크립트 추가)

- [ ] **Step 1: 수집 스크립트를 쓴다**

```ts
// scripts/fetch-catalog.ts
import { writeFileSync } from 'node:fs'

/**
 * TMDB discover로 카탈로그 후보를 긁어 data/catalog.raw.json으로 쓴다.
 *
 * 국적별로 하한이 다른 이유는 TMDB 투표자가 서구권이기 때문이다. 단일 하한
 * 300을 적용하면 슬기로운 의사생활(174표), 미생(76표), 무빙(299표)이 전부
 * 탈락해 한국 드라마가 81편만 남는다 (PRD 8절).
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
```

- [ ] **Step 2: npm 스크립트를 추가한다**

`package.json`의 `scripts`에 넣는다. `tsx`는 `.env.local`을 자동으로 읽지 않는다.

```json
"fetch:catalog": "tsx --env-file=.env.local scripts/fetch-catalog.ts",
```

- [ ] **Step 3: 돌려서 확인한다**

Run: `npm run fetch:catalog`
Expected: `카탈로그 13,xxx편 (한국 9xx편) → data/catalog.raw.json`. 한국 작품이 900편 미만이면 하한 설정이 잘못된 것이므로 멈추고 확인한다.

- [ ] **Step 4: 산출물을 gitignore에 넣는다**

`data/*.raw.json`은 재생성 가능하고 크므로 커밋하지 않는다. `.gitignore`에 추가한다.

```
# 재생성 가능한 TMDB 원본
data/*.raw.json
```

- [ ] **Step 5: 커밋**

```bash
git add scripts/fetch-catalog.ts package.json .gitignore
git commit -m "feat: fetch the catalog with per-nationality vote thresholds"
```

---

## Task 9: 키워드 수집

**Files:**
- Create: `scripts/fetch-keywords.ts`
- Modify: `package.json`

- [ ] **Step 1: 수집 스크립트를 쓴다**

```ts
// scripts/fetch-keywords.ts
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
```

- [ ] **Step 2: npm 스크립트를 추가한다**

```json
"fetch:keywords": "tsx --env-file=.env.local scripts/fetch-keywords.ts",
```

- [ ] **Step 3: 돌려서 확인한다**

Run: `npm run fetch:keywords`
Expected: `키워드 13,xxx건 (빈 작품 5xx건)`. 빈 작품 비율이 10%를 넘으면 요청이 실패하고 있는 것이므로 멈추고 확인한다. 스펙 측정에서는 4%였다.

- [ ] **Step 4: 커밋**

```bash
git add scripts/fetch-keywords.ts package.json
git commit -m "feat: fetch per-work TMDB keywords"
```

---

## Task 10: 색인 빌드

**Files:**
- Create: `scripts/build-catalog.ts`
- Modify: `package.json`

- [ ] **Step 1: 빌드 스크립트를 쓴다**

```ts
// scripts/build-catalog.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
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

  const matched = entries.filter((e) => e.k.length > 0).length
  console.log(`작품 ${entries.length}편 → public/catalog.json`)
  console.log(`  어휘 ${vocabulary.length}종`)
  console.log(`  조건 키워드를 1개 이상 가진 작품 ${matched}편 (${((100 * matched) / entries.length).toFixed(1)}%)`)
  console.log(`  raw ${(json.length / 1024).toFixed(0)}KB / gzip ${(gzipSync(json).length / 1024).toFixed(0)}KB`)
}

main()
```

- [ ] **Step 2: npm 스크립트를 추가한다**

```json
"build:catalog": "tsx scripts/build-catalog.ts",
```

- [ ] **Step 3: 돌려서 확인한다**

Run: `npm run build:catalog`
Expected: 어휘 118종 안팎, 조건 키워드 보유율 60% 이상, gzip 400KB 이하. 보유율이 40% 미만이면 어휘와 실제 키워드가 어긋난 것이므로 멈추고 `data/keywords.raw.json`을 열어 확인한다.

- [ ] **Step 4: 산출물을 gitignore에 넣는다**

```
# 재생성 가능한 색인
public/catalog.json
public/rec/
```

- [ ] **Step 5: 커밋**

```bash
git add scripts/build-catalog.ts package.json .gitignore
git commit -m "feat: build the browser catalog index"
```

---

## Task 11: 실제 색인 회귀 테스트

합성 픽스처만으로는 실제 색인이 성겨지는 것을 못 잡는다. 스펙 12절이 남긴 **"한국 작품 편중 미확인"**을 여기서 닫는다.

**Files:**
- Create: `lib/gyeol/catalog.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: vitest가 이 테스트를 수집하게 한다**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'data/**/*.test.ts'],
  },
})
```

이미 `lib/**`를 포함하므로 변경이 없다. 확인만 하고 넘어간다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```ts
// lib/gyeol/catalog.test.ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GYEOL_TYPES } from '../../data/gyeol-types'
import { matchGyeol } from './match'
import { buildVocabulary } from './vocabulary'
import type { Catalog } from './types'

/**
 * 합성 픽스처가 아니라 실제로 배포되는 public/catalog.json을 검증한다.
 *
 * 다른 테스트는 작은 픽스처를 쓰기 때문에 실제 색인이 성겨져 결이 뭉개지는
 * 상황을 잡지 못한다. 이 실패는 조용해서, 색인을 다시 구울 때마다 여기서
 * 걸리지 않으면 아무도 눈치채지 못한다.
 */
const PATH = 'public/catalog.json'
const missing = !existsSync(PATH)

describe.skipIf(missing)('public/catalog.json', () => {
  const catalog = missing ? null : (JSON.parse(readFileSync(PATH, 'utf8')) as Catalog)

  it('어휘가 결 조건과 일치한다', () => {
    expect(catalog!.vocabulary).toEqual(buildVocabulary(GYEOL_TYPES))
  })

  it('idf가 어휘와 같은 길이다', () => {
    expect(catalog!.idf).toHaveLength(catalog!.vocabulary.length)
  })

  it('모든 작품이 포스터를 가진다', () => {
    for (const w of catalog!.works) expect(w.p, w.t).toMatch(/^\S+\.(jpg|png|webp)$/)
  })

  it('조건 키워드 인덱스가 어휘 범위 안이다', () => {
    const max = catalog!.vocabulary.length
    for (const w of catalog!.works) {
      for (const k of w.k) expect(k, w.t).toBeLessThan(max)
    }
  })

  it('한국 작품이 900편 이상이다', () => {
    // 단일 하한 300을 쓰면 194편으로 줄어 한국 사용자에게 그리드를 못 깐다
    expect(catalog!.works.filter((w) => w.ko === 1).length).toBeGreaterThanOrEqual(900)
  })

  it('한국 특화 결이 실제 카탈로그에서도 걸린다', () => {
    // 스펙 12절의 미해결 항목. 표본의 한국 비중이 48%라 과대평가됐을 수 있다
    for (const id of ['old-clothes', 'stairs']) {
      const gyeol = GYEOL_TYPES.find((g) => g.id === id)!
      const hit = catalog!.works.filter(
        (w) => matchGyeol([w], catalog!, [gyeol])[0].score > 0,
      ).length
      expect(hit, id).toBeGreaterThanOrEqual(30)
    }
  })

  it('25개 결이 전부 최소 한 작품에는 걸린다', () => {
    for (const gyeol of GYEOL_TYPES) {
      const hit = catalog!.works.some((w) => matchGyeol([w], catalog!, [gyeol])[0].score > 0)
      expect(hit, gyeol.id).toBe(true)
    }
  })
})
```

- [ ] **Step 3: 색인을 만들고 돌린다**

Run: `npm run build:catalog && npx vitest run lib/gyeol/catalog.test.ts`
Expected: PASS, 7 tests. `한국 특화 결` 테스트가 실패하면 조건 키워드가 실제 카탈로그에서 너무 드문 것이다. 스펙 문서로 돌아가 해당 결의 조건을 넓히고 두 문서를 함께 고친다.

- [ ] **Step 4: 커밋**

```bash
git add lib/gyeol/catalog.test.ts
git commit -m "test: guard the real catalog index against thinning

합성 픽스처로는 실제 색인이 성겨져 결이 뭉개지는 것을 못 잡는다.
스펙이 남긴 한국 작품 편중 미확인 항목도 여기서 닫는다."
```

---

## Task 12: 추천 프리베이크

**Files:**
- Create: `scripts/fetch-recommendations.ts`
- Modify: `package.json`

- [ ] **Step 1: 스크립트를 쓴다**

```ts
// scripts/fetch-recommendations.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import type { Catalog } from '../lib/gyeol/types'

/**
 * 작품별 TMDB 추천을 public/rec/<m>-<id>.json으로 굽는다.
 *
 * 파일을 쪼개는 이유는 클라이언트가 고른 것만 받게 하기 위해서다. 하나로
 * 합치면 수백 KB를 통째로 내려받아야 한다.
 *
 * 추천 대상은 색인 안에 있는 작품으로 제한한다. 색인 밖 작품은 제목도
 * 포스터도 없어 화면에 그릴 수 없다.
 */
const TMDB_API_KEY = process.env.TMDB_API_KEY
if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not set — .env.local을 확인하라')

const CONCURRENCY = 20
const TOP_N = 20

type RecResult = { id: number }

async function recommendationsOf(media: 0 | 1, id: number): Promise<number[]> {
  const path = media === 0 ? 'movie' : 'tv'
  const url = `https://api.themoviedb.org/3/${path}/${id}/recommendations?api_key=${TMDB_API_KEY}&language=ko-KR`
  const response = await fetch(url)
  if (!response.ok) return []
  const data = (await response.json()) as { results?: RecResult[] }
  return (data.results ?? []).slice(0, TOP_N).map((r) => r.id)
}

async function main() {
  const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
  const known = new Set(catalog.works.map((w) => `${w.m}:${w.i}`))
  mkdirSync('public/rec', { recursive: true })

  let written = 0
  let empty = 0
  for (let i = 0; i < catalog.works.length; i += CONCURRENCY) {
    const batch = catalog.works.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((w) => recommendationsOf(w.m, w.i)))
    batch.forEach((work, index) => {
      // 색인에 있는 추천만 남긴다. 없는 것은 화면에 그릴 수 없다.
      const ids = results[index].filter((id) => known.has(`${work.m}:${id}`))
      if (ids.length === 0) empty += 1
      writeFileSync(`public/rec/${work.m}-${work.i}.json`, JSON.stringify(ids))
      written += 1
    })
    process.stderr.write(`\r  ${written}/${catalog.works.length}`)
  }
  process.stderr.write('\n')
  console.log(`추천 ${written}건 (빈 작품 ${empty}건) → public/rec/`)
}

main()
```

- [ ] **Step 2: npm 스크립트를 추가한다**

```json
"fetch:recommendations": "tsx --env-file=.env.local scripts/fetch-recommendations.ts",
"build:data": "npm run fetch:catalog && npm run fetch:keywords && npm run build:catalog && npm run fetch:recommendations",
```

- [ ] **Step 3: 돌려서 확인한다**

Run: `npm run fetch:recommendations`
Expected: `추천 13,xxx건 (빈 작품 x,xxx건)`. 빈 작품이 절반을 넘으면 같은 매체 안에서만 추천이 오는지 확인한다. TMDB 추천은 같은 매체로만 돌아온다.

- [ ] **Step 4: 결과를 눈으로 확인한다**

Run: `cat public/rec/0-496243.json` (기생충)
Expected: 20개 이하의 TMDB id 배열. 빈 배열이면 필터가 과한 것이다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/fetch-recommendations.ts package.json
git commit -m "feat: prebake per-work recommendations as split json"
```

---

## Task 13: 전체 점검

- [ ] **Step 1: 파이프라인을 처음부터 돌린다**

Run: `npm run build:data`
Expected: 네 단계가 순서대로 끝나고 마지막에 `추천 ...건`이 찍힌다

- [ ] **Step 2: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run && npx eslint`
Expected: tsc 에러 0, 모든 테스트 통과, lint 통과

- [ ] **Step 3: 색인 크기를 기록한다**

Run: `npm run build:catalog`
색인 gzip 크기를 PRD 9절의 표와 비교한다. 600KB를 크게 넘으면 계획 2의 2단 로드 설계를 다시 봐야 하므로 그 사실을 PRD에 적는다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "chore: verify the gyeol data pipeline end to end"
```

---

## 이 계획이 끝나면

- `public/catalog.json`과 `public/rec/*.json`이 생성된다
- `matchGyeol()`이 고른 작품들로 25개 결 중 하나를 판정한다
- UI는 아직 없다. 랜딩은 "준비 중입니다"만 보여준다

**다음 계획(앱)에서 다룰 것:** 그리드(적응형 + 로컬 검색), 결과 화면, 추천 표시, 공유 링크 페이로드(TMDB id 직접 인코딩), 레포 이름 변경.
