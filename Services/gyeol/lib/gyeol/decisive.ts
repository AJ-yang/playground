import { matchGyeol } from './match'
import type { Catalog, CatalogEntry, Gyeol } from './types'

/**
 * 판정을 가른 한 편.
 *
 * `work`를 빼고 다시 매기면 1위가 `without`으로 바뀐다. 즉 이 한 편이 없었다면
 * 다른 결을 받았다는 뜻이다.
 */
export type Decisive = {
  work: CatalogEntry
  /** 이 작품을 뺐을 때 1위가 되는 결의 id */
  without: string
}

/**
 * 고른 작품 중 결을 갈라놓은 한 편을 찾는다.
 *
 * 하나씩 빼보고 1위가 바뀌는 작품을 고른다. 여럿이면 1위 결의 점수를 가장
 * 많이 떠받치던 것을 낸다 — 어느 것을 빼도 결과가 바뀐다면, 가장 무겁게
 * 얹혀 있던 쪽이 그 결을 만든 작품이라고 부를 만하다.
 *
 * **매기는 일은 `matchGyeol`에 그대로 맡긴다.** 지금 구현은 작품별 점수의
 * 단순 합이라 "전체 점수 − 그 작품 점수"로 빼기를 흉내낼 수 있지만, 그 성질에
 * 기대면 나중에 정규화가 들어갈 때 여기가 조용히 틀린 답을 내기 시작한다.
 * 고른 작품은 많아야 수십 편이라 그냥 다시 부르는 값이 싸다.
 *
 * 결정적인 한 편이 없을 수도 있다. 그때는 `null`이다 — 고른 것들이 모두 같은
 * 방향을 가리켰다는 뜻이지 계산이 실패한 것이 아니다. 억지로 하나를 지목하면
 * "이걸 빼도 결과는 같다"는 거짓말이 된다.
 */
export function decisivePick(
  picks: CatalogEntry[],
  catalog: Catalog,
  gyeolTypes: Gyeol[],
): Decisive | null {
  // 한 편뿐이면 뺐을 때 남는 것이 없다. 빈 선택의 1위는 결과가 아니다.
  if (picks.length < 2) return null

  const top = matchGyeol(picks, catalog, gyeolTypes)[0]
  if (top === undefined || top.score <= 0) return null

  let best: (Decisive & { drop: number }) | null = null

  for (let index = 0; index < picks.length; index += 1) {
    const rest = picks.filter((_, other) => other !== index)
    const scores = matchGyeol(rest, catalog, gyeolTypes)
    const leader = scores[0]

    // 남은 것들이 어느 결에도 안 걸리면 비교할 1위가 없다.
    if (leader === undefined || leader.score <= 0) continue
    if (leader.id === top.id) continue

    // 이 한 편이 원래 1위에 얹고 있던 점수.
    const drop = top.score - (scores.find((s) => s.id === top.id)?.score ?? 0)

    // 같은 값이면 먼저 고른 것을 지킨다. 흔들리면 같은 링크를 다시 열 때마다
    // 다른 작품이 지목된다.
    if (best === null || drop > best.drop) {
      best = { work: picks[index], without: leader.id, drop }
    }
  }

  if (best === null) return null
  return { work: best.work, without: best.without }
}
