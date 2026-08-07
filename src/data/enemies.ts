import type { Silhouette } from '../game/types'

/**
 * 적 정의 (밸런스 데이터).
 *
 * 설계 의도 — 적은 "어떤 타워로 잡아야 하는가"를 강제하는 장치다.
 *   armor 높음  → 물리(궁수/대포)가 약해짐 → 마법탑 필요
 *   magicResist 높음 → 마법(마법/얼음)이 약해짐 → 물리탑 필요
 *   flying      → 대포탑이 아예 못 때림
 *   speed 높음  → 얼음탑 감속 없이는 사거리 안에 머무는 시간이 부족
 * 한 종류만 도배하면 반드시 막히도록 웨이브를 섞는 것이 밸런스의 축이다.
 */
export interface EnemyDef {
  id: string
  name: string
  maxHp: number
  /** 이동 속도 (타일/초) */
  speed: number
  /** 물리 데미지 고정 감소량 */
  armor: number
  /** 마법 데미지 감소 비율 (0~0.9) */
  magicResist: number
  /** 처치 보상 골드 */
  bounty: number
  /** 완주 시 깎이는 생명 */
  leak: number
  /** 렌더링 반지름 (픽셀) */
  radius: number
  color: string
  /** 공중 유닛 여부 — 지상 전용 타워는 타겟팅하지 못한다 */
  flying: boolean
  /**
   * 실루엣 — 화면에서 방어 유형을 형태만으로 읽게 한다.
   *
   * **반드시 아래 스탯과 일치시킬 것.** 색이 아니라 형태가 정보를 나르는 구조라,
   * 여기가 어긋나면 플레이어가 화면을 보고 잘못된 타워를 짓는다.
   *   armor 지배적          → 'armored'
   *   magicResist 지배적     → 'warded'
   *   둘 다 유의미           → 'bulwark'
   *   방어 없이 speed >= 3   → 'swift'
   *   아무것도 없음          → 'basic'
   */
  silhouette: Silhouette
  /** 보스 여부 — HP 바와 이펙트를 크게 표시 */
  boss: boolean
  desc: string
}

function def(partial: Partial<EnemyDef> & Pick<EnemyDef, 'id' | 'name' | 'maxHp' | 'speed'>): EnemyDef {
  return {
    armor: 0,
    magicResist: 0,
    bounty: 13,
    leak: 1,
    radius: 11,
    color: '#8bd450',
    flying: false,
    silhouette: 'basic',
    boss: false,
    desc: '',
    ...partial,
  }
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  grunt: def({
    id: 'grunt',
    silhouette: 'basic',
    name: '고블린',
    maxHp: 60,
    speed: 2.2,
    bounty: 5,
    color: '#7cc36a',
    desc: '약점 없는 기본 보병. 물량으로 밀어붙인다.',
  }),
  runner: def({
    id: 'runner',
    silhouette: 'swift',
    name: '늑대 기수',
    maxHp: 48,
    speed: 4.2,
    bounty: 6,
    radius: 10,
    color: '#e0b341',
    desc: '매우 빠르다. 감속 없이는 사거리 안에 오래 머물지 않는다.',
  }),
  armored: def({
    id: 'armored',
    silhouette: 'armored',
    name: '강철 병사',
    maxHp: 170,
    speed: 1.8,
    armor: 12,
    bounty: 10,
    radius: 12,
    color: '#9aa7b8',
    desc: '두꺼운 갑옷. 물리 데미지를 12씩 깎는다 — 마법탑으로 녹여야 한다.',
  }),
  shaman: def({
    id: 'shaman',
    silhouette: 'warded',
    name: '주술사',
    maxHp: 140,
    speed: 2.0,
    magicResist: 0.65,
    bounty: 10,
    radius: 11,
    color: '#b884e8',
    desc: '마법 저항 65%. 궁수탑·대포탑 같은 물리 화력이 필요하다.',
  }),
  wyvern: def({
    id: 'wyvern',
    silhouette: 'swift',
    name: '와이번',
    maxHp: 120,
    speed: 3.1,
    armor: 2,
    magicResist: 0.2,
    bounty: 9,
    radius: 12,
    color: '#5fc9d8',
    flying: true,
    desc: '공중 유닛. 대포탑은 조준조차 하지 못한다.',
  }),
  brute: def({
    id: 'brute',
    silhouette: 'bulwark',
    name: '트롤 파괴자',
    maxHp: 560,
    speed: 1.4,
    armor: 8,
    magicResist: 0.3,
    bounty: 25,
    leak: 2,
    radius: 15,
    color: '#d1723f',
    desc: '물리·마법 양쪽에 저항이 있는 탱커. 뚫으면 생명을 2 깎는다.',
  }),
  warlock: def({
    id: 'warlock',
    silhouette: 'warded',
    name: '흑마법사',
    maxHp: 360,
    speed: 2.4,
    magicResist: 0.8,
    bounty: 20,
    radius: 12,
    color: '#e05a8a',
    desc: '마법 저항 80%. 후반부 마법탑 몰빵 빌드를 응징한다.',
  }),
  sentinel: def({
    id: 'sentinel',
    silhouette: 'armored',
    name: '수정 감시자',
    maxHp: 520,
    speed: 2.6,
    armor: 18,
    bounty: 23,
    radius: 13,
    color: '#7f9cf5',
    flying: true,
    desc: '중장갑 공중 유닛. 대포는 못 때리고 궁수는 긁히지도 않는다.',
  }),
  /**
   * 보스는 스테이지 중간중간에 등장한다.
   *
   * 웨이브 하나를 통째로 "물량"이 아니라 "한 덩어리"로 바꿔 리듬을 끊는 장치다.
   * 그래서 전부 leak이 크고(뚫리면 판이 기운다) 속도가 느리다 — 대응할 시간은
   * 주되 대응하지 못하면 크게 아프도록.
   *
   * **보스도 실루엣 규칙을 따른다.** 전부 'boss'(가시 다각)를 쓰되 방어 표식이
   * 스탯에서 파생되므로, 장갑 보스에는 흰 테두리가 마법저항 보스에는 보라 오라가
   * 자동으로 뜬다. 형태만 보고 "무엇으로 때려야 하는가"가 여전히 읽힌다.
   */
  goblinking: def({
    id: 'goblinking',
    silhouette: 'boss',
    name: '고블린 대왕 우르그',
    maxHp: 1250,
    speed: 1.5,
    bounty: 55,
    leak: 3,
    radius: 19,
    color: '#6fae52',
    boss: true,
    desc: '첫 보스. 방어는 없지만 덩치가 크다 — 화력이 부족하면 그냥 지나간다.',
  }),
  golem: def({
    id: 'golem',
    silhouette: 'boss',
    name: '공성 골렘 카르낙',
    maxHp: 2300,
    speed: 1.25,
    armor: 22,
    bounty: 95,
    leak: 2,
    radius: 20,
    color: '#8b93a6',
    boss: true,
    desc: '장갑 22. 물리 타워는 긁히지도 않는다 — 마법탑 없이는 절대 못 잡는다.',
  }),
  twinwyvern: def({
    id: 'twinwyvern',
    silhouette: 'boss',
    name: '쌍두 와이번 니드호그',
    maxHp: 1900,
    speed: 2.3,
    armor: 5,
    magicResist: 0.25,
    bounty: 90,
    leak: 2,
    radius: 19,
    color: '#4fb6c9',
    flying: true,
    boss: true,
    desc: '공중 보스. 대포탑은 조준조차 못 하고, 빨라서 감속 없이는 사거리에 오래 머물지 않는다.',
  }),
  hexmother: def({
    id: 'hexmother',
    silhouette: 'boss',
    name: '주술 대모 모르가',
    maxHp: 2100,
    speed: 1.8,
    magicResist: 0.78,
    bounty: 88,
    leak: 3,
    radius: 19,
    color: '#c46fd8',
    boss: true,
    desc: '마법 저항 78%. 마법탑 몰빵을 응징한다 — 궁수탑·대포탑의 물리 화력이 필요하다.',
  }),
  frostgiant: def({
    id: 'frostgiant',
    silhouette: 'boss',
    name: '서리 거인 요툰',
    maxHp: 4400,
    speed: 1.1,
    armor: 18,
    magicResist: 0.52,
    bounty: 135,
    leak: 4,
    radius: 21,
    color: '#5f86a8',
    boss: true,
    desc: '장갑과 마법 저항을 동시에 갖췄다. 한쪽 화력만으로는 시간 안에 못 녹인다 — 독의 순수 피해가 답이다.',
  }),
  overlord: def({
    id: 'overlord',
    silhouette: 'boss',
    name: '마왕 그라즈',
    maxHp: 5200,
    speed: 1.15,
    armor: 14,
    magicResist: 0.45,
    bounty: 138,
    leak: 10,
    radius: 22,
    color: '#c8332f',
    boss: true,
    desc: '최종 보스. 모든 방어를 갖췄다 — 조합과 감속 없이는 절대 못 잡는다.',
  }),
}

export function getEnemyDef(id: string): EnemyDef {
  const found = ENEMY_DEFS[id]
  if (!found) throw new Error(`알 수 없는 적 ID: ${id}`)
  return found
}
