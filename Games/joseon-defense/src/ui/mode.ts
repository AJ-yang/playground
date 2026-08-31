import { getTowerDef } from '../data/towers'
import type { Game } from '../game/Game'

/**
 * 지금 무슨 모드인가.
 *
 * 그리는 쪽(`Hud`)과 조작 훅(`playtest`)이 **같은 문자열**을 써야 한다.
 * 훅의 label은 "화면에 보이는 그대로"여야 하는데, 두 곳에서 따로 지으면
 * 조용히 어긋난다. 그래서 문장을 여기 한 곳에서 만든다.
 */
export type ModeId = 'build' | 'inspect' | 'none'

export interface ModeBanner {
  mode: ModeId
  /** 띠에서 가장 큰 글자 */
  title: string
  /** 그 옆(모드 없을 때는 아래)의 한 줄 */
  hint: string
  /** 이 모드를 끄는 버튼. 모드가 없으면 끌 것도 없다. */
  cancel: { id: string; label: string } | null
  /** 지금 이 모드가 막혀 있는가 (골드 부족 등). 힌트가 그 사유다. */
  blocked: boolean
}

export function modeBanner(game: Game): ModeBanner {
  const buildId = game.selectedBuildId
  if (buildId) {
    const def = getTowerDef(buildId)
    const cost = def.levels[0].cost
    const short = cost - game.gold
    return {
      mode: 'build',
      title: `배치 모드 · ${def.name} ${cost}G`,
      hint: short > 0 ? `골드가 ${short} 부족합니다` : '빈 땅을 클릭하면 세워집니다',
      cancel: { id: 'cancelBuild', label: '취소 (Esc)' },
      blocked: short > 0,
    }
  }

  const tower = game.selectedTower
  if (tower) {
    return {
      mode: 'inspect',
      title: `조회 중 · ${tower.def.name} Lv.${tower.level}`,
      // 정보창이 우측 패널에서 판 위 기물 옆으로 옮겨졌는데 이 안내문만
      // 「옆 창에서」로 남아, 읽은 사람이 오른쪽 패널을 뒤졌다
      // (PLAYTEST 2회차 막힌 곳 10). 안내는 창이 실제로 있는 곳을 가리킨다.
      hint: '기물 옆 정보창에서 강화·철수',
      cancel: { id: 'closeTowerBanner', label: '닫기 (Esc)' },
      blocked: false,
    }
  }

  // 안내는 모드가 없을 때 가장 크다. 방법을 이미 아는 사람에게만 보이는
  // 안내는 안내가 아니다 (ROADMAP 1회차 처방 1).
  return {
    mode: 'none',
    title: '기물을 지으려면 먼저 병종을 고르세요',
    hint: '오른쪽 카드를 클릭하거나 숫자키 1~8 → 그다음 빈 땅을 클릭',
    cancel: null,
    blocked: false,
  }
}

/**
 * Esc가 **지금** 하는 일.
 *
 * 한 표현은 한 규칙만 나른다(GDD 8.0). Esc는 「지금 열려 있는 것을 닫는다」
 * 하나만 한다 — 확인창 · 배치 모드 · 정보창. 판을 버리는 것은 되돌릴 수 없는
 * 조작이라 다른 키(Q·R)로 가른다.
 *
 * 2회차에 이 둘이 같은 키였다. 배치를 취소하려고 누른 Esc가 「판을 버릴까요?」를
 * 띄웠고, 그것을 못 본 사람이 7분 동안 뒤에서 버튼을 눌렀다
 * (PLAYTEST 2회차 막힌 곳 9).
 *
 * 그리는 쪽·입력 쪽·조작 훅이 같은 답을 쓰도록 여기 한 곳에서 만든다.
 */
export type EscapeActionId = 'closeConfirm' | 'cancelBuild' | 'closeTower' | 'none'

export interface EscapeAction {
  id: EscapeActionId
  /** 이 상태에서 Esc를 누르면 무엇이 되는가 (훅과 화면이 같은 말을 쓴다) */
  label: string
}

/** 닫을 것이 없을 때 Esc의 응답. 침묵은 응답이 아니다. */
export const ESCAPE_NOTHING_NOTICE = '닫을 것이 없습니다 · 판을 나가려면 Q · 다시 하려면 R'

export function escapeAction(game: Game, confirmOpen: boolean): EscapeAction {
  if (confirmOpen) return { id: 'closeConfirm', label: '확인창 닫기 (계속하기)' }
  if (game.selectedBuildId) return { id: 'cancelBuild', label: '배치 취소' }
  if (game.selectedTower) return { id: 'closeTower', label: '정보창 닫기' }
  return { id: 'none', label: ESCAPE_NOTHING_NOTICE }
}
