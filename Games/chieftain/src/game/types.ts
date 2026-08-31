import type { Vec2 } from '../core/vec2'
import type { NeutralKind } from '../data/neutrals'
import type { RegionDef } from '../data/land'
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
  /**
   * 이번 틱에 지휘 반경 안에 있었는가 (GDD 3.1).
   *
   * 이제 이것은 **명령을 듣느냐**가 아니라 **보너스를 받느냐**다. 신이 판 위에
   * 없는 동안에는 아무도 반경 안에 있지 않다.
   */
  commanded: boolean
  /**
   * 직접 명령을 받았는가.
   *
   * 자율 판단(`autonomy`)이 이 유닛을 안 건드린다. 예전에는 반경 밖 유닛이
   * 명령을 대충 들었지만, 신이 부감에서 사라진 지금 그러면 **아무도 명령을
   * 안 듣는 게임**이 된다. 명령은 늘 정확히 듣고, 반경은 세기만 올린다.
   */
  ordered: boolean
  /** 반경 밖 유닛이 스스로 판단을 다시 하기까지 남은 시간. 즉각 반응하지
   *  않는다는 것이 "자율 행동"의 실제 의미다. */
  thinkIn: number
  /** 중립 수비대는 자기 칸을 떠나지 않는다. */
  anchorTile: number
  facing: number

  // ── 전투 (아래 넷은 전부 "지금 무슨 일이 일어나는지"를 보이게 하는 값이다)

  /** 다음 타격까지 남은 시간. 끊어 쳐야 전투에 리듬이 생긴다. */
  swingIn: number
  /** 내지르는 연출. 1에서 0으로 줄며 몸이 앞으로 나갔다 돌아온다. */
  lunge: number
  /** 맞은 직후. 1에서 0으로 줄며 몸이 하얗게 번쩍인다. */
  flash: number
  /** 방패벽이 실제로 막아낸 순간. 반경 안 방패병만 켜진다 — **이 빛이
   *  지휘 반경의 값어치를 화면에 증명하는 유일한 장치다**(GDD 3.1). */
  guard: number
  /** 이번 틱에 사거리 안의 무언가를 치고 있었는가.
   *
   *  `swingIn`은 교전 중일 때만 줄어들기 때문에, 이 깃발이 없으면 "다음
   *  타격까지 남은 시간"이 걷는 중인 유닛에게도 작은 값으로 남아 있어서
   *  예비 동작이 아무 때나 터진다. 방패를 들지 말지도 여기서 갈린다. */
  fighting: boolean
  /** 집중 공격 대상. 반경 안 유닛만 따른다. -1이면 알아서 고른다. */
  focusId: number
}

/**
 * 타격 자국과 시신. **판정에 관여하지 않는 순수한 흔적**이다.
 *
 * `Game`이 들고 있는 이유는 렌더러가 프레임을 건너뛰어도 놓치지 않게 하기
 * 위해서다. 타격은 한 순간의 사건이라 그 프레임에 렌더러가 안 보면 사라진다.
 */
export interface Hit {
  pos: Vec2
  /** 남은 수명 0~1. */
  life: number
  /** 큰 타격(반경 안 도끼병 등)이면 크게 튄다. */
  big: boolean
  /** 막아낸 타격이면 색이 다르다. */
  guarded: boolean
}

export interface Corpse {
  pos: Vec2
  facing: number
  kind: UnitKind
  faction: Faction
  /** 1에서 0으로. 쓰러지며 가라앉는다. */
  life: number
}

/**
 * 건물 (전진 기지).
 *
 * 본진은 `PlayerState.keepHp`가 따로 들고 있고, 여기 있는 것은 플레이어가
 * 판 위에 **직접 세우는 것**뿐이다. 세우려면 아바타가 그 칸에 서 있어야
 * 한다 — 생산을 아바타의 위치에 묶는 것이, 건물을 그냥 RTS 부품으로
 * 두지 않고 이 게임의 규칙 안으로 끌어들이는 방법이다(GDD 3.1).
 */
export interface Building {
  id: number
  side: Side
  tile: number
  pos: Vec2
  hp: number
  maxHp: number
  /** 다 지어질 때까지 남은 초. 0이면 완성. */
  raising: number
}

/**
 * 강림한 신 (GDD 3.2).
 *
 * **평소에는 판 위에 없다.** 부감에서 나는 세계 안의 기물이 아니라 밖에서
 * 내려다보는 존재이고, 강림하는 순간에만 몸을 얻는다. 그래서 `pos`는 "지금
 * 서 있는 곳"이 아니라 "마지막으로 서 있던 곳"일 수 있다 — 몸이 있는지는
 * `embodied`만 말한다.
 */
export interface Avatar {
  side: Side
  pos: Vec2
  /** 1인칭 시선. */
  yaw: number
  /**
   * 지금 판 위에 몸이 있는가.
   *
   * 이 한 값이 지휘 반경의 존재 여부다. 꺼져 있으면 반경도 없고, 아바타의
   * 시야도 없고, 화면에도 안 그려진다.
   */
  embodied: boolean
  /**
   * 다음 강림까지 남은 시간.
   *
   * 강림이 순간이동이 된 뒤로 필요해진 값이다. 내려갔다 즉시 올라와 다른 곳에
   * 다시 내려가면 반경을 공짜로 맵 반대편에 옮길 수 있는데, 그러면 "여기가
   * 결전지다"라는 결정이 사라진다. 신은 자주 내려오지 않는다.
   */
  descendIn: number
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
  def: RegionDef
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
  /** 집중 공격 대상. 반경 안 부대가 이놈부터 친다. */
  focusId: number
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
