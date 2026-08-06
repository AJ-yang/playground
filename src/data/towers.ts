import type { DamageType } from '../game/types'

/**
 * 타워 정의 (밸런스 데이터).
 *
 * 설계 의도 — 4개 타워는 각자 명확한 "못 하는 것"을 갖는다.
 *   궁수탑: 싸고 빠르지만 장갑 앞에서 무력
 *   마법탑: 장갑을 무시하지만 느리고 비싸며 마법 저항에 막힘
 *   대포탑: 광역 최강이지만 공중을 못 때리고 발사가 매우 느림
 *   얼음탑: 딜은 거의 없지만 광역 감속으로 다른 타워의 DPS를 끌어올림
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
}

export interface TowerDef {
  id: string
  name: string
  damageType: DamageType
  /** 공중 유닛을 타겟팅할 수 있는가 */
  targetsAir: boolean
  color: string
  accent: string
  /** 아이콘 형태 — 렌더러가 절차적으로 그린다 */
  shape: 'arrow' | 'orb' | 'cannon' | 'crystal'
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
    ...partial,
  }
}

export const TOWER_DEFS: Record<string, TowerDef> = {
  archer: {
    id: 'archer',
    name: '궁수탑',
    damageType: 'physical',
    targetsAir: true,
    color: '#3f8f4f',
    accent: '#a8e6a3',
    shape: 'arrow',
    tagline: '싸고 빠른 단일 물리',
    desc: '골드 대비 DPS가 가장 좋다. 다만 물리 데미지라 장갑 앞에서는 딜이 거의 사라진다.',
    levels: [
      lvl({ cost: 70, damage: 13, range: 3.2, fireRate: 1.7, projectileSpeed: 18 }),
      lvl({ cost: 60, damage: 22, range: 3.6, fireRate: 2.0, projectileSpeed: 18 }),
      lvl({ cost: 115, damage: 36, range: 4.0, fireRate: 2.3, projectileSpeed: 20 }),
    ],
  },
  mage: {
    id: 'mage',
    name: '마법탑',
    damageType: 'magic',
    targetsAir: true,
    color: '#5b4bb5',
    accent: '#c3b6ff',
    shape: 'orb',
    tagline: '장갑을 무시하는 고데미지',
    desc: '장갑 수치를 완전히 무시한다. 강철 병사·수정 감시자의 해답이지만 마법 저항 앞에서는 반대로 무력하다.',
    levels: [
      lvl({ cost: 110, damage: 32, range: 3.0, fireRate: 0.85, projectileSpeed: 13 }),
      lvl({ cost: 100, damage: 55, range: 3.3, fireRate: 0.95, projectileSpeed: 13 }),
      lvl({ cost: 185, damage: 94, range: 3.6, fireRate: 1.05, projectileSpeed: 15 }),
    ],
  },
  cannon: {
    id: 'cannon',
    name: '대포탑',
    damageType: 'physical',
    targetsAir: false,
    color: '#8a6a3a',
    accent: '#f0c674',
    shape: 'cannon',
    tagline: '지상 전용 광역 폭격',
    desc: '뭉친 지상 물량을 한 번에 정리한다. 발사가 매우 느려 감속과 함께 써야 제값을 하고, 공중은 조준조차 못 한다.',
    levels: [
      lvl({ cost: 130, damage: 28, range: 3.4, fireRate: 0.55, projectileSpeed: 9, splashRadius: 1.1 }),
      lvl({ cost: 120, damage: 47, range: 3.6, fireRate: 0.6, projectileSpeed: 9, splashRadius: 1.3 }),
      lvl({ cost: 205, damage: 78, range: 3.9, fireRate: 0.65, projectileSpeed: 10, splashRadius: 1.6 }),
    ],
  },
  frost: {
    id: 'frost',
    name: '얼음탑',
    damageType: 'magic',
    targetsAir: true,
    color: '#2f7f96',
    accent: '#a8ecff',
    shape: 'crystal',
    tagline: '광역 감속 서포터',
    desc: '딜은 거의 없지만 범위 안의 적을 느리게 만든다. 다른 타워의 유효 사거리 체류 시간을 늘려 전체 DPS를 올리는 핵심 축.',
    levels: [
      lvl({ cost: 90, damage: 6, range: 2.8, fireRate: 1.0, projectileSpeed: 16, splashRadius: 1.0, slowAmount: 0.45, slowDuration: 1.6 }),
      lvl({ cost: 85, damage: 11, range: 3.0, fireRate: 1.1, projectileSpeed: 16, splashRadius: 1.2, slowAmount: 0.55, slowDuration: 1.9 }),
      lvl({ cost: 150, damage: 18, range: 3.3, fireRate: 1.2, projectileSpeed: 18, splashRadius: 1.45, slowAmount: 0.65, slowDuration: 2.2 }),
    ],
  },
}

/** 건설 메뉴에 노출되는 순서. 단축키 1~4와 대응한다. */
export const TOWER_ORDER: readonly string[] = ['archer', 'mage', 'cannon', 'frost']

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
