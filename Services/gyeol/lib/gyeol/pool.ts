import { matchGyeol } from './match'
import { workKey, type Catalog, type CatalogEntry, type Gyeol } from './types'

/** 결 하나가 그리드에 내보내는 작품 수. 한국 1 + 해외 1. */
const PER_GYEOL = 2

/**
 * 25개 결이 고르게 대표되도록 후보를 뽑는다.
 *
 * **장르가 아니라 결로 층화하는 이유**: 우리가 재는 것은 결인데 장르로 나누면
 * 서로 다른 장르가 같은 결로 모인다. 장르 층화로 만든 48장에서는 부산행·반도·
 * 서울역·설국열차·#살아있다·지금 우리 학교는·오징어 게임·스위트홈이 모두
 * 「끝까지 남는 결」에 걸려 **48장 중 10장이 한 결**이었다. 한국 콘텐츠 중 TMDB
 * 표를 많이 받은 것이 좀비·재난물에 쏠려 있기 때문인데, 장르로 나누면 이들이
 * 공포·SF·액션으로 흩어져 편중이 눈에 안 띈다.
 *
 * 결로 나누면 25개가 전부 대표되고 한 결이 21%를 먹는 일이 사라진다.
 *
 * **매체는 강제하지 않는다.** 결마다 영화/드라마 분면을 맞추려 하면 꼬리로
 * 파고들어 아는 사람이 적은 작품이 섞인다. 드라마 비중은 낮아지지만 후보가
 * 전부 알아볼 만한 작품이 되고, 드라마를 찾는 사람은 검색으로 직접 추가할 수 있다.
 */
export function buildGyeolPool(catalog: Catalog, gyeolTypes: Gyeol[]): CatalogEntry[] {
  const vocabularyIndex = new Map(catalog.vocabulary.map((k, i) => [k, i]))
  const keywordsOf = new Map(
    gyeolTypes.map((g) => [
      g.id,
      new Set(
        g.keywords.map((k) => vocabularyIndex.get(k)).filter((i): i is number => i !== undefined),
      ),
    ]),
  )

  // 작품마다 단독 1위 결을 미리 구한다. 만 편이 넘으므로 한 번만 돈다.
  const byGyeol = new Map<string, CatalogEntry[]>()
  for (const work of catalog.works) {
    const top = matchGyeol([work], catalog, gyeolTypes)[0]
    if (top === undefined || top.score <= 0) continue

    // 조건 키워드가 하나도 없는데 장르 보정(0.4)만으로 1위가 된 작품은 그 결을
    // 대표하지 못한다. 카탈로그의 39%가 그런 상태이고, 「티격태격의 결」은
    // 1,380편 중 90%가 가짜라 romcom 키워드가 없는 「레드슈즈」가 대표작으로
    // 올라와 있었다. 그 결과 이 결은 시뮬레이션에서 한 번도 1위를 못 했다.
    if (!work.k.some((k) => keywordsOf.get(top.id)!.has(k))) continue

    const bucket = byGyeol.get(top.id)
    if (bucket) bucket.push(work)
    else byGyeol.set(top.id, [work])
  }

  const used = new Set<string>()
  const picked: CatalogEntry[] = []

  for (const gyeol of gyeolTypes) {
    // 후보는 카탈로그 순서를 물려받는다. 그룹 안이 vote_count 내림차순이므로
    // 앞에서 뽑는 것이 곧 그 결에서 가장 알려진 작품이다.
    const pool = (byGyeol.get(gyeol.id) ?? []).filter((w) => !used.has(workKey(w)))
    const take = [
      ...pool.filter((w) => w.ko === 1).slice(0, 1),
      ...pool.filter((w) => w.ko === 0).slice(0, 1),
    ]

    // 한쪽이 비면 남은 것으로 채운다. 후보가 아예 없는 결은 건너뛴다.
    for (const work of pool) {
      if (take.length >= PER_GYEOL) break
      if (!take.includes(work)) take.push(work)
    }

    take.forEach((w) => used.add(workKey(w)))
    picked.push(...take)
  }

  return picked
}

