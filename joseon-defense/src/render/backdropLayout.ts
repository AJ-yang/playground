/**
 * 유물 사진을 타이틀 어디에 흩을지.
 *
 * 자리를 무작위로 잡지 않고 손으로 박아 둔다. 타이틀 가운데 704px은 제목과
 * 난이도 카드가 쓰므로 사진이 거기 걸리면 글자를 못 읽는다. 좌우 여백
 * (각 260px쯤)과 아래쪽 길 언저리만 쓴다.
 *
 * `nx`/`ny`는 화면 크기에 대한 비율이고 `width`는 픽셀이다 — 사진이 화면
 * 비율에 따라 늘어나면 유물이 찌그러져 보이므로 크기는 고정한다. 높이는
 * 원본 비율을 따라간다.
 */
export interface PlateSlot {
  nx: number
  ny: number
  /** 그려질 가로 폭(px). 높이는 사진의 원래 비율을 따른다. */
  width: number
  /** 라디안. 종이에 아무렇게나 얹은 것처럼 조금씩 틀어 둔다. */
  rotation: number
  alpha: number
}

export const PLATE_SLOTS: readonly PlateSlot[] = [
  // 왼쪽 여백
  { nx: 0.085, ny: 0.20, width: 172, rotation: -0.10, alpha: 0.30 },
  { nx: 0.115, ny: 0.42, width: 150, rotation: 0.08, alpha: 0.26 },
  { nx: 0.070, ny: 0.63, width: 166, rotation: -0.06, alpha: 0.29 },
  { nx: 0.125, ny: 0.83, width: 144, rotation: 0.12, alpha: 0.24 },
  // 오른쪽 여백
  { nx: 0.915, ny: 0.18, width: 166, rotation: 0.09, alpha: 0.29 },
  { nx: 0.885, ny: 0.40, width: 150, rotation: -0.07, alpha: 0.25 },
  { nx: 0.930, ny: 0.61, width: 172, rotation: 0.05, alpha: 0.30 },
  { nx: 0.875, ny: 0.81, width: 144, rotation: -0.11, alpha: 0.24 },
  // 아래쪽 — 행군하는 길 뒤. 기록화가 있으면 여기로 온다.
  { nx: 0.300, ny: 0.93, width: 140, rotation: 0.04, alpha: 0.20 },
  { nx: 0.700, ny: 0.94, width: 140, rotation: -0.05, alpha: 0.20 },
]
