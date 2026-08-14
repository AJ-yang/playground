import type { CatalogEntry } from './types'

/**
 * 제목으로 찾는다. 색인이 브라우저에 있으므로 서버가 필요 없다.
 *
 * **일치 방식으로 순위를 매긴다.** 카탈로그 순서대로 첫 매치를 집으면
 * "오징어 게임"을 쳤을 때 본편이 아니라 「오징어 게임: 시즌2 제작 이야기」가
 * 먼저 나온다. 메이킹 필름이나 리얼리티 스핀오프가 본편을 밀어내면 사용자가
 * 엉뚱한 작품을 고르게 된다.
 *
 * 완전 일치 → 앞에서 시작 → 중간 포함 순으로 두고, 같은 순위 안에서는
 * 카탈로그 순서(그 그룹의 인지도 순)를 그대로 지킨다.
 */
export function searchWorks(works: CatalogEntry[], query: string, limit: number): CatalogEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  const exact: CatalogEntry[] = []
  const prefix: CatalogEntry[] = []
  const inside: CatalogEntry[] = []

  for (const work of works) {
    const title = work.t.toLowerCase()
    if (title === needle) exact.push(work)
    else if (title.startsWith(needle)) prefix.push(work)
    else if (title.includes(needle)) inside.push(work)
    // 완전 일치가 limit을 넘길 일은 없으므로 조기 종료는 하지 않는다.
    // 앞쪽에서 끊으면 뒤에 있는 정확한 일치를 놓친다.
  }

  return [...exact, ...prefix, ...inside].slice(0, limit)
}
