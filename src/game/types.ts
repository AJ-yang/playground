/** 데미지 타입. 적의 방어 스탯과 짝을 이뤄 타워 조합을 강제하는 핵심 축이다. */
export type DamageType =
  /** 물리: 적의 armor 만큼 고정 감소 */
  | 'physical'
  /** 마법: 적의 magicResist 비율만큼 감소 */
  | 'magic'
  /** 순수: 감소 없음 */
  | 'pure'

/** 타워가 사거리 안의 여러 적 중 누구를 쏠지 정하는 규칙. */
export type TargetPriority = 'first' | 'last' | 'strongest' | 'closest'

export const TARGET_PRIORITY_ORDER: readonly TargetPriority[] = [
  'first',
  'last',
  'strongest',
  'closest',
]

export const TARGET_PRIORITY_LABEL: Record<TargetPriority, string> = {
  first: '선두',
  last: '후미',
  strongest: '강한 적',
  closest: '가까운 적',
}

export type GamePhase = 'prep' | 'wave' | 'victory' | 'defeat'
