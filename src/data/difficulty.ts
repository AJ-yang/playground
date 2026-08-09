/**
 * 난이도.
 *
 * **적의 체력만 바꾼다.** 웨이브 구성·스폰 타이밍·적 종류·타워 수치는 전부
 * 그대로다. 이유가 두 가지다.
 *
 * 1. 이 게임의 설계는 "어떤 조합으로 어떤 상성을 푸는가"에 있다. 난이도가
 *    적의 종류나 방어 스탯을 바꾸면 **풀이 자체가 달라져** 쉬움에서 배운 것이
 *    어려움에서 통하지 않는다. 배운 것이 그대로 통하되 여유만 줄어드는 쪽이
 *    학습 곡선으로 옳다.
 * 2. 검증 비용. 헤드리스 시뮬레이터는 보통(1.0)을 기준으로 돌리는데, 축이
 *    하나(체력 배율)뿐이면 다른 난이도의 결과를 배율로 읽어낼 수 있다.
 *    난이도마다 웨이브가 다르면 검증을 난이도 수만큼 다시 해야 한다.
 *
 * 클리어 기록은 난이도별로 따로 남지만, **해금은 난이도와 무관하게 공유한다** —
 * 쉬움으로 깬 사람도 다음 스테이지와 기물을 열 수 있어야 한다. 난이도는
 * 진입 장벽이지 콘텐츠 잠금이 아니다.
 */
export interface DifficultyDef {
  id: string
  name: string
  /** 적 최대 체력 배율 */
  hpScale: number
  /** 선택 화면에 쓰는 한 줄 설명 */
  desc: string
  color: string
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'easy',
    name: '쉬움',
    hpScale: 0.7,
    desc: '적 체력 70%. 상성을 익히며 여유 있게',
    color: '#8bd450',
  },
  {
    id: 'normal',
    name: '보통',
    hpScale: 1,
    desc: '적 체력 100%. 설계된 기준 난이도',
    color: '#5aa9e6',
  },
  {
    id: 'hard',
    name: '어려움',
    hpScale: 1.25,
    desc: '적 체력 125%. 조기 소환이 사실상 필수',
    color: '#e0b341',
  },
] as const

export const DEFAULT_DIFFICULTY = 'normal'

export function getDifficulty(id: string): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]!
}
