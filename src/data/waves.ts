/**
 * 웨이브 구성 (밸런스 데이터).
 *
 * 난이도 곡선 설계 — 5웨이브 단위로 "새 위협"을 하나씩 도입한다.
 *   1~5   기본기: 물량과 속도. 궁수탑만으로 넘길 수 있다.
 *   6~10  방어 도입: 장갑(마법탑 요구), 마법저항(물리 요구), 공중(대포 무력화).
 *   11~15 복합: 서로 상성이 반대인 적을 같은 웨이브에 섞어 단일 빌드를 응징한다.
 *   16~20 총력전: 물량 + 저항 + 공중 동시 압박, 마지막에 보스.
 */
export interface SpawnGroup {
  /** ENEMY_DEFS의 키 */
  enemy: string
  count: number
  /** 개체 간 스폰 간격 (초) */
  interval: number
  /** 웨이브 시작 후 이 그룹이 스폰을 시작하기까지의 지연 (초) */
  delay: number
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

function g(enemy: string, count: number, interval = 0.8, delay = 0): SpawnGroup {
  return { enemy, count, interval, delay }
}

export const WAVES: WaveDef[] = [
  { id: 1, prepTime: 20, reward: 40, groups: [g('grunt', 8, 0.9)] },
  { id: 2, prepTime: 14, reward: 45, groups: [g('grunt', 12, 0.75)] },
  {
    id: 3,
    prepTime: 14,
    reward: 50,
    warning: '늑대 기수 — 매우 빠릅니다',
    groups: [g('grunt', 8, 0.7), g('runner', 6, 0.55, 5)],
  },
  {
    id: 4,
    prepTime: 16,
    reward: 60,
    warning: '강철 병사 — 물리 방어 9, 마법탑이 필요합니다',
    groups: [g('armored', 5, 1.2), g('grunt', 8, 0.6, 3)],
  },
  { id: 5, prepTime: 14, reward: 65, groups: [g('grunt', 14, 0.5), g('runner', 8, 0.5, 6)] },
  {
    id: 6,
    prepTime: 18,
    reward: 75,
    warning: '와이번 — 공중 유닛, 대포탑은 무력합니다',
    groups: [g('wyvern', 6, 0.9), g('grunt', 10, 0.5, 4)],
  },
  {
    id: 7,
    prepTime: 16,
    reward: 80,
    warning: '주술사 — 마법 저항 60%, 물리 화력이 필요합니다',
    groups: [g('shaman', 7, 0.9), g('runner', 8, 0.45, 5)],
  },
  {
    id: 8,
    prepTime: 16,
    reward: 90,
    groups: [g('armored', 8, 0.9), g('grunt', 12, 0.45, 3), g('wyvern', 4, 1.0, 8)],
  },
  {
    id: 9,
    prepTime: 16,
    reward: 100,
    groups: [g('wyvern', 8, 0.7), g('runner', 12, 0.4, 4), g('shaman', 5, 1.0, 9)],
  },
  {
    id: 10,
    prepTime: 20,
    reward: 130,
    warning: '트롤 파괴자 — 양면 저항 탱커, 뚫리면 생명 2',
    groups: [g('brute', 3, 2.0), g('grunt', 14, 0.4, 2), g('armored', 6, 0.8, 8)],
  },
  {
    id: 11,
    prepTime: 16,
    reward: 120,
    groups: [g('shaman', 10, 0.7), g('armored', 8, 0.7, 4), g('runner', 10, 0.4, 10)],
  },
  {
    id: 12,
    prepTime: 18,
    reward: 140,
    warning: '수정 감시자 — 중장갑 공중, 마법탑 외에는 답이 없습니다',
    groups: [g('sentinel', 5, 1.3), g('wyvern', 8, 0.6, 4), g('grunt', 12, 0.4, 8)],
  },
  {
    id: 13,
    prepTime: 16,
    reward: 145,
    warning: '대규모 돌격 — 감속이 없으면 그대로 지나갑니다',
    groups: [g('runner', 22, 0.3), g('grunt', 16, 0.35, 3)],
  },
  {
    id: 14,
    prepTime: 18,
    reward: 165,
    warning: '흑마법사 — 마법 저항 75%',
    groups: [g('brute', 4, 1.8), g('warlock', 5, 1.1, 5), g('armored', 8, 0.6, 10)],
  },
  {
    id: 15,
    prepTime: 18,
    reward: 190,
    groups: [g('sentinel', 7, 1.0), g('wyvern', 12, 0.45, 4), g('shaman', 8, 0.7, 10)],
  },
  {
    id: 16,
    prepTime: 18,
    reward: 200,
    groups: [g('warlock', 8, 0.9), g('armored', 12, 0.5, 3), g('runner', 14, 0.35, 9)],
  },
  {
    id: 17,
    prepTime: 18,
    reward: 220,
    groups: [g('brute', 6, 1.5), g('shaman', 12, 0.6, 4), g('wyvern', 10, 0.5, 10)],
  },
  {
    id: 18,
    prepTime: 18,
    reward: 240,
    groups: [g('sentinel', 9, 0.9), g('warlock', 7, 1.0, 5), g('grunt', 20, 0.3, 8)],
  },
  {
    id: 19,
    prepTime: 20,
    reward: 280,
    warning: '총공세 — 마지막 정비 기회입니다',
    groups: [
      g('brute', 8, 1.3),
      g('runner', 24, 0.28, 3),
      g('wyvern', 12, 0.45, 8),
      g('warlock', 8, 0.9, 14),
    ],
  },
  {
    id: 20,
    prepTime: 25,
    reward: 500,
    warning: '마왕 그라즈 강림 — 최종 웨이브',
    groups: [
      g('brute', 5, 1.6, 0),
      g('sentinel', 8, 0.9, 6),
      g('warlock', 8, 0.9, 12),
      g('overlord', 1, 1, 18),
    ],
  },
]

/** 준비 시간을 남기고 조기 소환하면 남은 1초당 이만큼 골드를 더 준다. */
export const EARLY_CALL_GOLD_PER_SECOND = 2

export const TOTAL_WAVES = WAVES.length
