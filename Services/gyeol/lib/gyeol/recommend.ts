// lib/gyeol/recommend.ts
import { workKey, type CatalogEntry } from './types'

/** `public/recommendations.json`의 형태. 키는 `<media>-<tmdbId>`다. */
export type RecommendationMap = Record<string, number[]>

/**
 * 고른 작품들의 TMDB 추천을 모아 순위를 매긴다.
 *
 * 개인화 단위가 유형이 아니라 **고른 작품**이다. 같은 결을 받은 두 사람도
 * 고른 작품이 다르면 추천이 다르다. 유형 단위로 하면 같은 코드를 받은 모든
 * 사람이 동일한 목록을 본다.
 *
 * **고른 작품마다 돌아가며 한 편씩 가져간다.** 표 수로만 정렬하면 안 된다 —
 * 추천 대부분은 한 작품에서만 나와 1표씩이고, 동점은 삽입 순서로 갈리는데
 * 그 순서가 곧 고른 순서라 맨 먼저 고른 작품의 추천이 줄줄이 앞에 선다.
 * 열 편을 골라도 목록이 "다 처음 고른 영화와 관련된 것"이 됐다.
 *
 * 여러 작품에서 겹쳐 추천된 것은 각자의 줄 안에서 앞으로 당긴다. 한 번만
 * 추천된 것보다 취향의 중심에 가깝다는 뜻은 살리면서, 한 작품이 목록을
 * 독식하는 것은 막는다.
 */
export function recommend(
  picks: CatalogEntry[],
  recommendations: RecommendationMap,
  works: CatalogEntry[],
  limit: number,
): CatalogEntry[] {
  const byKey = new Map(works.map((w) => [workKey(w), w]))
  const picked = new Set(picks.map(workKey))

  /** 고른 작품 하나가 실제로 추천할 수 있는 것들. 색인에 없거나 이미 고른 것은 뺀다. */
  const candidatesOf = (pick: CatalogEntry): string[] => {
    const keys: string[] = []
    for (const id of recommendations[workKey(pick)] ?? []) {
      const key = `${pick.m}-${id}`
      if (picked.has(key) || !byKey.has(key) || keys.includes(key)) continue
      keys.push(key)
    }
    return keys
  }

  // 표를 먼저 센다. 줄 안의 순서를 정하는 데만 쓰고 줄 사이에는 쓰지 않는다.
  const votes = new Map<string, number>()
  for (const pick of picks) {
    for (const key of candidatesOf(pick)) votes.set(key, (votes.get(key) ?? 0) + 1)
  }

  // 고른 작품마다 자기 줄을 만든다. 겹쳐 추천된 것이 앞, 같으면 TMDB 순서.
  const queues = picks.map((pick) =>
    candidatesOf(pick)
      .map((key, order) => ({ key, order }))
      .sort((a, b) => (votes.get(b.key) ?? 0) - (votes.get(a.key) ?? 0) || a.order - b.order)
      .map((entry) => entry.key),
  )

  const taken = new Set<string>()
  const out: CatalogEntry[] = []
  const cursor = queues.map(() => 0)

  // 한 바퀴 돌아 아무도 못 가져가면 남은 추천이 없다는 뜻이라 멈춘다.
  while (out.length < limit) {
    let advanced = false
    for (let i = 0; i < queues.length && out.length < limit; i++) {
      const queue = queues[i]
      let at = cursor[i]
      while (at < queue.length && taken.has(queue[at])) at += 1
      cursor[i] = at + 1
      if (at >= queue.length) continue
      taken.add(queue[at])
      out.push(byKey.get(queue[at])!)
      advanced = true
    }
    if (!advanced) break
  }

  return out
}
