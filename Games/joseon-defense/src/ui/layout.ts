import { TILE_SIZE } from '../game/Game'

/** 화면 영역 정의. 렌더러와 입력 처리가 같은 좌표계를 쓰도록 한 곳에 모은다. */
export interface Layout {
  width: number
  height: number
  hudHeight: number
  panelWidth: number
  board: { x: number; y: number; w: number; h: number }
  panel: { x: number; y: number; w: number; h: number }
}

export const HUD_HEIGHT = 58
export const PANEL_WIDTH = 250
const BOARD_MARGIN = 10

export function computeLayout(cols: number, rows: number): Layout {
  const boardW = cols * TILE_SIZE
  const boardH = rows * TILE_SIZE
  const width = boardW + PANEL_WIDTH + BOARD_MARGIN * 2
  const height = HUD_HEIGHT + boardH + BOARD_MARGIN * 2

  return {
    width,
    height,
    hudHeight: HUD_HEIGHT,
    panelWidth: PANEL_WIDTH,
    board: { x: BOARD_MARGIN, y: HUD_HEIGHT + BOARD_MARGIN, w: boardW, h: boardH },
    panel: {
      x: BOARD_MARGIN * 2 + boardW,
      y: HUD_HEIGHT + BOARD_MARGIN,
      w: PANEL_WIDTH - BOARD_MARGIN,
      h: boardH,
    },
  }
}

/** 클릭 가능한 UI 영역. Renderer가 만들고 Input이 히트 테스트한다. */
export interface UiButton {
  id: string
  x: number
  y: number
  w: number
  h: number
  enabled: boolean
  /** 자유 데이터 — 어떤 타워인지 같은 정보를 실어 보낸다. */
  payload?: string
  /**
   * **화면에 보이는 그대로**의 글자. 조작 훅(`window.__playtest`)이 이걸 그대로
   * 내보낸다 — 히트 영역을 만드는 자리에서 함께 적어야 그림과 어긋나지 않는다.
   */
  label?: string
}

export function hitTest(buttons: readonly UiButton[], x: number, y: number): UiButton | null {
  // 나중에 그려진(위에 있는) 버튼이 우선하도록 역순 탐색.
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i]!
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b
  }
  return null
}
