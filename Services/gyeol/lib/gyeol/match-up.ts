import { matchGyeol } from './match'
import { workKey, type Catalog, type CatalogEntry, type Gyeol, type GyeolScore } from './types'

/**
 * 두 사람의 취향을 견준 결과.
 *
 * 점수 하나로만 끝내지 않는다. 근거 없는 숫자는 한 번 보고 버려지지만, 겹친
 * 작품과 공통 결이 같이 있으면 "이거 너도 봤네"로 대화가 이어진다. 궁합
 * 점수는 그 대화의 제목이지 내용이 아니다.
 */
export type MatchUp = {
  /** 0~100. `overlap`과 `direction`의 평균 */
  score: number
  /** 0~100. 고른 작품이 얼마나 겹치는가 (자카드) */
  overlap: number
  /** 0~100. 결 점수의 방향이 얼마나 같은가 (늘린 코사인) */
  direction: number
  /** 둘 다 고른 작품. a가 고른 순서를 지킨다 */
  shared: CatalogEntry[]
  /** 둘의 상위 세 결에 함께 든 결 */
  common: Gyeol[]
  /** b가 골랐고 a는 안 고른 것 중 a의 결에 가장 잘 맞는 작품 */
  forA: CatalogEntry[]
  /** a가 골랐고 b는 안 고른 것 중 b의 결에 가장 잘 맞는 작품 */
  forB: CatalogEntry[]
  scoresA: GyeolScore[]
  scoresB: GyeolScore[]
}

/**
 * 방향 일치도를 화면에 낼 퍼센트로 늘릴 때의 하한.
 *
 * 결 점수 벡터는 성분이 전부 0 이상이라 코사인이 0 근처로 내려가지 않는다.
 * 취향이 거의 안 겹치는 두 사람도 장르 보정만으로 0.4 언저리가 나오므로, 날값을
 * 그대로 쓰면 누구나 "70% 일치"가 되어 숫자가 아무 말도 하지 않는다.
 *
 * **이 값은 측정한 것이 아니라 잠정치다.** 카탈로그(`public/catalog.json`)는
 * 재생성 대상이라 레포에 없어서 실제 분포를 아직 못 쟀다. 지금 이 상수가
 * 뜻하는 것은 "코사인 0.4 이하를 0%로, 1.0을 100%로 보이겠다"는 표시 규칙일
 * 뿐이고 통계적 주장이 아니다. 데이터를 다시 구우면 분포를 재서 고친다.
 */
const DIRECTION_FLOOR = 0.4

/** 상대에게 건네는 작품 수. 한 편은 빈약하고 열 편은 아무도 안 본다 */
const GIFT_COUNT = 3

/** 공통 결을 찾을 때 서로 견주는 상위 결의 수. 결과 화면의 비율 막대와 같다 */
const TOP_COUNT = 3

/**
 * 두 결 점수 벡터가 이루는 코사인.
 *
 * 절대 점수가 아니라 방향만 본다. 많이 고른 사람은 모든 결의 점수가 통째로
 * 크기 때문에, 크기를 그대로 견주면 "다섯 편 고른 사람"과 "마흔 편 고른 사람"이
 * 무조건 안 맞는 것으로 나온다.
 */
export function cosine(a: GyeolScore[], b: GyeolScore[]): number {
  const byId = new Map(b.map((s) => [s.id, s.score]))

  let dot = 0
  let sizeA = 0
  for (const { id, score } of a) {
    dot += score * (byId.get(id) ?? 0)
    sizeA += score * score
  }

  let sizeB = 0
  for (const { score } of b) sizeB += score * score

  if (sizeA === 0 || sizeB === 0) return 0
  return dot / Math.sqrt(sizeA * sizeB)
}

/** 상대가 골랐고 나는 안 고른 것 중, 내 결에 가장 잘 맞는 작품들. */
function gifts(
  from: CatalogEntry[],
  mine: ReadonlySet<string>,
  toGyeol: string,
  catalog: Catalog,
  gyeolTypes: Gyeol[],
): CatalogEntry[] {
  return from
    .filter((work) => !mine.has(workKey(work)))
    .map((work) => ({
      work,
      score: matchGyeol([work], catalog, gyeolTypes).find((s) => s.id === toGyeol)?.score ?? 0,
    }))
    // 내 결에 아예 안 걸리는 작품은 내지 않는다. 상대가 고른 순서대로 채우면
    // "너한테 맞을 것"이라는 말이 거짓이 된다.
    .filter((entry) => entry.score > 0)
    // 값이 같으면 상대가 고른 순서를 지킨다. 흔들리면 같은 링크가 매번 다른
    // 작품을 보여준다.
    .sort((a, b) => b.score - a.score)
    .slice(0, GIFT_COUNT)
    .map((entry) => entry.work)
}

/**
 * 두 사람의 선택을 견준다.
 *
 * 양쪽 선택이 모두 URL에 담겨 오므로 서버 없이 계산된다. 순수 함수라 카탈로그와
 * 결 정의를 인자로 받는다.
 */
export function matchUp(
  aPicks: CatalogEntry[],
  bPicks: CatalogEntry[],
  catalog: Catalog,
  gyeolTypes: Gyeol[],
): MatchUp {
  const keysA = new Set(aPicks.map(workKey))
  const keysB = new Set(bPicks.map(workKey))

  const shared = aPicks.filter((work) => keysB.has(workKey(work)))
  const union = new Set([...keysA, ...keysB]).size
  const overlap = union === 0 ? 0 : (shared.length / union) * 100

  const scoresA = matchGyeol(aPicks, catalog, gyeolTypes)
  const scoresB = matchGyeol(bPicks, catalog, gyeolTypes)

  const raw = cosine(scoresA, scoresB)
  const direction =
    Math.min(Math.max(raw - DIRECTION_FLOOR, 0) / (1 - DIRECTION_FLOOR), 1) * 100

  const topB = scoresB.find((s) => s.score > 0)
  const topA = scoresA.find((s) => s.score > 0)

  // 순서는 a 쪽을 따른다. `shared`도 a가 고른 순서라 한 화면에서 기준이 하나여야 한다.
  const topIdsA = scoresA.filter((s) => s.score > 0).slice(0, TOP_COUNT).map((s) => s.id)
  const inTopB = new Set(
    scoresB.filter((s) => s.score > 0).slice(0, TOP_COUNT).map((s) => s.id),
  )
  const byId = new Map(gyeolTypes.map((g) => [g.id, g]))
  const common = topIdsA
    .filter((id) => inTopB.has(id))
    .map((id) => byId.get(id))
    .filter((g): g is Gyeol => g !== undefined)

  return {
    score: Math.round((overlap + direction) / 2),
    overlap: Math.round(overlap),
    direction: Math.round(direction),
    shared,
    common,
    forA: topA === undefined ? [] : gifts(bPicks, keysA, topA.id, catalog, gyeolTypes),
    forB: topB === undefined ? [] : gifts(aPicks, keysB, topB.id, catalog, gyeolTypes),
    scoresA,
    scoresB,
  }
}
