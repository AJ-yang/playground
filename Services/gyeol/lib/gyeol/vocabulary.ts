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
