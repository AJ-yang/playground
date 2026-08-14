import { workKey, type Catalog, type CatalogEntry, type Gyeol, type GyeolScore } from './types'

/** 1위에게 도전할 후보를 몇 위까지 볼지. 너무 넓히면 무관한 결이 올라온다. */
const CHALLENGER_DEPTH = 4

/**
 * 사용자가 고른 것과 장르가 겹칠 때 붙는 가산점.
 *
 * 취향 안에 두되 결정권을 주지는 않는다. 크게 잡으면 드라마 장르(작품의 60.7%)
 * 때문에 거의 모든 작품이 가산을 받아 변별력이 사라진다.
 */
const TASTE_BONUS = 1.0

/**
 * 각 그룹(한국/해외 × 영화/TV)에서 대결 후보로 볼 상위 편수.
 *
 * 강도로만 뽑으면 반대쪽으로 간다. 무명작일수록 희귀 키워드가 많이 붙어 IDF
 * 합이 커지므로 「빛나는 TV를 보았다」·「화성인 지구정복」 같은 것이 뽑힌다.
 * **먼저 알아볼 만한 범위로 자르고 그 안에서 가장 잘 맞는 것을 고른다.**
 * 대결은 아는 작품끼리 붙어야 의미가 있다.
 */
const FAME_LIMIT = 250

/**
 * 가장 잘 맞는 작품 대비 이 비율 이상이어야 후보로 남는다.
 *
 * 관문을 통과한 것들 중에서는 인지도로 고른다. 낮추면 약하게 스친 유명작이
 * 들어오고, 높이면 후보가 말라 무명작만 남는다.
 */
const STRENGTH_GATE = 0.6

/** 대결 한쪽. 어느 결을 대표하는 작품인지 같이 들고 다닌다. */
export type DuelSide = { gyeolId: string; gyeolName: string; work: CatalogEntry }
export type Duel = { left: DuelSide; right: DuelSide }

/**
 * 다음 대결을 고른다. 결판났거나 가를 작품이 없으면 `null`.
 *
 * 1라운드가 기준선을 잡았으니 2라운드가 할 일은 **붙어 있는 후보를 가르는 것**
 * 하나다.
 *
 * **1위가 앞선다고 조기 종료하지 않는다.** 처음에는 1·2위가 30% 넘게 벌어지면
 * 건너뛰게 했는데, 실측에서 5편 기준 48%가 그 상태였다. 사용자의 절반이 대결을
 * 한 번도 못 보고 결과로 넘어갔다. 벌어진 사람에게도 물어볼 값어치는 있다 —
 * 아래 순위를 정리하고 추천에 쓸 신호가 늘어난다. 더 고르게 하는 것으로는 안 갈린다 — 실측에서 15편을 골라도 5편 더
 * 고르면 42%가 뒤집혔고 1·2위 차이는 편수와 거의 무관했다.
 *
 * 앞선 구현이 실제 데이터에서 무너진 원인 셋을 여기서 막는다.
 *
 * 1. **1위를 겨냥한다.** 쌍을 점수 차 절댓값으로만 정렬하면 하위권의 더 붙은
 *    쌍이 1·2위를 제친다. 실제로 1위 29.2 / 2위 28.9인 상황에서 3위 15.1 vs
 *    4위 15.0을 먼저 물었다. 가르는 값어치는 1위 근처에 있다.
 * 2. **사용자 취향 안에서 뽑는다.** 카탈로그 순서로 첫 매치를 집으면 배열
 *    앞쪽의 유명한 한국 영화가 취향과 무관하게 나온다. 로맨스를 고른 사용자에게
 *    기생충·살인의 추억·마녀가 나왔다.
 * 3. **조건 키워드를 실제로 가진 작품만 쓴다.** 장르 보정만으로 1위가 되는
 *    작품이 카탈로그의 39%다. 그런 작품은 그 결을 대표하지 못한다.
 */
export function nextDuel(
  picks: CatalogEntry[],
  scores: GyeolScore[],
  catalog: Catalog,
  gyeolTypes: Gyeol[],
  used: ReadonlySet<string>,
): Duel | null {
  const ranked = [...scores].sort((a, b) => b.score - a.score)
  if (ranked.length < 2) return null

  // 점수가 전부 0이면 가릴 것이 없다.
  if (ranked[0].score <= 0) return null

  const byId = new Map(gyeolTypes.map((g) => [g.id, g]))
  const vocabularyIndex = new Map(catalog.vocabulary.map((k, i) => [k, i]))
  const keywordsOf = (gyeol: Gyeol) =>
    new Set(
      gyeol.keywords.map((k) => vocabularyIndex.get(k)).filter((i): i is number => i !== undefined),
    )

  // 사용자가 고른 것들의 장르. 대결 작품이 이 안에 있어야 취향에서 안 벗어난다.
  const tasteGenres = new Set(picks.flatMap((w) => w.g))

  // 그룹 안에서 몇 번째로 유명한지. 카탈로그가 그룹별 vote_count 내림차순이다.
  const fameRank = new Map<string, number>()
  const seenInGroup = new Map<string, number>()
  for (const work of catalog.works) {
    const group = `${work.ko}-${work.m}`
    const rank = seenInGroup.get(group) ?? 0
    fameRank.set(workKey(work), rank)
    seenInGroup.set(group, rank + 1)
  }

  /**
   * 자기 결의 키워드는 갖고 상대 결의 키워드는 없는 작품 중 대결에 세울 것.
   *
   * **충분히 맞는 것들 중 가장 알아볼 만한 것을 고른다.** 두 단계로 나누는
   * 이유는 한쪽만 보면 반드시 실패하기 때문이다.
   *
   * - 인지도만 보면 「살인의 추억」이 `1980s` 하나로 「그때로 돌아가는 결」의
   *   대표가 된다. 약하게 스친 유명작이 이긴다.
   * - 강도만 보면 「빛나는 TV를 보았다」·「화성인 지구정복」이 뽑힌다. 무명작일수록
   *   희귀 키워드가 많이 붙어 IDF 합이 커진다. 실제로 이 방식에서는 「기묘한
   *   이야기」(그룹 1위)가 6번째 대결까지 안 나왔다.
   *
   * 그래서 먼저 강도가 최댓값의 STRENGTH_GATE 이상인 것만 남기고, 그 안에서
   * 그룹 내 인지도 순위가 가장 앞선 것을 쓴다. 첫 판이 가장 알아볼 만해야 한다.
   */
  function represent(
    mine: ReadonlySet<number>,
    theirs: ReadonlySet<number>,
    exclude: ReadonlySet<string>,
  ): CatalogEntry | undefined {
    const eligible: { work: CatalogEntry; strength: number }[] = []

    for (const work of catalog.works) {
      if (used.has(workKey(work)) || exclude.has(workKey(work))) continue
      if ((fameRank.get(workKey(work)) ?? Infinity) >= FAME_LIMIT) continue
      if (work.k.some((k) => theirs.has(k))) continue

      let strength = 0
      for (const k of new Set(work.k)) if (mine.has(k)) strength += catalog.idf[k] ?? 0
      if (strength <= 0) continue
      if (work.g.some((g) => tasteGenres.has(g))) strength += TASTE_BONUS

      eligible.push({ work, strength })
    }

    if (eligible.length === 0) return undefined

    const strongest = Math.max(...eligible.map((e) => e.strength))
    const passed = eligible.filter((e) => e.strength >= strongest * STRENGTH_GATE)

    let best = passed[0]
    for (const candidate of passed) {
      const a = fameRank.get(workKey(candidate.work)) ?? Infinity
      const b = fameRank.get(workKey(best.work)) ?? Infinity
      if (a < b) best = candidate
    }
    return best.work
  }

  const champion = byId.get(ranked[0].id)
  if (!champion) return null
  const championKeys = keywordsOf(champion)

  // 1위와 가장 붙은 도전자부터 시도한다. 가를 작품이 없으면 다음 도전자로.
  const challengers = ranked
    .slice(1, CHALLENGER_DEPTH)
    .sort((a, b) => b.score - a.score)
    .map((s) => byId.get(s.id))
    .filter((g): g is Gyeol => g !== undefined)

  for (const challenger of challengers) {
    const challengerKeys = keywordsOf(challenger)
    const championWork = represent(championKeys, challengerKeys, new Set())
    if (!championWork) continue
    const challengerWork = represent(
      challengerKeys,
      championKeys,
      new Set([workKey(championWork)]),
    )
    if (!challengerWork) continue

    return {
      left: { gyeolId: champion.id, gyeolName: champion.name, work: championWork },
      right: { gyeolId: challenger.id, gyeolName: challenger.name, work: challengerWork },
    }
  }

  return null
}
