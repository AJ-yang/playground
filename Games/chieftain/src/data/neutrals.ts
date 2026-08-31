/**
 * 중립 세 갈래 (GDD 4.3).
 *
 * 갈래는 셋으로 **고정**이고 맵마다 옷만 갈아입는다. 맵이 열 개가 되어도
 * 플레이어가 배울 것은 여전히 셋이라, 처음 보는 맵에서도 생김새만 보고
 * 무엇인지 안다.
 *
 * 셋이 각각 다른 종류의 결정을 요구하는 것이 설계 의도다:
 *
 * | 갈래 | 사는 것 | 결정의 성격 |
 * |---|---|---|
 * | 용병단  | 나중의 전력 | 지금 피를 흘려 미래를 산다 |
 * | 크리쳐  | 당장의 자원 | 지금 필요한 것을 지금 얻는다 |
 * | 성터    | 땅의 모양   | 즉효는 없지만 전선이 바뀐다 |
 *
 * 셋 중 어디에 아바타를 먼저 보낼 것인가 — 그것이 곧 지휘 반경 규칙이
 * 작동하는지 보는 실험이다(GDD 6.1). 그래서 v1에서도 갈래를 줄이지 않는다.
 */
import type { UnitKind } from './units'

export type NeutralKind = 'mercenary' | 'creature' | 'ruin'

export interface NeutralDef {
  readonly kind: NeutralKind
  /** 이 맵에서의 이름. 갈래는 같아도 이름은 맵마다 다르다. */
  readonly name: string
  /** 지키는 무리의 수와 개체 성능. `ruin`은 지키는 것이 없거나 약하다. */
  readonly guards: number
  readonly guardHp: number
  readonly guardDps: number
  readonly guardRange: number
  /** 이겼을 때 얻는 것. 갈래마다 하나씩만 채워진다. */
  readonly rewardUnits?: readonly UnitKind[]
  readonly rewardSilver?: number
  /** `ruin`을 점령하면 전초가 서고 시야가 넓어진다. */
  readonly grantsOutpost?: boolean
  readonly blurb: string
}

/** 피오르드 해안이 입는 옷 (GDD 4.3의 맵별 표). */
export const FJORD_NEUTRALS: Record<NeutralKind, NeutralDef> = {
  mercenary: {
    kind: 'mercenary',
    name: '떠돌이 바랑기아 무리',
    // 셋 중 가장 세다. 미래의 전력을 사는 것이므로 값이 비싸야 한다.
    guards: 3,
    guardHp: 110,
    guardDps: 14,
    guardRange: 3.0,
    rewardUnits: ['axe', 'axe', 'shield'],
    blurb: '이기면 내 편이 된다',
  },
  creature: {
    kind: 'creature',
    name: '곰과 늑대',
    // 가장 무르다. 당장의 자원이라 빨리 돌아야 한다.
    guards: 2,
    guardHp: 90,
    guardDps: 16,
    guardRange: 2.4,
    rewardSilver: 150,
    blurb: '잡으면 은을 떨군다',
  },
  ruin: {
    kind: 'ruin',
    name: '무너진 돌성채',
    // 지키는 것이 거의 없다. 대신 즉효가 없어서, 여유가 있을 때 먹는 곳이다.
    guards: 1,
    guardHp: 70,
    guardDps: 7,
    guardRange: 2.6,
    grantsOutpost: true,
    blurb: '점령하면 멀리 본다',
  },
}
