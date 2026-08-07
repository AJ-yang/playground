import type { DamageType } from '../game/types'

/**
 * 기물 정의 (밸런스 데이터).
 *
 * **타워를 짓는 게 아니라 병(兵)·기(器)·책(柵)을 배치한다.** 아홉 종이 세 갈래로
 * 나뉘고, 발밑 처리와 이름이 그 갈래를 따른다.
 *
 *   병(兵) 사람이 땅을 딛고 선다 — 사수 · 살수 · 포수 · 별파진 · 기고
 *   기(器) 거치하거나 수레에 얹는다 — 총통 · 화차 · 불랑기
 *   책(柵) 땅에 깐다 — 거마작
 *
 * 이름은 삼수병(三手兵)에서 왔다. 임진왜란 중 설치된 훈련도감이 포수(砲手,
 * 조총)·사수(射手, 활)·살수(殺手, 창검) 삼수로 편성됐고, 이 게임의 기본 셋이
 * 정확히 그것이다.
 *
 * 설계 의도 — 아홉 기물은 각자 명확한 "못 하는 것"을 갖는다.
 *   사수     싸고 빠르지만 갑주 앞에서 무력
 *   살수     값싼 광역이지만 **갑주와 산개 둘 다에 깎인다** (유일)
 *   포수     사거리가 압도적이고 산개를 무시하지만 갑주에 깎이고 느리다
 *   총통     갑주를 무시하지만 느리고 비싸며 산개에 막힘
 *   화차     광역 최강이지만 기병을 못 때리고 발사가 매우 느림
 *   불랑기   기병까지 닿는 광역이지만 반경이 좁고 비싸며 산개에 막힌다
 *   거마작   딜은 거의 없고 보병 감속도 미지근하지만, 기마는 여기서 사실상 멈춘다
 *   별파진   순수 지속 피해라 무엇에게든 통하지만 중첩되지 않는다
 *   기고     딜이 0이고, 주변에 기물이 없으면 아예 아무것도 하지 않는다
 * 어느 하나만 도배해서는 마지막 스테이지를 넘길 수 없도록 수치를 잡았다.
 *
 * **광역 셋(살수·화차·불랑기)과 단일 둘(사수·포수)이 서로를 대체하지 않도록**
 * 축을 하나씩 어긋나게 뒀다 — 살수는 가장 싸고 가장 짧고 방어에 가장 약하고,
 * 화차는 싸고 크지만 보병 전용, 불랑기는 비싸고 좁지만 전천후.
 * 사수는 싸고 짧고 저뎀, 포수는 비싸고 길고 고뎀.
 *
 * **곱셈 축은 두 방향이다** — 거마작은 적을 느리게, 기고는 아군을 빠르게.
 * 배치 판단이 정반대라 서로를 대체하지 않는다: 거마작은 경로 앞쪽에, 기고는
 * 기물이 밀집한 곳에 놓아야 값을 한다.
 */
export interface TowerLevelDef {
  /** 이 레벨로 올리는 데 드는 비용 (레벨 1은 최초 건설 비용) */
  cost: number
  damage: number
  /** 사거리 (타일) */
  range: number
  /** 초당 발사 횟수 */
  fireRate: number
  /** 투사체 속도 (타일/초). 0이면 즉시 명중 */
  projectileSpeed: number
  /** 폭발 반경 (타일). 0이면 단일 대상 */
  splashRadius: number
  /** 감속 배율 (0이면 감속 없음, 0.5면 속도가 50%로 떨어짐) */
  slowAmount: number
  /** 감속 지속 시간 (초) */
  slowDuration: number
  /**
   * 기마 유닛에게 추가로 얹히는 감속량. `slowAmount + 이 값`이 상한 0.95로 잘려 적용된다.
   *
   * 거마작(拒馬柵)은 이름 그대로 **말을 막는** 물건이다 — 통나무에 창을 꽂아
   * 기병의 돌격선을 끊는 장애물이지, 보병을 상대로 쓰는 것이 아니었다.
   * 보병에게도 기병에게도 똑같이 듣는 균일 감속은 그 점에서 고증에도 어긋나고,
   * 게임에서도 "언제 짓는 물건인가"라는 답을 흐리게 만든다.
   */
  cavalrySlow: number
  /** 중독 초당 피해 (순수 데미지). 0이면 중독 없음 */
  poisonDps: number
  /** 중독 지속 시간 (초) */
  poisonDuration: number
  /**
   * 지휘 오라 — 반경 안 **아군 기물**의 공격속도를 이 비율만큼 올린다.
   * 0.18이면 +18%. 0이면 오라 없음 (기고 전용).
   *
   * 감속·중독과 같은 규칙으로 **중첩되지 않는다** — 겹쳐도 가장 강한 하나만
   * 적용한다. 기고끼리는 서로를 지휘하지 않아 자기 증폭 고리가 생기지 않는다.
   */
  auraFireRate: number
  /** 지휘가 닿는 반경 (타일). auraFireRate가 0이면 의미 없다. */
  auraRange: number
}

export interface TowerDef {
  id: string
  name: string
  damageType: DamageType
  /** 기마 유닛을 타겟팅할 수 있는가 */
  targetsAir: boolean
  color: string
  accent: string
  /** 아이콘 형태 — 렌더러가 절차적으로 그린다 */
  shape: 'arrow' | 'orb' | 'cannon' | 'crystal' | 'flask' | 'musket' | 'mortar' | 'blade' | 'banner'
  /** 병(兵)·기(器)·책(柵) — 발밑 처리와 목록 묶음이 이걸 따른다 */
  kind: 'soldier' | 'engine' | 'barrier'
  tagline: string
  desc: string
  levels: [TowerLevelDef, TowerLevelDef, TowerLevelDef]
}

function lvl(partial: Partial<TowerLevelDef> & Pick<TowerLevelDef, 'cost' | 'damage' | 'range' | 'fireRate'>): TowerLevelDef {
  return {
    projectileSpeed: 14,
    splashRadius: 0,
    slowAmount: 0,
    slowDuration: 0,
    cavalrySlow: 0,
    poisonDps: 0,
    poisonDuration: 0,
    auraFireRate: 0,
    auraRange: 0,
    ...partial,
  }
}

export const TOWER_DEFS: Record<string, TowerDef> = {
  archer: {
    id: 'archer',
    name: '사수',
    kind: 'soldier',
    damageType: 'physical',
    targetsAir: true,
    color: '#b3423c',
    accent: '#dcc38a',
    shape: 'arrow',
    tagline: '각궁과 편전 — 조선의 주력',
    desc: '각궁과 편전. 골드 대비 화력이 가장 좋지만 화살은 갑주 앞에서 힘을 잃는다 — 조선의 주력이자 조선의 한계였다.',
    levels: [
      lvl({ cost: 70, damage: 10, range: 3.2, fireRate: 1.9, projectileSpeed: 18 }),
      lvl({ cost: 60, damage: 16, range: 3.6, fireRate: 2.3, projectileSpeed: 18 }),
      lvl({ cost: 115, damage: 24, range: 4.0, fireRate: 2.7, projectileSpeed: 20 }),
    ],
  },
  /**
   * 살수(殺手) — 삼수병의 셋 중 붙어서 싸우는 쪽.
   *
   * 환도와 등패(藤牌, 등나무 방패). 낭선·장창으로 기병의 돌격을 끊는 것도
   * 살수의 일이라 **기마에도 닿는다** — 화차(보병 전용)와 갈라지는 지점이다.
   *
   * 피해가 **백병**이라 갑주와 산개 둘 다에 깎인다. 이 게임에서 두 방어에
   * 동시에 지는 유일한 유형이고, 값싼 광역에 붙는 대가다. 사거리 1.9는 전
   * 기물 최단 — 이 게임에서 커버리지는 DPS보다 강하다는 걸 조총 실험에서
   * 이미 확인했으므로(사거리 5.5를 줬더니 혼자 최종 판을 깼다), 값싼 광역을
   * 누르는 자리는 데미지가 아니라 사거리다.
   */
  sword: {
    id: 'sword',
    name: '살수',
    kind: 'soldier',
    damageType: 'melee',
    targetsAir: true,
    color: '#5d6b8a',
    accent: '#c2703c',
    shape: 'blade',
    tagline: '환도와 등패 — 붙어서 벤다',
    desc: '붙어야 닿지만 한 번에 여럿을 벤다. 갑옷은 칼을 튕겨 내고 흩어져 달리는 적은 애초에 붙잡히지 않아, 방어를 갖춘 것들 앞에서는 거의 무력하다 — 맨몸 물량을 쓸어버리는 자리다.',
    levels: [
      lvl({ cost: 80, damage: 22, range: 1.9, fireRate: 0.75, projectileSpeed: 36, splashRadius: 0.85 }),
      lvl({ cost: 70, damage: 36, range: 2.1, fireRate: 0.8, projectileSpeed: 36, splashRadius: 1.0 }),
      lvl({ cost: 135, damage: 56, range: 2.3, fireRate: 0.85, projectileSpeed: 38, splashRadius: 1.2 }),
    ],
  },
  mage: {
    id: 'mage',
    name: '총통',
    kind: 'engine',
    damageType: 'magic',
    targetsAir: true,
    color: '#4e545f',
    accent: '#c9a227',
    shape: 'orb',
    tagline: '화약 — 갑주가 소용없다',
    desc: '화약은 두께로 막히지 않는다. 갑병·철기의 해답이지만, 흩어져 달리는 것들 앞에서는 반대로 무력하다.',
    levels: [
      lvl({ cost: 110, damage: 32, range: 3.0, fireRate: 0.85, projectileSpeed: 13 }),
      lvl({ cost: 100, damage: 55, range: 3.3, fireRate: 0.95, projectileSpeed: 13 }),
      lvl({ cost: 185, damage: 94, range: 3.6, fireRate: 1.05, projectileSpeed: 15 }),
    ],
  },
  cannon: {
    id: 'cannon',
    name: '화차',
    kind: 'engine',
    damageType: 'physical',
    targetsAir: false,
    color: '#7a5a3a',
    accent: '#e0a63a',
    shape: 'cannon',
    tagline: '신기전 백 발 (보병 전용)',
    desc: '신기전 백 발을 한 번에 쏜다. 뭉친 보병을 통째로 정리하지만, 고정 거치식이라 달리는 기병은 조준조차 못 한다.',
    levels: [
      lvl({ cost: 130, damage: 28, range: 3.4, fireRate: 0.55, projectileSpeed: 9, splashRadius: 1.1 }),
      lvl({ cost: 120, damage: 47, range: 3.6, fireRate: 0.6, projectileSpeed: 9, splashRadius: 1.3 }),
      lvl({ cost: 205, damage: 78, range: 3.9, fireRate: 0.65, projectileSpeed: 10, splashRadius: 1.6 }),
    ],
  },
  frost: {
    id: 'frost',
    name: '거마작',
    kind: 'barrier',
    damageType: 'magic',
    targetsAir: true,
    color: '#9c7852',
    accent: '#c8cfd8',
    shape: 'crystal',
    tagline: '말을 막는 물건 — 기마가 멈춘다',
    desc: '통나무에 창을 꽂은 방책과 마름쇠. 죽이지는 못하고 잠깐 늦출 뿐이지만, 그 몇 초가 뒤쪽 기물의 사격 기회를 늘린다. 기마에게는 훨씬 깊게 걸린다 — 거마작은 애초에 말을 막으라고 만든 물건이다.',
    levels: [
      // 딜 3/5/8이었을 때 **거마작 몰빵이 정묘호란을 30% 클리어했다.** 광역
      // 1.55칸에 초당 1.2발이면 딸린 딜만으로도 16웨이브를 버틴다는 뜻이다.
      // "딜은 거의 없다"가 정체성이므로 여기를 깎는 것이 맞다.
      //
      // **깎아야 할 것은 세기지 지속이 아니다.** 처음엔 지속도 3.4초까지 같이
      // 줄였는데, 그러자 정묘호란에서 거마작이 들어간 빌드만 전부 0%가 되고
      // 없는 빌드는 92~100%가 됐다 — "지을수록 진다"가 되돌아온 것이다.
      //
      // 이 파일 위쪽과 GDD에 이미 적혀 있던 규칙을 스스로 어긴 것이었다:
      // 지속이 짧으면 적이 거마작 사거리를 벗어나는 순간 감속이 풀려 **뒤쪽
      // 기물이 아무 이득을 못 본다.** 감속은 지나간 뒤에도 남아야 곱셈이 된다.
      // 지속은 되돌리고 세기만 낮췄다.
      lvl({ cost: 75, damage: 2, range: 3.2, fireRate: 1.0, projectileSpeed: 16, splashRadius: 1.1, slowAmount: 0.18, slowDuration: 4.0, cavalrySlow: 0.10 }),
      lvl({ cost: 70, damage: 3, range: 3.5, fireRate: 1.1, projectileSpeed: 16, splashRadius: 1.3, slowAmount: 0.23, slowDuration: 4.8, cavalrySlow: 0.12 }),
      lvl({ cost: 125, damage: 5, range: 3.8, fireRate: 1.2, projectileSpeed: 18, splashRadius: 1.55, slowAmount: 0.28, slowDuration: 5.6, cavalrySlow: 0.18 }),
    ],
  },
  venom: {
    id: 'venom',
    name: '별파진',
    kind: 'soldier',
    damageType: 'pure',
    targetsAir: true,
    color: '#2e333c',
    accent: '#e8843a',
    shape: 'flask',
    tagline: '비격진천뢰 — 무엇에게든 박힌다',
    desc: '대완구로 비격진천뢰를 쏘아 보내는 화약 전문 병종. 터진 뒤 몸에 박힌 쇳조각이 계속 상처를 낸다. 갑주도 산개도 소용없는 순수 피해라 양면 저항의 해답이지만, 상처는 중첩되지 않아 여러 기를 두어도 소용없다.',
    levels: [
      lvl({ cost: 100, damage: 4, range: 3.0, fireRate: 0.9, projectileSpeed: 12, poisonDps: 9, poisonDuration: 3.0 }),
      lvl({ cost: 95, damage: 6, range: 3.2, fireRate: 0.95, projectileSpeed: 12, poisonDps: 16, poisonDuration: 3.5 }),
      lvl({ cost: 170, damage: 9, range: 3.5, fireRate: 1.0, projectileSpeed: 14, poisonDps: 28, poisonDuration: 4.0 }),
    ],
  },
  /**
   * 조총 — 왜군에게 당하고 빼앗아 쓴 무기.
   *
   * 사거리가 각궁보다 길고 관통력이 압도적이다. 관통 피해라 갑주에 깎이지만
   * **산개와는 아무 상관이 없다** — 화약이 통하지 않는 것들의 답이 여기 있다.
   * 대신 장전이 느리고 비싸서 물량 앞에서는 값을 못 한다.
   */
  musket: {
    id: 'musket',
    name: '포수',
    kind: 'soldier',
    damageType: 'physical',
    targetsAir: true,
    color: '#3f4652',
    accent: '#b8863c',
    shape: 'musket',
    tagline: '가장 멀리서 한 발씩',
    desc: '사거리가 압도적이라 다른 기물이 닿지 못하는 곳을 때린다. 관통 피해라 흩어져 달리는 것들에게도 그대로 박히지만, 장전이 느려 물량 앞에서는 값을 못 한다.',
    levels: [
      // 사거리를 5.5까지 줬더니 **포수 몰빵이 최종 스테이지를 클리어했다.**
      // DPS는 사수보다 낮은데도 사거리가 넓어 14기가 거의 모든 구간을 덮어 버린
      // 탓이다 — 커버리지는 DPS보다 강하다. 4.7까지 낮추고 데미지도 깎았다.
      //
      // 그런데 그렇게 깎고 나니 **정체성이 거짓말이 됐다.** 골드당 유효 DPS를
      // 재 보니 갑주 18짜리 철기 상대로 사수 66.1 / 포수 64.2로, "갑주에 강한
      // 관통"이라던 기물이 정작 갑주 앞에서도 사수한테 졌다. 둘 다 관통이라
      // 축이 통째로 겹쳐 있었던 것이다. 한 발의 무게를 올려 갈랐다 —
      // 맨몸에는 여전히 사수가 두 배 넘게 낫고, 갑주 18부터 포수가 앞선다.
      // 한 발의 무게를 62까지 올렸더니 이번엔 **포수 몰빵이 병자호란을 100%
      // (생명 15.6) 클리어했다.** 관통이라 산개 80%를 통째로 무시하는데 사거리
      // 4.7이 거의 모든 구간을 덮은 탓이다 — 여기서도 커버리지가 범인이었다.
      // 데미지가 아니라 **사거리**를 깎았다. 4.3이면 여전히 전 기물 최장이지만
      // (사수 4.0) 혼자 판을 덮지는 못한다.
      lvl({ cost: 125, damage: 29, range: 3.9, fireRate: 0.72, projectileSpeed: 30 }),
      lvl({ cost: 110, damage: 41, range: 4.1, fireRate: 0.82, projectileSpeed: 30 }),
      lvl({ cost: 195, damage: 50, range: 4.3, fireRate: 0.92, projectileSpeed: 32 }),
    ],
  },
  banner: {
    id: 'banner',
    name: '기고',
    kind: 'soldier',
    damageType: 'pure',
    targetsAir: true,
    color: '#8d3b3b',
    accent: '#e6c765',
    shape: 'banner',
    tagline: '북과 깃발 — 아군이 빨라진다',
    desc: '북을 쳐 전진을 알리고 깃발로 신호를 보낸다. 스스로는 한 명도 죽이지 못하지만, 지휘가 닿는 범위 안의 기물이 더 빨리 쏜다. 여럿을 겹쳐 놓아도 가장 센 하나만 듣고, 기고끼리는 서로를 지휘하지 않는다.',
    levels: [
      lvl({ cost: 90, damage: 0, range: 0.1, fireRate: 0.1, auraFireRate: 0.18, auraRange: 2.6 }),
      lvl({ cost: 80, damage: 0, range: 0.1, fireRate: 0.1, auraFireRate: 0.26, auraRange: 2.9 }),
      lvl({ cost: 145, damage: 0, range: 0.1, fireRate: 0.1, auraFireRate: 0.35, auraRange: 3.2 }),
    ],
  },
}

/**
 * 배치 목록에 노출되는 순서. 단축키 1~8과 대응하고, **화면의 묶음과 순서가
 * 정확히 같다** — 목록에서 병(兵)·기(器)·책(柵)이 머리글로 갈라져 보이므로
 * 순서가 어긋나면 숫자키와 눈이 따로 논다.
 *
 * 갈래 안에서는 역할 순이다 — 단일(사수) → 근접 광역(살수) → 장거리 단일(포수)
 * → 지속(별파진) → 지휘(기고).
 */
export const TOWER_ORDER: readonly string[] = [
  // 병(兵)
  'archer',
  'sword',
  'musket',
  'venom',
  'banner',
  // 기(器)
  'mage',
  'cannon',
  // 책(柵)
  'frost',
]

/** 병(兵)·기(器)·책(柵) 분류 라벨. */
export const TOWER_KIND_LABEL: Record<TowerDef['kind'], string> = {
  soldier: '병',
  engine: '기',
  barrier: '책',
}

/** 배치 목록 머리글에 붙는 한 줄 설명 — 한자만으로는 무엇인지 안 읽힌다. */
export const TOWER_KIND_DESC: Record<TowerDef['kind'], string> = {
  soldier: '사람이 선다',
  engine: '거치하고 쏜다',
  barrier: '땅에 깐다',
}

/**
 * 감속 상한. 완전 정지는 적을 사거리 밖에 영원히 세워두는 퇴행 전략을 만든다.
 *
 * 0.95였을 때 **기마가 속도 5%로 사실상 얼어붙었다.** 지속 7초에 초당 1.2발이면
 * 한 번 걸린 기병은 영영 풀리지 않아, 거마작 한 기가 판 하나를 통째로 쉽게
 * 만들었다 — 게임이 너무 쉽다는 지적의 실체가 이것이었다.
 *
 * 0.65면 여전히 결정적이지만(기마가 35% 속도로 기어간다) 지나가기는 한다.
 * 감속은 **다른 기물의 사격 기회를 늘리는 곱셈**이어야지, 그 자체로 답이 되면
 * 조합을 고를 이유가 사라진다.
 */
export const MAX_SLOW = 0.48

/** 철수 시 지금까지 투자한 골드의 몇 %를 돌려받는가. */
export const SELL_REFUND_RATIO = 0.7

export function getTowerDef(id: string): TowerDef {
  const found = TOWER_DEFS[id]
  if (!found) throw new Error(`알 수 없는 기물 ID: ${id}`)
  return found
}

/** 레벨 1(=배치) 비용. */
export function buildCost(id: string): number {
  return getTowerDef(id).levels[0].cost
}
