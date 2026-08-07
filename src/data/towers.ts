import type { DamageType } from '../game/types'

/**
 * 타워 정의 (밸런스 데이터).
 *
 * 설계 의도 — 일곱 기물은 각자 명확한 "못 하는 것"을 갖는다.
 *   궁수대   싸고 빠르지만 갑주 앞에서 무력
 *   총통     갑주를 무시하지만 느리고 비싸며 산개에 막힘
 *   화차     광역 최강이지만 기병을 못 때리고 발사가 매우 느림
 *   거마작   딜은 거의 없고 보병 감속도 미지근하지만, 기마는 여기서 사실상 멈춘다
 *   비격진천뢰 순수 지속 피해라 무엇에게든 통하지만 중첩되지 않는다
 *   조총     사거리가 압도적이고 산개를 무시하지만 갑주에 깎이고 느리다
 *   불랑기포 기병까지 닿는 광역이지만 반경이 좁고 비싸며 산개에 막힌다
 * 어느 하나만 도배해서는 마지막 스테이지를 넘길 수 없도록 수치를 잡았다.
 *
 * **광역 두 종(화차·불랑기포)과 단일 두 종(궁수대·조총)이 서로를 대체하지
 * 않도록** 축을 하나씩 어긋나게 뒀다 — 화차는 싸고 크지만 보병 전용, 불랑기포는
 * 비싸고 좁지만 전천후. 궁수대는 싸고 짧고 저뎀, 조총은 비싸고 길고 고뎀.
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
  shape: 'arrow' | 'orb' | 'cannon' | 'crystal' | 'flask' | 'musket' | 'mortar'
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
    ...partial,
  }
}

export const TOWER_DEFS: Record<string, TowerDef> = {
  archer: {
    id: 'archer',
    name: '궁수대',
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
  mage: {
    id: 'mage',
    name: '총통',
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
    damageType: 'magic',
    targetsAir: true,
    color: '#9c7852',
    accent: '#c8cfd8',
    shape: 'crystal',
    tagline: '말을 막는 물건 — 기마가 멈춘다',
    desc: '통나무에 창을 꽂은 방책과 마름쇠. 죽이지는 못하지만 발을 묶는다. 특히 기마에게는 감속이 훨씬 깊게 걸린다 — 거마작은 애초에 말을 막으라고 만든 물건이다.',
    levels: [
      lvl({ cost: 75, damage: 3, range: 3.2, fireRate: 1.0, projectileSpeed: 16, splashRadius: 1.1, slowAmount: 0.52, slowDuration: 4.0, cavalrySlow: 0.26 }),
      lvl({ cost: 70, damage: 5, range: 3.5, fireRate: 1.1, projectileSpeed: 16, splashRadius: 1.3, slowAmount: 0.64, slowDuration: 5.5, cavalrySlow: 0.26 }),
      lvl({ cost: 125, damage: 8, range: 3.8, fireRate: 1.2, projectileSpeed: 18, splashRadius: 1.55, slowAmount: 0.74, slowDuration: 7.0, cavalrySlow: 0.21 }),
    ],
  },
  venom: {
    id: 'venom',
    name: '비격진천뢰',
    damageType: 'pure',
    targetsAir: true,
    color: '#2e333c',
    accent: '#e8843a',
    shape: 'flask',
    tagline: '쇳조각 — 무엇에게든 박힌다',
    desc: '터지고 나서 몸에 박힌 쇳조각이 계속 상처를 낸다. 갑주도 산개도 소용없는 순수 피해라 양면 저항의 해답이지만, 상처는 중첩되지 않아 여러 기를 지어도 소용없다.',
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
    name: '조총',
    damageType: 'physical',
    targetsAir: true,
    color: '#3f4652',
    accent: '#b8863c',
    shape: 'musket',
    tagline: '가장 멀리서 한 발씩',
    desc: '사거리가 압도적이라 다른 기물이 닿지 못하는 곳을 때린다. 관통 피해라 흩어져 달리는 것들에게도 그대로 박히지만, 장전이 느려 물량 앞에서는 값을 못 한다.',
    levels: [
      // 사거리를 5.5까지 줬더니 **조총 몰빵이 최종 스테이지를 클리어했다.**
      // DPS는 궁수대보다 낮은데도 사거리가 넓어 14기가 거의 모든 구간을
      // 덮어 버린 탓이다 — 커버리지는 DPS보다 강하다. 5.0으로 낮추고
      // 데미지도 함께 깎았다. 그러고도 최종 스테이지를 혼자 클리어해서 한 번 더
      // 조였다 — 사거리 4.7 / L3 48. 갑주 22 앞에서도 26이 들어가 여전히
      // 궁수대(2)의 열세 배지만, 이제 혼자서는 판을 못 푼다.
      lvl({ cost: 125, damage: 24, range: 4.2, fireRate: 0.72, projectileSpeed: 30 }),
      lvl({ cost: 110, damage: 33, range: 4.4, fireRate: 0.82, projectileSpeed: 30 }),
      lvl({ cost: 195, damage: 48, range: 4.7, fireRate: 0.92, projectileSpeed: 32 }),
    ],
  },
  /**
   * 불랑기포 — 명을 통해 들어온 후장식 속사포.
   *
   * 자포(子砲)를 미리 장전해 두었다가 갈아 끼우므로 재장전이 빠르다. 화차와
   * 달리 **포신을 사람이 돌려 겨눌 수 있어 기병에도 닿는다.** 대신 반경이
   * 좁고 비싸다 — 화차의 상위 호환이 아니라 다른 물건이다.
   */
  culverin: {
    id: 'culverin',
    name: '불랑기포',
    damageType: 'magic',
    targetsAir: true,
    color: '#5c5346',
    accent: '#d8a03c',
    shape: 'mortar',
    tagline: '기병에게도 닿는 광역',
    desc: '자포를 갈아 끼워 쏘는 속사포. 화차와 달리 포신을 돌려 겨눌 수 있어 달리는 기병에게도 닿는다. 대신 폭발 반경이 좁고 비싸며, 화약이라 흩어진 것들에게는 반만 먹힌다.',
    levels: [
      lvl({ cost: 155, damage: 17, range: 3.2, fireRate: 0.75, projectileSpeed: 15, splashRadius: 0.75 }),
      lvl({ cost: 140, damage: 28, range: 3.5, fireRate: 0.82, projectileSpeed: 15, splashRadius: 0.88 }),
      lvl({ cost: 235, damage: 44, range: 3.8, fireRate: 0.9, projectileSpeed: 17, splashRadius: 1.05 }),
    ],
  },
}

/**
 * 건설 메뉴에 노출되는 순서. 단축키 1~7과 대응한다.
 *
 * 역할이 가까운 것끼리 붙여 둔다 — 단일(궁수대·조총) → 광역(화차·불랑기포) →
 * 서포터(거마작) → 지속(비격진천뢰). 목록에서 "무엇의 대안인가"가 보여야
 * 일곱 개를 외우지 않아도 고를 수 있다.
 */
export const TOWER_ORDER: readonly string[] = [
  'archer',
  'musket',
  'mage',
  'cannon',
  'culverin',
  'frost',
  'venom',
]

/** 타워 판매 시 지금까지 투자한 골드의 몇 %를 돌려받는가. */
export const SELL_REFUND_RATIO = 0.7

export function getTowerDef(id: string): TowerDef {
  const found = TOWER_DEFS[id]
  if (!found) throw new Error(`알 수 없는 타워 ID: ${id}`)
  return found
}

/** 레벨 1(=건설) 비용. */
export function buildCost(id: string): number {
  return getTowerDef(id).levels[0].cost
}
