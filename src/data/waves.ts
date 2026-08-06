/**
 * 웨이브의 타입과 공용 헬퍼.
 *
 * 실제 웨이브 내용은 스테이지마다 다르므로 `stages.ts`가 소유한다.
 * 여기에는 "웨이브란 무엇인가"만 둔다.
 */
export interface SpawnGroup {
  /** ENEMY_DEFS의 키 */
  enemy: string
  count: number
  /** 개체 간 스폰 간격 (초) */
  interval: number
  /** 웨이브 시작 후 이 그룹이 스폰을 시작하기까지의 지연 (초) */
  delay: number
  /** 어느 경로로 나오는가 (LevelDef.routes 인덱스). 기본 0 */
  route: number
}

export interface WaveDef {
  /** 1부터 시작하는 웨이브 번호 */
  id: number
  groups: SpawnGroup[]
  /** 웨이브 클리어 보상 골드 */
  reward: number
  /** 이 웨이브가 자동 시작되기까지의 준비 시간 (초) */
  prepTime: number
  /** 상단에 표시할 경고 문구 (새 위협이 등장하는 웨이브) */
  warning?: string
}

/** 스폰 그룹 축약 생성자. */
export function g(
  enemy: string,
  count: number,
  interval = 0.8,
  delay = 0,
  route = 0,
): SpawnGroup {
  return { enemy, count, interval, delay, route }
}

/** 준비 시간을 남기고 조기 소환하면 남은 1초당 이만큼 골드를 더 준다. */
export const EARLY_CALL_GOLD_PER_SECOND = 2
