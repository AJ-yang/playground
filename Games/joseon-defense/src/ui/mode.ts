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
      hint: '옆 창에서 강화·철수',
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
