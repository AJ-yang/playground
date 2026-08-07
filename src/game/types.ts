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

/**
 * 적의 실루엣 — **형태만으로 방어 유형을 읽게 하는** 시각 언어.
 *
 * 색이 아니라 형태에 정보를 싣는 이유가 두 가지다.
 *   1. 색각 이상 사용자도 "어떤 타워로 잡아야 하는가"를 판단할 수 있어야 한다.
 *   2. 3배속에서 40마리가 몰려올 때 사람 눈은 색보다 실루엣을 먼저 읽는다.
 *
 * 그래서 실루엣은 종족이나 분위기가 아니라 **플레이어의 결정을 바꾸는 축**에
 * 대응시킨다. 공중 여부는 이 축과 직교하므로 실루엣이 아니라 날개로 표현한다.
 */
export type Silhouette =
  /** 원 — 방어 없음. 아무 타워나 통한다 */
  | 'basic'
  /** 삼각 쐐기 (진행 방향) — 고속. 감속 없이는 사거리 체류가 짧다 */
  | 'swift'
  /** 육각 — 장갑형. 물리가 깎이므로 서낭당이 필요하다 */
  | 'armored'
  /** 마름모 — 마법저항형. 부적이 깎이므로 물리 기물이 필요하다 */
  | 'warded'
  /** 방패 오각 — 양면 저항 탱커 */
  | 'bulwark'
  /** 뿔 달린 다각 — 보스 */
  | 'boss'

export const SILHOUETTE_LABEL: Record<Silhouette, string> = {
  basic: '방어 없음',
  swift: '고속',
  armored: '장갑',
  warded: '마법저항',
  bulwark: '양면 저항',
  boss: '보스',
}
