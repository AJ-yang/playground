import { matchGyeol } from './match'
import type { Catalog, Gyeol } from './types'

/** 결끼리 함께 걸린 횟수. `affinity[a][b]`와 `affinity[b][a]`는 같다. */
export type Affinity = Record<string, Record<string, number>>

/**
 * 카탈로그에서 결끼리 얼마나 함께 걸리는지 센다.
 *
 * **키워드가 겹치는지로 재면 안 된다.** 25개 결은 서로 구별되도록 겹치지 않게
 * 정의되어 있어서, 키워드 교집합으로 이웃을 찾으면 15개 결에 이웃이 하나도
 * 안 나온다. 실제로 그렇게 만들었다가 되돌렸다.
 *
 * 대신 작품을 매개로 잰다. 한 작품이 두 결의 상위에 함께 걸린다면 그 둘은
 * 사람 눈에도 가까운 이야기다 — 정의가 겹치지 않아도 작품은 겹친다.
 *
 * 조건 키워드가 하나도 없는 작품은 건너뛴다. 장르 보정만으로 매겨진 순위는
 * 그 결을 대표하지 못하고(카탈로그의 39%가 그렇다), 세면 관계가 잡음으로 찬다.
 */
export function computeAffinity(catalog: Catalog, gyeolTypes: Gyeol[]): Affinity {
  const affinity: Affinity = {}
  const add = (a: string, b: string) => {
    affinity[a] ??= {}
    affinity[a][b] = (affinity[a][b] ?? 0) + 1
  }

  for (const work of catalog.works) {
    if (work.k.length === 0) continue
    const [first, second] = matchGyeol([work], catalog, gyeolTypes)
    if (first === undefined || second === undefined) continue
    if (first.score <= 0 || second.score <= 0) continue
    add(first.id, second.id)
    add(second.id, first.id)
  }

  return affinity
}

/**
 * 그 결과 가장 자주 함께 걸리는 결들.
 *
 * 함께 걸린 적이 없으면 아예 내지 않는다. 억지로 채우면 "가까운 결"이라는
 * 말이 거짓이 된다 — 요청한 수보다 적게 나오는 편이 낫다.
 */
export function nearbyGyeols(
  id: string,
  affinity: Affinity,
  gyeolTypes: Gyeol[],
  count: number,
): Gyeol[] {
  const order = new Map(gyeolTypes.map((g, index) => [g.id, index]))

  return Object.entries(affinity[id] ?? {})
    .filter(([other]) => order.has(other))
    // 횟수가 같으면 정의 순서를 지킨다. 흔들리면 같은 결을 다시 열 때마다
    // 다른 이웃이 나온다.
    .sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!)
    .slice(0, count)
    .map(([other]) => gyeolTypes[order.get(other)!])
}
