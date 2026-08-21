import type { Vec2 } from '../core/vec2'
import type { NeutralKind } from '../data/neutrals'
import type { TileDef } from '../data/fjord'
import type { UnitKind } from '../data/units'

/** 0·1은 플레이어, 2는 중립 수비대. 중립도 유닛으로 다루면 전투 코드가 하나로 끝난다. */
export type Side = 0 | 1
export const NEUTRAL = 2 as const
export type Faction = Side | typeof NEUTRAL

/** 소유주 없음. */
export const NOBODY = -1 as const
export type Owner = Side | typeof NOBODY

export interface Unit {
  id: number
  faction: Faction
  kind: UnitKind
  pos: Vec2
  hp: number
  maxHp: number
  /** 지금 서 있는 칸. 매 틱 갱신된다. */
  tile: number
  /** 남은 이동 경유지. 다리를 지나야 하므로 직선이 아니다. */
  path: Vec2[]
  /** 경유지의 최종 목적지 칸. -1이면 목적지 없음. */
  destTile: number
  /** 이번 틱에 지휘 반경 안에 있었는가 (GDD 3.1). */
  commanded: boolean
  /** 반경 밖 유닛이 스스로 판단을 다시 하기까지 남은 시간. 즉각 반응하지
   *  않는다는 것이 "자율 행동"의 실제 의미다. */
  thinkIn: number
  /** 중립 수비대는 자기 칸을 떠나지 않는다. */
  anchorTile: number
  facing: number
}

export interface Avatar {
  side: Side
  pos: Vec2
  /** 1인칭 시선. 부감에서도 몸이 이쪽을 본다. */
  yaw: number
  /** 부감에서 내린 이동 명령의 목적지. 직접 몰 때는 null. */
  moveTarget: Vec2 | null
  /** 이 아바타를 지금 1인칭으로 몰고 있는가 (GDD 3.2). */
  driving: boolean
}

export interface NeutralCamp {
  tile: number
  kind: NeutralKind
  /** 살아 있는 수비대의 유닛 id. 비면 캠프가 뚫린 것이다. */
  guards: number[]
  cleared: boolean
  /** 마지막으로 피해를 입힌 진영. 보상은 여기로 간다. */
  lastDamager: Owner
}

export interface Tile {
  def: TileDef
  /** 점유도. +1이면 완전히 0번, -1이면 완전히 1번의 땅이다. */
  hold: number
  owner: Owner
  neutral: NeutralCamp | null
  /** 무너진 돌성채를 점령해 세운 전초. 시야가 넓어진다. */
  outpost: boolean
  /** 한 번이라도 본 적 있는가 (진영별). 지형은 기억하지만 유닛은 못 본다. */
  seen: [boolean, boolean]
}

export interface QueueItem {
  kind: UnitKind
  remain: number
}

export interface PlayerState {
  side: Side
  silver: number
  queue: QueueItem[]
  /** 부대에게 준 집결 지점. 반경 안 유닛은 정확히, 밖 유닛은 대충 따른다. */
  rally: Vec2
  rallyTile: number
  avatar: Avatar
  keepHp: number
  keepTile: number
}

export type Phase = 'playing' | 'over'

export interface EndState {
  winner: Side
  reason: 'keep'
}

/** 관찰 지표 (GDD 6.5). 합격 판정이 곧 이 숫자들이다. */
export interface Telemetry {
  /** 강림 횟수. 0이면 첫 번째 불합격. */
  descents: number
  /** 1인칭으로 보낸 총 시간. */
  timeInFirstPerson: number
  /** 마지막으로 강림한 시각. */
  lastDescentAt: number
  elapsed: number
}
