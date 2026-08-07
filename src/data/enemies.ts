import type { Silhouette } from '../game/types'

/**
 * 적 정의 (밸런스 데이터).
 *
 * 설계 의도 — 적은 "어떤 타워로 잡아야 하는가"를 강제하는 장치다.
 *   armor 높음  → 물리(장승/징)가 약해짐 → 서낭당 필요
 *   magicResist 높음 → 마법(서낭당/솟대)이 약해짐 → 물리 기물 필요
 *   flying      → 굿청 징이 아예 못 때림
 *   speed 높음  → 금줄 솟대 감속 없이는 사거리 안에 머무는 시간이 부족
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
  /**
   * 보조색. 불꽃·갈기·소매처럼 본체색과 대비돼야 하는 부분에 쓴다.
   *
   * 처음에는 렌더러가 `accent`에 `color`를 그대로 넘겼는데, 그러면 아트의
   * `@accent` 레이어가 전부 본체와 같은 색이 되어 **디테일이 통째로 사라진다**.
   * 두억시니의 불붙은 머리카락이 뿔처럼 보였던 것이 그 증상이었다.
   */
  accent: string
  /** 기마 여부 — 화차처럼 고정 거치식인 기물은 타겟팅하지 못한다 */
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
    accent: '#c8e8a0',
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
    name: '졸병',
    maxHp: 60,
    speed: 2.2,
    bounty: 5,
    color: '#a8956f',
    accent: '#6d6353',
    desc: '홑겹 차림의 잡졸. 하나하나는 약하지만 떼로 몰려온다.',
  }),
  runner: def({
    id: 'runner',
    silhouette: 'swift',
    name: '척후',
    maxHp: 48,
    speed: 4.2,
    bounty: 6,
    radius: 10,
    color: '#7f9a6a',
    accent: '#4d5f40',
    desc: '몸을 낮추고 달리는 정찰병. 거마작으로 붙잡지 않으면 그냥 지나간다.',
  }),
  armored: def({
    id: 'armored',
    silhouette: 'armored',
    name: '갑병',
    maxHp: 170,
    speed: 1.8,
    armor: 12,
    bounty: 10,
    radius: 12,
    color: '#6f7887',
    accent: '#3c4350',
    desc: '찰갑을 두른 중보병. 미늘이 화살을 12씩 튕겨 낸다 — 총통이 필요하다.',
  }),
  shaman: def({
    id: 'shaman',
    silhouette: 'warded',
    name: '별동대',
    maxHp: 140,
    speed: 2.0,
    magicResist: 0.65,
    bounty: 10,
    radius: 11,
    color: '#8a6fb8',
    accent: '#e0d6f2',
    desc: '대열을 풀고 흩어져 달려든다. 뭉쳐 있지 않아 화약이 35%밖에 안 먹힌다.',
  }),
  wyvern: def({
    id: 'wyvern',
    silhouette: 'swift',
    name: '경기병',
    maxHp: 120,
    speed: 3.1,
    armor: 2,
    magicResist: 0.2,
    bounty: 9,
    radius: 12,
    color: '#c98a4a',
    accent: '#f0dcb4',
    flying: true,
    desc: '가볍고 빠른 기마. 화차는 방향을 못 돌려 놓친다.',
  }),
  brute: def({
    id: 'brute',
    silhouette: 'bulwark',
    name: '충차',
    maxHp: 560,
    speed: 1.4,
    armor: 8,
    magicResist: 0.3,
    bounty: 25,
    leak: 2,
    radius: 15,
    color: '#7d6547',
    accent: '#a08256',
    desc: '지붕을 덮은 공성 수레. 화살도 화약도 반쯤 흘린다 — 뚫리면 생명 2.',
  }),
  warlock: def({
    id: 'warlock',
    silhouette: 'warded',
    name: '간자',
    maxHp: 360,
    speed: 2.4,
    magicResist: 0.8,
    bounty: 20,
    radius: 12,
    color: '#3f4654',
    accent: '#8b2f3c',
    desc: '대열이라는 것 자체가 없는 정예 첩자. 화약 저항 80% — 총통 몰빵을 응징한다.',
  }),
  sentinel: def({
    id: 'sentinel',
    silhouette: 'armored',
    name: '철기',
    maxHp: 520,
    speed: 2.6,
    armor: 18,
    bounty: 23,
    radius: 13,
    color: '#8a97b5',
    accent: '#4a5470',
    flying: true,
    desc: '사람과 말이 모두 갑주를 둘렀다. 화차는 못 닿고 화살은 튕긴다.',
  }),
  /**
   * 보스는 스테이지 중간중간에 등장한다.
   *
   * 웨이브 하나를 통째로 "물량"이 아니라 "한 덩어리"로 바꿔 리듬을 끊는 장치다.
   * 그래서 전부 leak이 크고(뚫리면 판이 기운다) 속도가 느리다 — 대응할 시간은
   * 주되 대응하지 못하면 크게 아프도록.
   *
   * **보스도 실루엣 규칙을 따른다.** 전부 'boss'(가시 다각)를 쓰되 방어 표식이
   * 스탯에서 파생되므로, 갑주 보스에는 흰 테두리가 산개 보스에는 보라 오라가
   * 자동으로 뜬다. 형태만 보고 "무엇으로 때려야 하는가"가 여전히 읽힌다.
   */
  goblinking: def({
    id: 'goblinking',
    silhouette: 'boss',
    name: '왜구 두목',
    maxHp: 1250,
    speed: 1.5,
    bounty: 55,
    leak: 3,
    radius: 19,
    color: '#b8583e',
    accent: '#2f3a4a',
    boss: true,
    desc: '첫 보스. 갑옷은 없고 덩치와 기세뿐이다 — 화력이 부족하면 그냥 지나간다.',
  }),
  golem: def({
    id: 'golem',
    silhouette: 'boss',
    name: '철갑 장수',
    maxHp: 2300,
    speed: 1.25,
    armor: 22,
    bounty: 95,
    leak: 2,
    radius: 20,
    color: '#5a6070',
    accent: '#2b3038',
    boss: true,
    desc: '전신을 두꺼운 갑주로 덮었다. 갑주 22 — 총통 없이는 절대 못 잡는다.',
  }),
  twinwyvern: def({
    id: 'twinwyvern',
    silhouette: 'boss',
    name: '선봉 기병',
    maxHp: 1900,
    speed: 2.3,
    armor: 5,
    magicResist: 0.25,
    bounty: 90,
    leak: 2,
    radius: 19,
    color: '#c2703a',
    accent: '#f0d8a8',
    flying: true,
    boss: true,
    desc: '앞장서 부딪히는 돌격 기병. 빠르고, 화차가 조준하지 못한다.',
  }),
  hexmother: def({
    id: 'hexmother',
    silhouette: 'boss',
    name: '날랜 왜장',
    maxHp: 2100,
    speed: 1.8,
    magicResist: 0.78,
    bounty: 88,
    leak: 3,
    radius: 19,
    color: '#3a3038',
    accent: '#c0392f',
    boss: true,
    desc: '갑옷을 줄이고 속도를 택한 적장. 화약 저항 78% — 활과 화차가 필요하다.',
  }),
  frostgiant: def({
    id: 'frostgiant',
    silhouette: 'boss',
    name: '팔기 중군',
    maxHp: 4400,
    speed: 1.1,
    armor: 18,
    magicResist: 0.52,
    bounty: 135,
    leak: 4,
    radius: 21,
    color: '#4a5468',
    accent: '#8e2f34',
    boss: true,
    desc: '갑주와 기동을 동시에 갖춘 본대. 한쪽 화력만으로는 절대 못 녹인다 — 진천뢰가 답이다.',
  }),
  overlord: def({
    id: 'overlord',
    silhouette: 'boss',
    name: '팔기 대장',
    maxHp: 5200,
    speed: 1.15,
    armor: 14,
    magicResist: 0.45,
    bounty: 138,
    leak: 10,
    radius: 22,
    color: '#2b2f3a',
    accent: '#8a6a2a',
    boss: true,
    desc: '최종 보스. 모든 것을 어중간하게 갖춰 무엇 하나로는 안 뚫린다.',
  }),
}

export function getEnemyDef(id: string): EnemyDef {
  const found = ENEMY_DEFS[id]
  if (!found) throw new Error(`알 수 없는 적 ID: ${id}`)
  return found
}
