import type { DamageType } from '../game/types'

/**
 * 타워 정의 (밸런스 데이터).
 *
 * 설계 의도 — 4개 타워는 각자 명확한 "못 하는 것"을 갖는다.
 *   궁수대: 싸고 빠르지만 갑주 앞에서 무력
 *   총통: 갑주를 무시하지만 느리고 비싸며 산개에 막힘
 *   화차: 광역 최강이지만 기병을 못 때리고 발사가 매우 느림
 *   금줄 솟대: 딜은 거의 없지만 광역 감속으로 다른 타워의 DPS를 끌어올림
 * 어느 하나만 도배해서는 20웨이브를 넘길 수 없도록 수치를 잡았다.
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
  shape: 'arrow' | 'orb' | 'cannon' | 'crystal' | 'flask'
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
    tagline: '통나무와 마름쇠로 발을 묶는다',
    desc: '통나무 방책과 마름쇠. 직접 죽이지는 못하지만 발을 묶는다. 다른 기물의 사거리 안에 적을 오래 붙잡아 두는 곱셈 축.',
    levels: [
      lvl({ cost: 75, damage: 3, range: 3.2, fireRate: 1.0, projectileSpeed: 16, splashRadius: 1.1, slowAmount: 0.55, slowDuration: 4.0 }),
      lvl({ cost: 70, damage: 5, range: 3.5, fireRate: 1.1, projectileSpeed: 16, splashRadius: 1.3, slowAmount: 0.68, slowDuration: 5.5 }),
      lvl({ cost: 125, damage: 8, range: 3.8, fireRate: 1.2, projectileSpeed: 18, splashRadius: 1.55, slowAmount: 0.78, slowDuration: 7.0 }),
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
}

/** 건설 메뉴에 노출되는 순서. 단축키 1~5와 대응한다. */
export const TOWER_ORDER: readonly string[] = ['archer', 'mage', 'cannon', 'frost', 'venom']

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
