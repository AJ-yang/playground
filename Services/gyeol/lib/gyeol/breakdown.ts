import type { Gyeol, GyeolScore } from './types'

export type BreakdownRow = {
  id: string
  name: string
  hue: number
  /** 0~100 정수. 낸 행들의 합은 항상 정확히 100이다 */
  percent: number
}

/**
 * 상위 몇 개의 결을 비율로 환산한다.
 *
 * 카드에 "62% / 24% / 14%"로 찍히는 값이다. 분모는 전체 결의 합이 아니라
 * **보여주는 상위 몇 개의 합**이다. 결 점수는 조건 키워드의 IDF 누적합이라
 * 절대값에 의미가 없고, 25개를 모두 더한 분모를 쓰면 1위가 8%처럼 나와
 * "내 결"이라는 느낌이 죽는다.
 *
 * 반올림은 최대 나머지 방식을 쓴다. 각자 반올림하면 33+33+33=99나
 * 27+27+27=81처럼 합이 100에서 어긋나고, 그 숫자가 카드에 그대로 박힌다.
 */
export function breakdown(scores: GyeolScore[], gyeolTypes: Gyeol[], count: number): BreakdownRow[] {
  const byId = new Map(gyeolTypes.map((g) => [g.id, g]))

  const top = scores
    .filter((s) => s.score > 0 && byId.has(s.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)

  const total = top.reduce((sum, s) => sum + s.score, 0)
  if (total === 0) return []

  // 먼저 내림하고, 100에서 모자란 만큼을 나머지가 큰 순서로 하나씩 나눠준다.
  const exact = top.map((s) => (s.score / total) * 100)
  const floors = exact.map(Math.floor)
  let left = 100 - floors.reduce((sum, n) => sum + n, 0)

  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)

  for (const { index } of order) {
    if (left <= 0) break
    floors[index] += 1
    left -= 1
  }

  return top.map((s, index) => {
    const type = byId.get(s.id)!
    return { id: s.id, name: type.name, hue: type.hue, percent: floors[index] }
  })
}
