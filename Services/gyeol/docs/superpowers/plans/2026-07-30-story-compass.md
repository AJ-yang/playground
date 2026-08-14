# Story Compass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영화·드라마 두 편 중 하나를 고르는 일을 12번 반복하면 사용자의 서사 정체성 유형을 네 글자 코드로 판정해 공유 가능한 결과 카드를 보여주는 웹 서비스를 만든다.

**Architecture:** 로직 전부가 세 개의 순수 함수 모듈(`selector`, `scoring`, `payload`)에 들어가고 나머지는 표현 계층이다. 작품 풀은 빌드 시점에 TMDB 수집 + LLM 라벨링으로 만들어 `data/works.json`에 커밋하므로 런타임에는 외부 API 호출이 없다. 데이터베이스가 없고 결과는 URL 페이로드로 재현한다.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4, Tailwind CSS 4, TypeScript 5, Vitest, `@anthropic-ai/sdk`, TMDB API v3, `next/og`.

**Spec:** `docs/superpowers/specs/2026-07-29-story-compass-design.md`

---

## File Structure

로직과 표현을 파일 단위로 분리한다. 아래 세 파일이 서비스의 로직 전부이고 React/Next에 의존하지 않는다.

| File | Responsibility |
|---|---|
| `lib/types.ts` | `Work` / `Choice` / `Axes` 타입, 축 상수, 라운드 수 |
| `lib/rng.ts` | 시드 기반 난수와 셔플 (결정론적 대진의 근거) |
| `lib/scoring.ts` | 선택 기록 → 축 점수 → 4글자 코드, 상극/궁합 코드 |
| `lib/selector.ts` | 적응형 페어 선택 (목표 축 결정 + 축 격리) |
| `lib/payload.ts` | 선택 기록 ↔ URL 문자열 인코딩 |
| `lib/pool-health.ts` | 작품 풀이 축 격리 쌍을 충분히 만들 수 있는지 검증 |
| `lib/__fixtures__/pool.ts` | 테스트용 합성 작품 풀 |
| `data/story-types.ts` | 16유형 이름과 문안 |
| `data/works.json` | 작품 풀 (스크립트 생성, 커밋 대상) |
| `scripts/build-pool.ts` | TMDB 수집 → LLM 라벨링 → `works.json` 생성 및 검증 (수동 실행) |
| `app/page.tsx` | 랜딩 |
| `app/play/page.tsx` | 12라운드 진행 (클라이언트 상태) |
| `app/r/[code]/page.tsx` | 결과 카드 |
| `app/r/[code]/opengraph-image.tsx` | 코드별 OG 이미지 동적 생성 |
| `components/PosterCard.tsx` | 포스터 선택 카드, 이미지 실패 시 제목 텍스트로 폴백 |
| `components/AxisBars.tsx` | 네 축 막대그래프 |
| `components/ShareButton.tsx` | 공유 시트 / 클립보드 복사 |
| `components/Footer.tsx` | TMDB 고지 (모든 페이지 공통) |

---

## Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css` (create-next-app 생성)
- Create: `vitest.config.ts`

- [ ] **Step 1: Next.js 프로젝트를 현재 디렉터리에 스캐폴드**

`docs/`, `.git`, `.gitignore`만 있는 디렉터리이므로 `.`로 생성해도 충돌하지 않는다.

```bash
cd "/Users/xan/Desktop/Claude/Playground/story-compass" && npx --yes create-next-app@16.2.4 . --ts --tailwind --app --eslint --no-src-dir --turbopack --import-alias "@/*" --use-npm
```

- [ ] **Step 2: 스캐폴드 결과 확인**

Run: `ls app package.json tsconfig.json`
Expected: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `package.json`, `tsconfig.json`이 모두 존재

- [ ] **Step 3: 테스트·스크립트 의존성 설치**

```bash
npm install --save-dev vitest tsx && npm install @anthropic-ai/sdk
```

- [ ] **Step 4: Vitest 설정 파일 작성**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'data/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: `package.json`에 test 스크립트 추가**

`scripts` 객체에 다음 두 줄을 추가한다 (기존 `dev`/`build`/`start`/`lint`는 그대로 둔다):

```json
    "test": "vitest run",
    "build:pool": "tsx scripts/build-pool.ts"
```

- [ ] **Step 6: 테스트 러너가 동작하는지 확인**

Run: `npm test`
Expected: `No test files found` 메시지와 함께 종료 (아직 테스트가 없으므로 정상)

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with vitest"
```

---

## Task 2: 타입, 축 상수, 테스트 픽스처

**Files:**
- Create: `lib/types.ts`
- Create: `lib/__fixtures__/pool.ts`

- [ ] **Step 1: 타입과 축 상수 작성**

`lib/types.ts`:

```ts
/** 축 순서: 0=CE(세계), 1=AQ(답), 2=TS(동행), 3=WL(획득). 각 -2..+2 정수. */
export type Axes = [number, number, number, number]

export type Work = {
  id: number
  media: 'movie' | 'tv'
  title: string
  year: number
  poster: string
  axes: Axes
  labeledAt: string
}

export type Choice = { winner: number; loser: number }

export const ROUNDS = 12

/** 음수가 [0], 양수가 [1] 방향. */
export const AXIS_LETTERS: readonly (readonly [string, string])[] = [
  ['C', 'E'],
  ['A', 'Q'],
  ['T', 'S'],
  ['W', 'L'],
] as const

export const AXIS_LABELS = [
  { neg: '세계를 바꾼다', pos: '세계를 견딘다' },
  { neg: '답을 찾는다', pos: '질문 속에 산다' },
  { neg: '함께 간다', pos: '혼자 간다' },
  { neg: '이겨서 얻는다', pos: '잃으며 깨닫는다' },
] as const

/** 페이로드가 작품 인덱스를 1바이트로 담으므로 풀 크기 상한. */
export const MAX_POOL_SIZE = 256
```

- [ ] **Step 2: 합성 테스트 풀 작성**

축 조합을 고르게 덮는 225개 작품을 생성한다. 축 격리 쌍이 반드시 존재하므로 selector 테스트가 실제 풀 없이 돌아간다.

`lib/__fixtures__/pool.ts`:

```ts
import type { Axes, Work } from '../types'

export function makeTestPool(): Work[] {
  const works: Work[] = []
  let id = 1
  for (const c of [-2, -1, 0, 1, 2]) {
    for (const a of [-2, -1, 0, 1, 2]) {
      for (const t of [-2, 0, 2]) {
        for (const w of [-2, 0, 2]) {
          works.push({
            id: id++,
            media: 'movie',
            title: `T${c}${a}${t}${w}`,
            year: 2000,
            poster: '/p.jpg',
            axes: [c, a, t, w] as Axes,
            labeledAt: '2026-07-30',
          })
        }
      }
    }
  }
  return works
}
```

- [ ] **Step 3: 픽스처 크기를 확인하는 임시 검증**

Run: `npx tsx -e "import('./lib/__fixtures__/pool.ts').then(m => console.log(m.makeTestPool().length))"`
Expected: `225`

- [ ] **Step 4: 커밋**

```bash
git add lib && git commit -m "feat: add core types and synthetic test pool"
```

---

## Task 3: 점수 계산 (scoring.ts)

**Files:**
- Create: `lib/scoring.ts`
- Test: `lib/scoring.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compatibleCode, oppositeCode, score } from './scoring'
import type { Axes, Work } from './types'

function work(id: number, axes: Axes): Work {
  return { id, media: 'movie', title: `W${id}`, year: 2000, poster: '/p.jpg', axes, labeledAt: '2026-07-30' }
}

describe('score', () => {
  it('음수 방향으로 몰린 선택은 첫 글자 코드를 낸다', () => {
    const pool = [work(1, [-2, -2, -2, -2]), work(2, [2, 2, 2, 2])]
    const result = score(pool, [{ winner: 0, loser: 1 }])
    expect(result.code).toBe('CATW')
    expect(result.norm).toEqual([-1, -1, -1, -1])
  })

  it('양수 방향으로 몰린 선택은 두 번째 글자 코드를 낸다', () => {
    const pool = [work(1, [-2, -2, -2, -2]), work(2, [2, 2, 2, 2])]
    const result = score(pool, [{ winner: 1, loser: 0 }])
    expect(result.code).toBe('EQSL')
    expect(result.norm).toEqual([1, 1, 1, 1])
  })

  it('선택이 없으면 모든 축이 0이고 두 번째 글자로 결정된다', () => {
    const pool = [work(1, [0, 0, 0, 0])]
    const result = score(pool, [])
    expect(result.norm).toEqual([0, 0, 0, 0])
    expect(result.code).toBe('EQSL')
  })

  it('상반된 두 선택은 서로를 상쇄해 0에 수렴한다', () => {
    const pool = [work(1, [-2, 0, 0, 0]), work(2, [2, 0, 0, 0])]
    const result = score(pool, [
      { winner: 0, loser: 1 },
      { winner: 1, loser: 0 },
    ])
    expect(result.norm[0]).toBe(0)
  })

  it('축 점수 차가 큰 선택일수록 강한 신호로 잡힌다', () => {
    const pool = [work(1, [-2, 0, 0, 0]), work(2, [2, 0, 0, 0]), work(3, [-1, 0, 0, 0]), work(4, [1, 0, 0, 0])]
    const strong = score(pool, [{ winner: 0, loser: 1 }])
    const weak = score(pool, [
      { winner: 2, loser: 3 },
      { winner: 3, loser: 2 },
      { winner: 2, loser: 3 },
    ])
    expect(Math.abs(strong.norm[0])).toBeGreaterThan(Math.abs(weak.norm[0]))
  })
})

describe('oppositeCode / compatibleCode', () => {
  it('상극 유형은 네 글자가 모두 뒤집힌다', () => {
    expect(oppositeCode('CATW')).toBe('EQSL')
    expect(oppositeCode('EQSL')).toBe('CATW')
  })

  it('궁합 유형은 세 번째 글자만 유지된다', () => {
    expect(compatibleCode('CATW')).toBe('EQTL')
    expect(compatibleCode('EQSL')).toBe('CASW')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/scoring.test.ts`
Expected: FAIL — `Failed to resolve import "./scoring"`

- [ ] **Step 3: 구현 작성**

`lib/scoring.ts`:

```ts
import { AXIS_LETTERS, type Axes, type Choice, type Work } from './types'

export type Scores = {
  /** 축별 -1..+1 정규화 점수. 부호가 글자를, 절댓값이 막대 길이를 정한다. */
  norm: Axes
  code: string
}

export function score(pool: Work[], choices: Choice[]): Scores {
  const theta = [0, 0, 0, 0]
  const denom = [0, 0, 0, 0]

  for (const choice of choices) {
    const winner = pool[choice.winner].axes
    const loser = pool[choice.loser].axes
    for (let a = 0; a < 4; a++) {
      theta[a] += winner[a] - loser[a]
      denom[a] += Math.abs(winner[a] - loser[a])
    }
  }

  const norm = theta.map((t, a) => t / Math.max(denom[a], 1)) as Axes
  const code = norm.map((n, a) => AXIS_LETTERS[a][n < 0 ? 0 : 1]).join('')
  return { norm, code }
}

export function oppositeCode(code: string): string {
  return flip(code, [0, 1, 2, 3])
}

export function compatibleCode(code: string): string {
  return flip(code, [0, 1, 3])
}

function flip(code: string, axes: readonly number[]): string {
  return code
    .split('')
    .map((ch, a) => {
      if (!axes.includes(a)) return ch
      const [neg, pos] = AXIS_LETTERS[a]
      return ch === neg ? pos : neg
    })
    .join('')
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/scoring.test.ts`
Expected: PASS — 7 tests passed

- [ ] **Step 5: 커밋**

```bash
git add lib/scoring.ts lib/scoring.test.ts && git commit -m "feat: add axis scoring and type code derivation"
```

---

## Task 4: 시드 난수 (rng.ts)

**Files:**
- Create: `lib/rng.ts`
- Test: `lib/rng.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeRng, seededShuffle } from './rng'

describe('makeRng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('0 이상 1 미만을 낸다', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('seededShuffle', () => {
  it('원본을 변형하지 않는다', () => {
    const input = [1, 2, 3, 4, 5]
    seededShuffle(input, makeRng(3))
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('같은 원소를 모두 보존한다', () => {
    const out = seededShuffle([1, 2, 3, 4, 5], makeRng(3))
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5])
  })

  it('같은 시드는 같은 순서를 낸다', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], makeRng(9))).toEqual(seededShuffle([1, 2, 3, 4, 5], makeRng(9)))
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/rng.test.ts`
Expected: FAIL — `Failed to resolve import "./rng"`

- [ ] **Step 3: 구현 작성**

`lib/rng.ts`:

```ts
/** mulberry32. 32비트 시드로 결정론적 [0,1) 수열을 낸다. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/rng.test.ts`
Expected: PASS — 6 tests passed

- [ ] **Step 5: 커밋**

```bash
git add lib/rng.ts lib/rng.test.ts && git commit -m "feat: add seeded rng and shuffle"
```

---

## Task 5: 적응형 페어 선택 (selector.ts)

**Files:**
- Create: `lib/selector.ts`
- Test: `lib/selector.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/selector.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeTestPool } from './__fixtures__/pool'
import { nextPair } from './selector'
import { ROUNDS, type Choice } from './types'

const pool = makeTestPool()

/** 시드를 주고 12라운드를 끝까지 돌린다. 매 라운드 왼쪽을 고른다. */
function playThrough(seed: number) {
  const choices: Choice[] = []
  const pairs = []
  for (let i = 0; i < ROUNDS; i++) {
    const pair = nextPair(pool, choices, seed)
    pairs.push(pair)
    choices.push({ winner: pair.left, loser: pair.right })
  }
  return { choices, pairs }
}

describe('nextPair', () => {
  it('같은 작품을 두 번 내보내지 않는다', () => {
    const { pairs } = playThrough(11)
    const seen = pairs.flatMap((p) => [p.left, p.right])
    expect(new Set(seen).size).toBe(ROUNDS * 2)
  })

  it('반환하는 모든 쌍이 목표 축에서 3 이상 벌어진다', () => {
    const { pairs } = playThrough(11)
    for (const pair of pairs) {
      const gap = Math.abs(pool[pair.left].axes[pair.axis] - pool[pair.right].axes[pair.axis])
      expect(gap).toBeGreaterThanOrEqual(3)
    }
  })

  it('목표 축을 제외한 나머지 축의 차이 합이 2 이하다', () => {
    const { pairs } = playThrough(11)
    for (const pair of pairs) {
      let confound = 0
      for (let a = 0; a < 4; a++) {
        if (a === pair.axis) continue
        confound += Math.abs(pool[pair.left].axes[a] - pool[pair.right].axes[a])
      }
      expect(confound).toBeLessThanOrEqual(2)
    }
  })

  it('12라운드 후 네 축 모두 정보가 쌓인다', () => {
    const { choices } = playThrough(11)
    const info = [0, 0, 0, 0]
    for (const c of choices) {
      for (let a = 0; a < 4; a++) {
        info[a] += Math.abs(pool[c.winner].axes[a] - pool[c.loser].axes[a])
      }
    }
    for (const value of info) expect(value).toBeGreaterThan(0)
  })

  it('같은 시드는 같은 대진을 낸다', () => {
    expect(playThrough(5).pairs).toEqual(playThrough(5).pairs)
  })

  it('다른 시드는 다른 첫 문항을 낸다', () => {
    const first = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(nextPair(pool, [], s))))
    expect(first.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/selector.test.ts`
Expected: FAIL — `Failed to resolve import "./selector"`

- [ ] **Step 3: 구현 작성**

`lib/selector.ts`:

```ts
import { makeRng, seededShuffle } from './rng'
import type { Choice, Work } from './types'

export type Pair = {
  left: number
  right: number
  /** 이 쌍이 겨냥하는 축. 채점에는 쓰이지 않고 테스트와 디버깅용이다. */
  axis: number
}

const MIN_GAPS = [3, 2, 0] as const

export function nextPair(pool: Work[], choices: Choice[], seed: number): Pair {
  const used = new Set<number>()
  const info = [0, 0, 0, 0]
  for (const choice of choices) {
    used.add(choice.winner)
    used.add(choice.loser)
    for (let a = 0; a < 4; a++) {
      info[a] += Math.abs(pool[choice.winner].axes[a] - pool[choice.loser].axes[a])
    }
  }

  // 동점일 때의 축 우선순위는 세션 시드로 정한다. 첫 라운드는 네 축이 모두 0이라
  // 항상 이 규칙을 타므로 세션마다 다른 축에서 시작한다. Array.sort는 안정 정렬이다.
  const axisOrder = seededShuffle([0, 1, 2, 3], makeRng(seed))
  const axesByPriority = [...axisOrder].sort((x, y) => info[x] - info[y])

  const rng = makeRng(seed + choices.length * 7919)
  const available = seededShuffle(
    pool.map((_, i) => i).filter((i) => !used.has(i)),
    rng,
  )

  for (const minGap of MIN_GAPS) {
    for (const axis of axesByPriority) {
      const best = bestPair(pool, available, axis, minGap)
      if (best) {
        const [x, y] = best
        // 좌우 배치를 무작위로 섞어 위치 편향을 없앤다.
        return rng() < 0.5 ? { left: x, right: y, axis } : { left: y, right: x, axis }
      }
    }
  }

  throw new Error('no available pair')
}

function bestPair(pool: Work[], available: number[], axis: number, minGap: number): [number, number] | null {
  let best: [number, number] | null = null
  let bestScore = -Infinity

  for (let i = 0; i < available.length; i++) {
    const x = pool[available[i]].axes
    for (let j = i + 1; j < available.length; j++) {
      const y = pool[available[j]].axes
      const gap = Math.abs(x[axis] - y[axis])
      if (gap < minGap) continue

      let confound = 0
      for (let a = 0; a < 4; a++) {
        if (a !== axis) confound += Math.abs(x[a] - y[a])
      }

      const value = 2 * gap - confound
      if (value > bestScore) {
        bestScore = value
        best = [available[i], available[j]]
      }
    }
  }

  return best
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/selector.test.ts`
Expected: PASS — 6 tests passed

- [ ] **Step 5: 커밋**

```bash
git add lib/selector.ts lib/selector.test.ts && git commit -m "feat: add adaptive pair selector with axis isolation"
```

---

## Task 6: URL 페이로드 (payload.ts)

**Files:**
- Create: `lib/payload.ts`
- Test: `lib/payload.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/payload.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeChoices, encodeChoices } from './payload'
import { ROUNDS, type Choice } from './types'

const choices: Choice[] = Array.from({ length: ROUNDS }, (_, i) => ({
  winner: i * 2,
  loser: i * 2 + 1,
}))

describe('encodeChoices / decodeChoices', () => {
  it('인코딩 후 디코딩하면 원본과 같다', () => {
    expect(decodeChoices(encodeChoices(choices), 240)).toEqual(choices)
  })

  it('URL에 안전한 문자만 쓴다', () => {
    expect(encodeChoices(choices)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('길이가 12라운드에 맞지 않으면 null을 낸다', () => {
    expect(decodeChoices(encodeChoices(choices.slice(0, 5)), 240)).toBeNull()
  })

  it('손상된 입력에 예외를 던지지 않고 null을 낸다', () => {
    expect(decodeChoices('!!!not-base64!!!', 240)).toBeNull()
    expect(decodeChoices('', 240)).toBeNull()
  })

  it('풀 크기를 넘는 인덱스는 null을 낸다', () => {
    expect(decodeChoices(encodeChoices(choices), 10)).toBeNull()
  })

  it('승자와 패자가 같으면 null을 낸다', () => {
    const broken = choices.map((c, i) => (i === 3 ? { winner: 7, loser: 7 } : c))
    expect(decodeChoices(encodeChoices(broken), 240)).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/payload.test.ts`
Expected: FAIL — `Failed to resolve import "./payload"`

- [ ] **Step 3: 구현 작성**

`lib/payload.ts`:

```ts
import { ROUNDS, type Choice } from './types'

/** 12쌍의 인덱스를 24바이트로 담아 base64url 32자로 만든다. 풀 크기가 256 미만이라 1바이트면 충분하다. */
export function encodeChoices(choices: Choice[]): string {
  let binary = ''
  for (const choice of choices) {
    binary += String.fromCharCode(choice.winner & 0xff, choice.loser & 0xff)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeChoices(payload: string, poolSize: number): Choice[] | null {
  let binary: string
  try {
    binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return null
  }

  if (binary.length !== ROUNDS * 2) return null

  const choices: Choice[] = []
  for (let i = 0; i < binary.length; i += 2) {
    const winner = binary.charCodeAt(i)
    const loser = binary.charCodeAt(i + 1)
    if (winner >= poolSize || loser >= poolSize || winner === loser) return null
    choices.push({ winner, loser })
  }
  return choices
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/payload.test.ts`
Expected: PASS — 6 tests passed

- [ ] **Step 5: 커밋**

```bash
git add lib/payload.ts lib/payload.test.ts && git commit -m "feat: add url payload encoding for choice history"
```

---

## Task 7: 16유형 문안

**Files:**
- Create: `data/story-types.ts`
- Test: `data/story-types.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`data/story-types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STORY_TYPES } from './story-types'
import { AXIS_LETTERS } from '../lib/types'

function allCodes(): string[] {
  let codes = ['']
  for (const [neg, pos] of AXIS_LETTERS) {
    codes = codes.flatMap((prefix) => [prefix + neg, prefix + pos])
  }
  return codes
}

describe('STORY_TYPES', () => {
  it('16개 코드를 모두 덮는다', () => {
    const codes = allCodes()
    expect(codes).toHaveLength(16)
    for (const code of codes) {
      expect(STORY_TYPES[code], `missing ${code}`).toBeDefined()
    }
  })

  it('정의된 코드가 16개를 넘지 않는다', () => {
    expect(Object.keys(STORY_TYPES)).toHaveLength(16)
  })

  it('모든 유형에 이름과 설명이 채워져 있다', () => {
    for (const [code, type] of Object.entries(STORY_TYPES)) {
      expect(type.name.length, code).toBeGreaterThan(0)
      expect(type.description.length, code).toBeGreaterThan(20)
    }
  })

  it('유형 이름이 서로 겹치지 않는다', () => {
    const names = Object.values(STORY_TYPES).map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run data/story-types.test.ts`
Expected: FAIL — `Failed to resolve import "./story-types"`

- [ ] **Step 3: 구현 작성**

`data/story-types.ts`:

```ts
export type StoryType = { name: string; description: string }

export const STORY_TYPES: Record<string, StoryType> = {
  CATW: {
    name: '판을 뒤집는 사람',
    description:
      '세상은 고칠 수 있는 것이고, 고치는 방법은 이미 알고 있다고 믿습니다. 혼자 옳은 것보다 같이 이기는 쪽을 택하고, 그래서 사람을 모읍니다.',
  },
  CATL: {
    name: '불을 옮기는 사람',
    description:
      '바꾸려고 나서지만 승리보다 남기는 것을 봅니다. 함께 가는 길에서 잃은 것들이 오히려 당신을 설득해왔습니다.',
  },
  CASW: {
    name: '혼자 문을 여는 사람',
    description:
      '답을 알고 있고, 설득을 기다리지 않습니다. 먼저 가서 문을 열어두면 나머지는 따라온다고 믿습니다.',
  },
  CASL: {
    name: '끝까지 가보는 사람',
    description:
      '바꾸겠다고 혼자 걸어 들어가 결국 무언가를 잃고 돌아옵니다. 그 대가가 당신이 아는 것의 대부분입니다.',
  },
  CQTW: {
    name: '같이 헤매는 사람',
    description:
      '정답은 없다고 생각하면서도 세상을 바꾸려 합니다. 답 대신 좋은 질문을 들고 사람들 사이에 섭니다.',
  },
  CQTL: {
    name: '곁에 남는 사람',
    description:
      '무엇이 옳은지는 확신하지 않지만 곁에 있는 것만은 확신합니다. 당신이 세상을 바꾸는 방식은 이기는 게 아니라 남는 것입니다.',
  },
  CQSW: {
    name: '규칙을 의심하는 사람',
    description:
      '주어진 답을 믿지 않고 혼자 검증합니다. 그러다 결국 판을 자기 방식으로 다시 짭니다.',
  },
  CQSL: {
    name: '길을 내는 사람',
    description:
      '아무도 안 간 쪽으로 혼자 갑니다. 그 길에서 얻는 것보다 버리는 게 많지만, 그래도 다음 사람이 그 길을 걷습니다.',
  },
  EATW: {
    name: '지켜내는 사람',
    description:
      '세상을 바꾸려 하지 않습니다. 지킬 것을 정하고, 사람들과 함께, 끝내 지켜냅니다.',
  },
  EATL: {
    name: '자리를 지키는 사람',
    description:
      '무너지는 것들 사이에서 자기 자리에 남습니다. 이기지 못해도 있어야 할 곳에 있었다는 게 당신의 답입니다.',
  },
  EASW: {
    name: '버티는 사람',
    description:
      '무엇이 옳은지 알고 혼자 버팁니다. 요란하지 않지만 결국 남아 있는 쪽이 당신입니다.',
  },
  EASL: {
    name: '조용히 감당하는 사람',
    description:
      '설명하지 않고 감당합니다. 잃은 것을 세지 않고, 세지 않기 때문에 계속할 수 있습니다.',
  },
  EQTW: {
    name: '함께 견디는 사람',
    description:
      '답은 모르겠지만 같이 있으면 지나간다고 믿습니다. 견디는 것 자체를 하나의 승리로 셉니다.',
  },
  EQTL: {
    name: '곁을 지키는 사람',
    description:
      '해결하려 들지 않고 옆에 앉습니다. 무엇도 나아지지 않아도 그 시간만은 남습니다.',
  },
  EQSW: {
    name: '관찰하는 사람',
    description:
      '끼어들지 않고 봅니다. 세상을 바꾸지도 답을 정하지도 않지만, 결국 가장 정확하게 아는 사람이 됩니다.',
  },
  EQSL: {
    name: '질문을 껴안는 사람',
    description:
      '답을 찾지 않고 질문 속에 삽니다. 혼자서, 잃어가면서, 그게 사는 방식이라는 걸 압니다.',
  },
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run data/story-types.test.ts`
Expected: PASS — 4 tests passed

- [ ] **Step 5: 커밋**

```bash
git add data/story-types.ts data/story-types.test.ts && git commit -m "feat: add 16 narrative identity type copy"
```

---

## Task 8: 작품 풀 검증기 (pool-health.ts)

**Files:**
- Create: `lib/pool-health.ts`
- Test: `lib/pool-health.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/pool-health.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeTestPool } from './__fixtures__/pool'
import { checkPool } from './pool-health'
import type { Work } from './types'

describe('checkPool', () => {
  it('합성 픽스처는 크기 문제만 걸린다', () => {
    // 픽스처는 225개라 크기 상한(256)은 통과하고 축 커버리지도 충분하다.
    expect(checkPool(makeTestPool())).toEqual([])
  })

  it('풀이 256개를 넘으면 걸러낸다', () => {
    const big = [...makeTestPool()]
    while (big.length <= 256) big.push({ ...big[0], id: big.length + 1000 })
    expect(checkPool(big).some((i) => i.kind === 'pool-too-large')).toBe(true)
  })

  it('중복 작품을 걸러낸다', () => {
    const pool = makeTestPool()
    pool[5] = { ...pool[5], id: pool[0].id, media: pool[0].media }
    expect(checkPool(pool).some((i) => i.kind === 'duplicate')).toBe(true)
  })

  it('포스터가 비면 걸러낸다', () => {
    const pool = makeTestPool()
    pool[3] = { ...pool[3], poster: '' }
    expect(checkPool(pool).some((i) => i.kind === 'missing-poster')).toBe(true)
  })

  it('한쪽 극단이 비면 걸러낸다', () => {
    const pool: Work[] = makeTestPool().filter((w) => w.axes[0] < 1)
    expect(checkPool(pool).some((i) => i.kind === 'thin-extreme')).toBe(true)
  })

  it('축 격리 쌍이 부족하면 걸러낸다', () => {
    // 모든 작품이 네 축에서 동시에 갈리도록 만들면 confound가 커져 격리 쌍이 사라진다.
    const pool: Work[] = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      media: 'movie' as const,
      title: `W${i}`,
      year: 2000,
      poster: '/p.jpg',
      axes: (i % 2 === 0 ? [-2, -2, -2, -2] : [2, 2, 2, 2]) as Work['axes'],
      labeledAt: '2026-07-30',
    }))
    expect(checkPool(pool).some((i) => i.kind === 'few-isolated-pairs')).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/pool-health.test.ts`
Expected: FAIL — `Failed to resolve import "./pool-health"`

- [ ] **Step 3: 구현 작성**

`lib/pool-health.ts`:

```ts
import { MAX_POOL_SIZE, type Work } from './types'

export type PoolIssue = { kind: string; detail: string }

const MIN_PER_EXTREME = 40
const MIN_ISOLATED_PAIRS = 200
const ISOLATION_MIN_GAP = 3
const ISOLATION_MAX_CONFOUND = 2

export function checkPool(pool: Work[]): PoolIssue[] {
  const issues: PoolIssue[] = []

  if (pool.length > MAX_POOL_SIZE) {
    issues.push({
      kind: 'pool-too-large',
      detail: `풀이 ${pool.length}개다. 페이로드가 인덱스를 1바이트로 담으므로 ${MAX_POOL_SIZE}개 미만이어야 한다.`,
    })
  }

  const seen = new Set<string>()
  for (const work of pool) {
    const key = `${work.media}:${work.id}`
    if (seen.has(key)) issues.push({ kind: 'duplicate', detail: `중복 작품 ${key}` })
    seen.add(key)
    if (!work.poster) issues.push({ kind: 'missing-poster', detail: `포스터 없음 ${key} (${work.title})` })
  }

  for (let axis = 0; axis < 4; axis++) {
    const negative = pool.filter((w) => w.axes[axis] <= -1).length
    const positive = pool.filter((w) => w.axes[axis] >= 1).length
    if (negative < MIN_PER_EXTREME) {
      issues.push({ kind: 'thin-extreme', detail: `축 ${axis} 음수 방향 ${negative}개 (최소 ${MIN_PER_EXTREME})` })
    }
    if (positive < MIN_PER_EXTREME) {
      issues.push({ kind: 'thin-extreme', detail: `축 ${axis} 양수 방향 ${positive}개 (최소 ${MIN_PER_EXTREME})` })
    }

    const isolated = countIsolatedPairs(pool, axis)
    if (isolated < MIN_ISOLATED_PAIRS) {
      issues.push({
        kind: 'few-isolated-pairs',
        detail: `축 ${axis} 격리 쌍 ${isolated}개 (최소 ${MIN_ISOLATED_PAIRS}). 선택기가 confound 높은 쌍을 내보내기 시작한다.`,
      })
    }
  }

  return issues
}

function countIsolatedPairs(pool: Work[], axis: number): number {
  let count = 0
  for (let i = 0; i < pool.length; i++) {
    const x = pool[i].axes
    for (let j = i + 1; j < pool.length; j++) {
      const y = pool[j].axes
      if (Math.abs(x[axis] - y[axis]) < ISOLATION_MIN_GAP) continue
      let confound = 0
      for (let a = 0; a < 4; a++) {
        if (a !== axis) confound += Math.abs(x[a] - y[a])
      }
      if (confound <= ISOLATION_MAX_CONFOUND) count++
    }
  }
  return count
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/pool-health.test.ts`
Expected: PASS — 6 tests passed

- [ ] **Step 5: 커밋**

```bash
git add lib/pool-health.ts lib/pool-health.test.ts && git commit -m "feat: add pool health validation for axis isolation"
```

---

> **실행 중 변경 (2026-07-30).** Task 9와 10은 아래 문서와 다르게 구현했다. LLM 라벨링을
> 스크립트에서 떼어내 `scripts/fetch-candidates.ts`(TMDB 수집 → `data/candidates.json`)와
> `scripts/build-pool.ts`(`candidates.json` + 손으로 쓴 `data/labels.json` → `works.json`)로
> 나눴다. 라벨링은 세션 안에서 직접 하므로 **Anthropic API 키가 필요 없다.** 6개월 갱신이
> 제목·포스터만 제자리에서 덮어쓰고 축 점수는 유지하므로 라벨링은 애초에 일회성 작업이다.
> TMDB 키는 여전히 필요하다.

## Task 9: 작품 풀 생성 스크립트

**Files:**
- Create: `scripts/build-pool.ts`
- Create: `.env.local.example`
- Modify: `.gitignore` (`.env*.local`은 이미 무시 대상 — 확인만)

- [ ] **Step 1: 환경변수 예시 파일 작성**

`.env.local.example`:

```
TMDB_API_KEY=
ANTHROPIC_API_KEY=
```

- [ ] **Step 2: 수집·라벨링·검증 스크립트 작성**

LLM에는 제목·연도·매체만 전달한다. TMDB의 줄거리와 장르는 넣지 않는다 (약관의 AI 학습 금지 조항을 건드리지 않고, 축이 주제적 입장에 관한 것이라 모델의 기존 작품 지식이 더 정확하다).

`scripts/build-pool.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'node:fs'
import { checkPool } from '../lib/pool-health'
import type { Axes, Work } from '../lib/types'

const TMDB_API_KEY = process.env.TMDB_API_KEY
const TARGET_SIZE = 240
const BATCH_SIZE = 20
/** 한국 사용자가 제목을 보고 아는 작품이어야 선택이 성립하므로 한국 작품 하한을 둔다. */
const MIN_KOREAN_RATIO = 0.3

type Candidate = Pick<Work, 'id' | 'media' | 'title' | 'year' | 'poster'> & { korean: boolean }

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          world: { type: 'integer', enum: [-2, -1, 0, 1, 2] },
          answer: { type: 'integer', enum: [-2, -1, 0, 1, 2] },
          company: { type: 'integer', enum: [-2, -1, 0, 1, 2] },
          gain: { type: 'integer', enum: [-2, -1, 0, 1, 2] },
        },
        required: ['id', 'world', 'answer', 'company', 'gain'],
        additionalProperties: false,
      },
    },
  },
  required: ['labels'],
  additionalProperties: false,
} as const

const LABEL_INSTRUCTIONS = `각 작품을 네 개의 서사 축에 대해 -2에서 +2 사이의 정수로 평가한다.
작품이 실제로 취하는 주제적 입장을 기준으로 하고, 확신이 없으면 0을 준다.

world:   -2 세계를 바꾸는 이야기 ... +2 세계를 견디는 이야기
answer:  -2 답을 찾아내는 이야기 ... +2 질문 속에 사는 이야기
company: -2 함께 가는 이야기 ... +2 혼자 가는 이야기
gain:    -2 이겨서 얻는 이야기 ... +2 잃으며 깨닫는 이야기

모르는 작품이면 네 축 모두 0을 준다. 입력에 있는 모든 작품에 대해 하나씩 반환한다.`

async function tmdb(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  url.searchParams.set('api_key', TMDB_API_KEY!)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`TMDB ${path} ${response.status}: ${await response.text()}`)
  return response.json()
}

async function discover(
  media: 'movie' | 'tv',
  extra: Record<string, string>,
  pages: number,
  korean: boolean,
): Promise<Candidate[]> {
  const out: Candidate[] = []
  for (let page = 1; page <= pages; page++) {
    const data = await tmdb(`/discover/${media}`, {
      language: 'ko-KR',
      sort_by: 'popularity.desc',
      'vote_count.gte': korean ? '200' : '1000',
      page: String(page),
      ...extra,
    })
    for (const item of data.results ?? []) {
      const title = media === 'movie' ? item.title : item.name
      const date = media === 'movie' ? item.release_date : item.first_air_date
      if (!title || !item.poster_path || !date) continue
      out.push({ id: item.id, media, title, year: Number(date.slice(0, 4)), poster: item.poster_path, korean })
    }
  }
  return out
}

async function collectCandidates(): Promise<Candidate[]> {
  const groups = await Promise.all([
    discover('movie', {}, 7, false),
    discover('tv', {}, 5, false),
    discover('movie', { with_original_language: 'ko' }, 5, true),
    discover('tv', { with_original_language: 'ko' }, 4, true),
  ])

  // 한국 작품 그룹을 먼저 넣어, 양쪽에 걸리는 작품이 korean으로 표시되게 한다.
  const byKey = new Map<string, Candidate>()
  for (const group of [groups[2], groups[3], groups[0], groups[1]]) {
    for (const item of group) {
      if (!byKey.has(`${item.media}:${item.id}`)) byKey.set(`${item.media}:${item.id}`, item)
    }
  }
  return [...byKey.values()]
}

/**
 * 축 극단에 있는 작품을 우선 남기되, 한국 작품 비중이 하한 아래로 떨어지지 않게 층화 추출한다.
 * 극단성만으로 자르면 한국 작품이 통째로 밀려날 수 있다.
 */
function selectPool(works: Work[], korean: Set<string>): Work[] {
  const byExtremity = (a: Work, b: Work) => extremity(b) - extremity(a)
  const key = (w: Work) => `${w.media}:${w.id}`

  const koreanWorks = works.filter((w) => korean.has(key(w))).sort(byExtremity)
  const restWorks = works.filter((w) => !korean.has(key(w))).sort(byExtremity)

  const koreanQuota = Math.min(koreanWorks.length, Math.ceil(TARGET_SIZE * MIN_KOREAN_RATIO))
  const picked = [...koreanWorks.slice(0, koreanQuota)]
  const remaining = [...koreanWorks.slice(koreanQuota), ...restWorks].sort(byExtremity)
  picked.push(...remaining.slice(0, TARGET_SIZE - picked.length))

  return picked.sort(byExtremity)
}

async function label(client: Anthropic, batch: Candidate[]): Promise<Map<number, Axes>> {
  const listing = batch.map((c) => `${c.id}\t${c.title} (${c.year}, ${c.media})`).join('\n')

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: LABEL_INSTRUCTIONS,
    output_config: { format: { type: 'json_schema', schema: LABEL_SCHEMA } },
    messages: [{ role: 'user', content: listing }],
  })

  if (response.stop_reason === 'refusal') throw new Error('labeling refused')

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('no text block in labeling response')

  const parsed = JSON.parse(text.text) as { labels: { id: number; world: number; answer: number; company: number; gain: number }[] }
  const map = new Map<number, Axes>()
  for (const row of parsed.labels) {
    map.set(row.id, [row.world, row.answer, row.company, row.gain])
  }
  return map
}

async function main() {
  if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not set')

  const candidates = await collectCandidates()
  console.log(`후보 ${candidates.length}개 수집`)

  const client = new Anthropic()
  const labeledAt = new Date().toISOString().slice(0, 10)
  const works: Work[] = []
  const korean = new Set<string>()

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    const labels = await label(client, batch)
    for (const candidate of batch) {
      const axes = labels.get(candidate.id)
      if (!axes) continue
      // 네 축이 모두 0이면 모델이 모르는 작품이다. 선택기에 쓸모가 없으니 버린다.
      if (axes.every((v) => v === 0)) continue
      const { korean: isKorean, ...fields } = candidate
      if (isKorean) korean.add(`${candidate.media}:${candidate.id}`)
      works.push({ ...fields, axes, labeledAt })
    }
    console.log(`라벨링 ${Math.min(i + BATCH_SIZE, candidates.length)}/${candidates.length} → 누적 ${works.length}개`)
  }

  const pool = selectPool(works, korean)
  const koreanCount = pool.filter((w) => korean.has(`${w.media}:${w.id}`)).length

  const issues = checkPool(pool)
  if (koreanCount / pool.length < MIN_KOREAN_RATIO) {
    issues.push({
      kind: 'thin-korean',
      detail: `한국 작품 ${koreanCount}/${pool.length}. 최소 ${Math.round(MIN_KOREAN_RATIO * 100)}%가 필요하다. collectCandidates의 한국 작품 페이지 수를 늘려라.`,
    })
  }

  if (issues.length > 0) {
    console.error('\n풀 검증 실패:')
    for (const issue of issues) console.error(`  [${issue.kind}] ${issue.detail}`)
    process.exit(1)
  }

  writeFileSync('data/works.json', JSON.stringify(pool, null, 2) + '\n')
  console.log(`\ndata/works.json 작성 완료 — ${pool.length}개 (한국 작품 ${koreanCount}개)`)
}

function extremity(work: Work): number {
  return work.axes.reduce((sum, v) => sum + Math.abs(v), 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 3: 스크립트가 타입 검사를 통과하는지 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음 (종료 코드 0)

- [ ] **Step 4: 커밋**

```bash
git add scripts .env.local.example && git commit -m "feat: add TMDB collection and LLM labeling script"
```

---

## Task 10: 실제 작품 풀 생성

**Files:**
- Create: `data/works.json`

- [ ] **Step 1: API 키를 `.env.local`에 넣도록 사용자에게 요청**

사용자에게 다음을 요청한다. 키는 절대 대신 발급하거나 커밋하지 않는다.

> `.env.local.example`을 `.env.local`로 복사한 뒤 TMDB API 키(themoviedb.org 계정 설정 → API)와 Anthropic API 키를 채워주세요. 두 값 모두 채워지면 풀 생성을 돌리겠습니다.

- [ ] **Step 2: 풀 생성 실행**

```bash
npm run build:pool
```

Expected: `data/works.json 작성 완료 — 240개 (한국 작품 72개)` 형태의 출력. 한국 작품 수는 72개 이상이면 된다.

검증에 실패하면 종료 코드가 0이 아니고 `[thin-extreme]`, `[few-isolated-pairs]`, `[thin-korean]` 중 하나가 리포트된다. 그 경우 `collectCandidates`의 해당 그룹 페이지 수를 늘려 후보를 더 모은 뒤 다시 실행한다.

- [ ] **Step 3: 생성된 풀을 눈으로 확인**

Run: `node -e "const w=require('./data/works.json'); console.log(w.length); console.log(w.slice(0,5).map(x=>x.title+' '+JSON.stringify(x.axes)).join('\n'))"`
Expected: 240과 함께 상위 5개 작품의 제목·축 점수 출력. 각 축 극단(-2/+2)에 배치된 작품의 라벨이 납득 가능한지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add data/works.json && git commit -m "data: generate initial works pool"
```

---

## Task 11: 진행 화면 (play)

**Files:**
- Create: `app/play/page.tsx`
- Create: `components/PosterCard.tsx`

- [ ] **Step 1: 포스터 카드 컴포넌트 작성**

이미지 로드에 실패하면 제목 텍스트 카드로 폴백해 진행이 멈추지 않게 한다.

`components/PosterCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Work } from '@/lib/types'

export function PosterCard({ work, onPick }: { work: Work; onPick: () => void }) {
  const [failed, setFailed] = useState(false)

  return (
    <button
      onClick={onPick}
      className="group relative flex aspect-[2/3] w-full items-end overflow-hidden rounded-2xl bg-neutral-800 text-left transition hover:ring-4 hover:ring-white/60 focus:outline-none focus:ring-4 focus:ring-white/60"
    >
      {failed ? (
        <span className="flex h-full w-full items-center justify-center p-4 text-center text-xl font-bold text-white">
          {work.title}
        </span>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://image.tmdb.org/t/p/w500${work.poster}`}
            alt={work.title}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="relative w-full bg-gradient-to-t from-black/90 to-transparent p-4 text-lg font-bold text-white">
            {work.title}
            <span className="ml-2 text-sm font-normal opacity-70">{work.year}</span>
          </span>
        </>
      )}
    </button>
  )
}
```

- [ ] **Step 2: 진행 화면 작성**

`app/play/page.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PosterCard } from '@/components/PosterCard'
import worksData from '@/data/works.json'
import { encodeChoices } from '@/lib/payload'
import { score } from '@/lib/scoring'
import { nextPair } from '@/lib/selector'
import { ROUNDS, type Choice, type Work } from '@/lib/types'

const POOL = worksData as Work[]

export default function PlayPage() {
  const router = useRouter()
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const [choices, setChoices] = useState<Choice[]>([])

  const pair = useMemo(() => nextPair(POOL, choices, seed), [choices, seed])

  function pick(winner: number, loser: number) {
    const next = [...choices, { winner, loser }]
    if (next.length >= ROUNDS) {
      const { code } = score(POOL, next)
      router.push(`/r/${code}?p=${encodeChoices(next)}`)
      return
    }
    setChoices(next)
  }

  const progress = (choices.length / ROUNDS) * 100

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <div className="mb-2 flex justify-between text-sm text-neutral-400">
          <span>
            {choices.length + 1} / {ROUNDS}
          </span>
          <span>더 끌리는 쪽을 고르세요</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 items-center gap-3 sm:gap-5">
        <PosterCard work={POOL[pair.left]} onPick={() => pick(pair.left, pair.right)} />
        <PosterCard work={POOL[pair.right]} onPick={() => pick(pair.right, pair.left)} />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: `tsconfig.json`이 JSON import를 허용하는지 확인하고 필요하면 추가**

`compilerOptions`에 `"resolveJsonModule": true`가 없으면 추가한다. create-next-app 기본 설정에는 포함되어 있으므로 대개 확인만 하면 된다.

Run: `grep resolveJsonModule tsconfig.json`
Expected: `"resolveJsonModule": true` 출력. 없으면 `compilerOptions`에 추가한다.

- [ ] **Step 4: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add app/play components/PosterCard.tsx tsconfig.json && git commit -m "feat: add adaptive play screen with poster fallback"
```

---

## Task 12: 결과 카드 (result)

**Files:**
- Create: `app/r/[code]/page.tsx`
- Create: `components/AxisBars.tsx`
- Create: `components/ShareButton.tsx`

- [ ] **Step 1: 축 막대그래프 컴포넌트 작성**

`components/AxisBars.tsx`:

```tsx
import { AXIS_LABELS, type Axes } from '@/lib/types'

export function AxisBars({ norm }: { norm: Axes }) {
  return (
    <div className="flex flex-col gap-4">
      {norm.map((value, axis) => {
        const label = AXIS_LABELS[axis]
        const percent = Math.abs(value) * 50
        return (
          <div key={axis}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className={value < 0 ? 'font-bold text-white' : 'text-neutral-500'}>{label.neg}</span>
              <span className={value >= 0 ? 'font-bold text-white' : 'text-neutral-500'}>{label.pos}</span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-neutral-800">
              <div className="absolute left-1/2 top-0 h-full w-px bg-neutral-600" />
              <div
                className="absolute top-0 h-full rounded-full bg-white"
                style={
                  value < 0
                    ? { right: '50%', width: `${percent}%` }
                    : { left: '50%', width: `${percent}%` }
                }
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 공유 버튼 작성**

`components/ShareButton.tsx`:

```tsx
'use client'

import { useState } from 'react'

export function ShareButton() {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ url })
        return
      } catch {
        // 사용자가 공유 시트를 닫은 경우 — 클립보드로 폴백한다.
      }
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={share}
      className="rounded-full bg-white px-6 py-3 font-bold text-black transition hover:bg-neutral-200"
    >
      {copied ? '링크 복사됨' : '결과 공유하기'}
    </button>
  )
}
```

- [ ] **Step 3: 결과 페이지 작성**

Next 16에서 `params`와 `searchParams`는 Promise이므로 await 한다.

`app/r/[code]/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AxisBars } from '@/components/AxisBars'
import { ShareButton } from '@/components/ShareButton'
import { STORY_TYPES } from '@/data/story-types'
import worksData from '@/data/works.json'
import { decodeChoices } from '@/lib/payload'
import { compatibleCode, oppositeCode, score } from '@/lib/scoring'
import type { Work } from '@/lib/types'

const POOL = worksData as Work[]

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ p?: string }>
}) {
  const { code } = await params
  const { p } = await searchParams

  const choices = p ? decodeChoices(p, POOL.length) : null
  if (!choices) redirect('/')

  const result = score(POOL, choices)
  if (result.code !== code) redirect(`/r/${result.code}?p=${p}`)

  const type = STORY_TYPES[result.code]
  if (!type) redirect('/')

  const opposite = STORY_TYPES[oppositeCode(result.code)]
  const compatible = STORY_TYPES[compatibleCode(result.code)]
  const picked = choices.map((c) => POOL[c.winner])

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-4 py-12">
      <header className="text-center">
        <p className="text-6xl font-black tracking-tight text-white">{result.code}</p>
        <h1 className="mt-3 text-3xl font-bold text-white">{type.name}</h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-neutral-300">{type.description}</p>
      </header>

      <AxisBars norm={result.norm} />

      <section>
        <h2 className="mb-3 text-sm font-bold text-neutral-400">당신이 고른 12편</h2>
        <div className="grid grid-cols-6 gap-1.5">
          {picked.map((work, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={`${work.media}-${work.id}-${i}`}
              src={`https://image.tmdb.org/t/p/w185${work.poster}`}
              alt={work.title}
              className="aspect-[2/3] w-full rounded-md bg-neutral-800 object-cover"
            />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">잘 맞는 유형</p>
          <p className="mt-1 font-bold text-white">{compatible.name}</p>
          <p className="text-sm text-neutral-500">{compatibleCode(result.code)}</p>
        </div>
        <div className="rounded-xl bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">상극 유형</p>
          <p className="mt-1 font-bold text-white">{opposite.name}</p>
          <p className="text-sm text-neutral-500">{oppositeCode(result.code)}</p>
        </div>
      </section>

      <div className="flex flex-col items-center gap-3">
        <ShareButton />
        <Link href="/play" className="text-sm text-neutral-400 underline">
          다시 하기
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add app/r components/AxisBars.tsx components/ShareButton.tsx && git commit -m "feat: add result card with axis bars and picked posters"
```

---

## Task 13: OG 이미지

**Files:**
- Create: `app/r/[code]/opengraph-image.tsx`
- Modify: `app/r/[code]/page.tsx` (metadata 추가)

- [ ] **Step 1: OG 이미지 생성기 작성**

`app/r/[code]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { STORY_TYPES } from '@/data/story-types'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Story Compass 결과'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const type = STORY_TYPES[code]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: 'white',
        }}
      >
        <div style={{ fontSize: 140, fontWeight: 900, letterSpacing: '-0.04em' }}>{code}</div>
        <div style={{ fontSize: 56, fontWeight: 700, marginTop: 8 }}>{type?.name ?? '서사 정체성 유형'}</div>
        <div style={{ fontSize: 28, color: '#a3a3a3', marginTop: 32 }}>Story Compass</div>
      </div>
    ),
    size,
  )
}
```

- [ ] **Step 2: 결과 페이지에 metadata 추가**

`app/r/[code]/page.tsx` 파일 상단, `const POOL = ...` 바로 아래에 다음을 추가한다:

```tsx
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const type = STORY_TYPES[code]
  if (!type) return { title: 'Story Compass' }
  return {
    title: `${code} · ${type.name} | Story Compass`,
    description: type.description,
  }
}
```

- [ ] **Step 3: 프로덕션 빌드로 OG 라우트가 생성되는지 확인**

Run: `npm run build`
Expected: 빌드 성공, 라우트 목록에 `/r/[code]`와 `/r/[code]/opengraph-image`가 표시됨

- [ ] **Step 4: 커밋**

```bash
git add app/r && git commit -m "feat: add dynamic OG image for result codes"
```

---

## Task 14: 랜딩, TMDB 고지, 최종 검증

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Create: `components/Footer.tsx`

- [ ] **Step 1: TMDB 고지 푸터 작성**

TMDB 로고는 [themoviedb.org/about/logos-attribution](https://www.themoviedb.org/about/logos-attribution)에서 받아 `public/tmdb.svg`로 저장하고, 서비스 자체 로고보다 작게 배치한다.

`components/Footer.tsx`:

```tsx
export function Footer() {
  return (
    <footer className="mx-auto flex max-w-2xl flex-col items-center gap-2 px-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tmdb.svg" alt="The Movie Database" className="h-4 opacity-60" />
      <p className="text-xs leading-relaxed text-neutral-500">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  )
}
```

- [ ] **Step 2: TMDB 로고 파일 준비**

TMDB의 로고 에셋 URL은 콘텐츠 해시가 붙어 있어 고정 주소로 받을 수 없다. 사용자에게 요청한다:

> [themoviedb.org/about/logos-attribution](https://www.themoviedb.org/about/logos-attribution)에서 "Primary Short" 로고(SVG)를 받아 `public/tmdb.svg`로 저장해주세요. 약관상 이 로고와 고지 문구가 있어야 API를 쓸 수 있습니다.

파일이 놓인 뒤 확인한다.

Run: `head -c 60 public/tmdb.svg`
Expected: `<svg` 로 시작하는 내용 출력

- [ ] **Step 3: 레이아웃에 푸터와 기본 스타일 적용**

`app/layout.tsx`의 `body` 요소를 다음으로 교체한다 (import 문에 `import { Footer } from '@/components/Footer'` 추가):

```tsx
      <body className="bg-neutral-950 text-white antialiased">
        {children}
        <Footer />
      </body>
```

같은 파일의 `metadata`를 다음으로 교체한다:

```tsx
export const metadata: Metadata = {
  title: 'Story Compass — 당신은 어떤 이야기의 주인공인가',
  description: '영화와 드라마 12번의 선택으로 알아보는 서사 정체성 유형',
}
```

- [ ] **Step 4: 랜딩 페이지 작성**

`app/page.tsx` 전체를 다음으로 교체한다:

```tsx
import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">
          당신은 어떤 이야기의
          <br />
          주인공인가
        </h1>
        <p className="mt-5 leading-relaxed text-neutral-400">
          영화와 드라마 두 편 중 하나를 고르는 일을 열두 번.
          <br />
          그 선택이 당신의 서사 정체성을 네 글자로 말해줍니다.
        </p>
      </div>

      <Link
        href="/play"
        className="rounded-full bg-white px-8 py-4 text-lg font-bold text-black transition hover:bg-neutral-200"
      >
        시작하기
      </Link>

      <p className="text-xs text-neutral-600">약 1분 소요 · 로그인 없음</p>
    </main>
  )
}
```

- [ ] **Step 5: 전체 테스트 실행**

Run: `npm test`
Expected: PASS — scoring 7 + rng 6 + selector 6 + payload 6 + pool-health 6 + story-types 4 = 35 tests passed

- [ ] **Step 6: 프로덕션 빌드**

Run: `npm run build`
Expected: 빌드 성공, 오류 없음

- [ ] **Step 7: 개발 서버에서 실제 플레이 검증**

`.claude/launch.json`을 만들고 preview 도구로 서버를 띄운다:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "story-compass",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

그다음 preview_start로 서버를 열고 다음을 확인한다:

1. 랜딩에서 시작하기 → `/play`로 이동
2. 12번 선택 → `/r/<CODE>?p=...`로 이동
3. 결과 페이지에 코드, 유형 이름, 네 축 막대, 고른 12편 포스터가 모두 보임
4. 콘솔 에러 없음 (`read_console_messages`)
5. 결과 URL을 새 탭에서 열면 같은 결과가 재현됨
6. `?p=` 없이 `/r/CATW`로 접근하면 랜딩으로 리다이렉트

- [ ] **Step 8: 커밋**

```bash
git add -A && git commit -m "feat: add landing page and TMDB attribution footer"
```

---

## Definition of Done

- [ ] `npm test`가 35개 테스트를 모두 통과한다
- [ ] `npm run build`가 오류 없이 끝난다
- [ ] 개발 서버에서 랜딩 → 12라운드 → 결과 카드가 콘솔 에러 없이 동작한다
- [ ] 결과 URL을 새 세션에서 열면 같은 코드와 같은 12편이 재현된다
- [ ] 잘못된 `?p=` 값이 랜딩으로 리다이렉트된다
- [ ] 푸터에 TMDB 로고와 고지 문구가 있다
- [ ] `data/works.json`이 커밋되어 있고 `checkPool` 검증을 통과한다
- [ ] `.env.local`이 커밋되지 않았다 (`git status --ignored`로 확인)

배포는 별도 지시가 있을 때 진행한다.
