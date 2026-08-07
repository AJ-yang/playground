import type { Vec2 } from '../core/vec2'

/**
 * 맵 정의 — **기하 정보만** 담는다.
 *
 * 시작 골드·생명·웨이브 구성은 스테이지의 책임이라 `stages.ts`로 옮겼다.
 * 같은 맵을 난이도만 바꿔 재사용할 수 있어야 하기 때문이다.
 *
 * `routes`는 여러 개일 수 있다. 각 경로는 축에 평행한 구간으로만 이어져야 하고
 * (가로 또는 세로), 첫/마지막 웨이포인트는 화면 밖에 두어 적이 자연스럽게
 * 등장·퇴장하게 한다. 여러 경로가 같은 타일을 지나도 된다 — 도중에 합류하는
 * 맵은 그렇게 만든다.
 */
export interface LevelDef {
  id: string
  name: string
  cols: number
  rows: number
  /** 타일 좌표 기준 경로들. 최소 1개. */
  routes: Vec2[][]
  /** 경로가 아니지만 건설도 불가능한 장식 타일 (바위/숲 등) */
  blocked: Vec2[]
}

const COLS = 24
const ROWS = 15

function v(x: number, y: number): Vec2 {
  return { x, y }
}

/** 완만한 S자. 건설 공간이 넓어 기본기를 배우기 좋다. */
export const LEVEL_GREENVALE: LevelDef = {
  id: 'greenvale',
  name: '남해 포구',
  cols: COLS,
  rows: ROWS,
  routes: [
    [v(-1, 7), v(6, 7), v(6, 3), v(13, 3), v(13, 11), v(20, 11), v(20, 7), v(24, 7)],
  ],
  blocked: [
    v(1, 1), v(2, 1), v(1, 2),
    v(9, 8), v(9, 9), v(10, 9),
    v(16, 1), v(17, 1), v(16, 2),
    v(3, 13), v(4, 13), v(4, 14),
    v(22, 2), v(23, 2), v(22, 3),
  ],
}

/** 촘촘한 지그재그. 코너가 많아 광역 타워가 제값을 한다. */
export const LEVEL_RAMPARTS: LevelDef = {
  id: 'ramparts',
  name: '제포 진성',
  cols: COLS,
  rows: ROWS,
  routes: [
    [
      v(-1, 2), v(4, 2), v(4, 7), v(9, 7), v(9, 2),
      v(14, 2), v(14, 11), v(19, 11), v(19, 6), v(24, 6),
    ],
  ],
  blocked: [
    v(1, 5), v(2, 5), v(1, 6),
    v(6, 4), v(7, 4), v(6, 5), v(7, 5),
    v(11, 8), v(12, 8), v(11, 9),
    v(16, 4), v(17, 4), v(16, 5),
    v(21, 10), v(22, 10), v(21, 11),
    v(2, 12), v(3, 12), v(2, 13),
  ],
}

/** 출발점 2곳이 중앙에서 합류한다. 한쪽만 막으면 반대쪽이 뚫린다. */
export const LEVEL_FORK: LevelDef = {
  id: 'fork',
  name: '새재 갈림길',
  cols: COLS,
  rows: ROWS,
  routes: [
    [v(-1, 2), v(10, 2), v(10, 7), v(17, 7), v(17, 12), v(24, 12)],
    [v(-1, 13), v(6, 13), v(6, 7), v(17, 7), v(17, 12), v(24, 12)],
  ],
  blocked: [
    v(2, 5), v(3, 5), v(2, 6),
    v(8, 10), v(9, 10), v(8, 11),
    v(13, 3), v(14, 3), v(13, 4),
    v(20, 2), v(21, 2), v(20, 3),
    v(12, 13), v(13, 13), v(12, 14),
  ],
}

/** 길게 되접히는 나선. 경로가 길어 커버리지는 좋지만 물량이 많다. */
export const LEVEL_HIGHLANDS: LevelDef = {
  id: 'highlands',
  name: '안주성 벌판',
  cols: COLS,
  rows: ROWS,
  routes: [
    [v(-1, 1), v(20, 1), v(20, 5), v(4, 5), v(4, 9), v(20, 9), v(20, 13), v(24, 13)],
  ],
  blocked: [
    v(1, 3), v(2, 3),
    v(8, 3), v(9, 3), v(10, 3),
    v(16, 7), v(17, 7), v(16, 6),
    v(6, 7), v(7, 7),
    v(1, 11), v(2, 11), v(1, 12),
    v(12, 11), v(13, 11), v(12, 12),
  ],
}

/** 세 방향에서 동시에 밀려와 한 지점으로 합류하는 최종 맵. */
export const LEVEL_GATE: LevelDef = {
  id: 'gate',
  name: '남한산성',
  cols: COLS,
  rows: ROWS,
  routes: [
    [v(-1, 2), v(11, 2), v(11, 7), v(24, 7)],
    [v(-1, 12), v(11, 12), v(11, 7), v(24, 7)],
    [v(5, -1), v(5, 7), v(24, 7)],
  ],
  blocked: [
    v(1, 5), v(2, 5), v(1, 6),
    v(8, 4), v(8, 5),
    v(8, 10), v(8, 11),
    v(15, 3), v(16, 3), v(15, 4),
    v(15, 11), v(16, 11), v(15, 12),
    v(21, 1), v(22, 1),
    v(21, 13), v(22, 13),
  ],
}

export const LEVELS: LevelDef[] = [
  LEVEL_GREENVALE,
  LEVEL_RAMPARTS,
  LEVEL_FORK,
  LEVEL_HIGHLANDS,
  LEVEL_GATE,
]
