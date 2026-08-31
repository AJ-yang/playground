/**
 * 조작 훅 — `window.__playtest` (표준 계약 4.2, `Games/CONTRIBUTING.md`).
 *
 * 이 게임은 HUD·패널·타이틀까지 전부 캔버스에 손으로 그린다. DOM 셀렉터가
 * 하나도 없으니 playtester가 브라우저에서 붙을 자리가 없다. 이 파일이 그
 * 자리다 — **게임을 바꾸지 않고 밖에서 읽고 누를 창구만 낸다.**
 *
 * 세 가지 원칙으로 짰다.
 *
 * 1. **좌표는 CSS 픽셀 뷰포트 기준.** Playwright가 `page.mouse.click(x, y)`로
 *    그대로 누를 수 있어야 하므로, 캔버스 내부 논리 좌표(layout)도 devicePixelRatio
 *    배율도 밖으로 새어 나가면 안 된다. `getBoundingClientRect()`로 매번 환산해
 *    창 크기가 바뀌어 캔버스가 축소(`max-width: 100%`)돼도 맞는 값이 나온다.
 * 2. **이름은 화면에 보이는 그대로.** 히트 영역을 만드는 자리(`Hud`·`StageSelect`·
 *    `TitleScreen`의 버튼 헬퍼)에서 그리는 글자를 함께 실어 보낸다. 여기서
 *    ID를 한국어로 번역하면 그림과 이름이 따로 놀다가 조용히 어긋난다.
 * 3. **못 누르는 것도 남긴다.** 골드가 모자란 강화 버튼, 배치 불가 타일은
 *    목록에서 지우지 않고 `enabled: false`로 남긴다. "왜 안 눌리는지 모르겠다"가
 *    playtester가 잡아야 할 대표적인 증상이라 목록에서 사라지면 안 된다.
 *
 * 프로덕션 빌드에서도 살아 있다. 배포본을 그대로 검증할 수 있어야 한다.
 */

import { getDifficulty } from '../data/difficulty'
import { STAGES, type StageDef } from '../data/stages'
import { buildCost, getTowerDef } from '../data/towers'
import { TILE_SIZE, type Game } from '../game/Game'
import type { Progress } from '../game/Progress'
import { TARGET_PRIORITY_LABEL, type GamePhase } from '../game/types'
import { backdropImagesSettled } from '../render/backdropImages'
import type { ConfirmPrompt, Notice } from './feedback'
import type { Layout, UiButton } from './layout'
import { modeBanner } from './mode'

export type PlaytestScreen = 'title' | 'select' | 'play'

export interface HotspotRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Hotspot {
  id: string
  rect: HotspotRect
  label: string
  enabled: boolean
}

/** 훅이 게임을 들여다보는 통로. main.ts가 자기 화면 상태를 여기에 꽂는다. */
export interface PlaytestSource {
  canvas: HTMLCanvasElement
  layout: Layout
  screen(): PlaytestScreen
  game(): Game
  stage(): StageDef
  progress(): Progress
  paused(): boolean
  speed(): number
  /**
   * 한 프레임 다시 그린다.
   *
   * 히트 영역은 그리면서 만들어지므로, 이걸 먼저 부르지 않으면 `hotspots()`가
   * **마지막으로 그려진 프레임**을 답한다. 조작 직후에 물으면 한 프레임(≈16ms)
   * 늦은 목록이 나와서, 방금 고른 기물의 배치 칸이 아직 없는 식으로 어긋난다.
   */
  redraw(): void
  /** 방금 그려진 UI 히트 영역 — 지금 화면의 것만. */
  uiButtons(): readonly UiButton[]
  /** 첫 프레임을 그렸는가. `ready` 판정에 쓴다. */
  rendered(): boolean
  /** 화면에 떠 있는 응답 쪽지. 실패 사유가 여기로 나간다. */
  notice(): Notice | null
  /** 열려 있는 확인창. */
  confirm(): ConfirmPrompt | null
}

const PHASE_LABEL: Record<GamePhase, string> = {
  prep: '준비',
  wave: '교전',
  victory: '승리',
  defeat: '패배',
}

/** 소수점 한 자리까지만. 화면 좌표에 부동소수점 꼬리가 붙어봐야 읽기만 나쁘다. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function installPlaytest(src: PlaytestSource): void {
  /**
   * 캔버스 논리 좌표 → CSS 픽셀 뷰포트 좌표.
   *
   * 캔버스는 백버퍼를 dpr만큼 키우고 CSS 크기는 layout 그대로 두지만,
   * `max-width: 100%` 때문에 창이 좁으면 실제로 줄어든다. 그래서 배율을
   * 고정값이 아니라 매번 실측(`getBoundingClientRect`)에서 뽑는다.
   */
  function toViewport(x: number, y: number, w: number, h: number): HotspotRect {
    const rect = src.canvas.getBoundingClientRect()
    const sx = rect.width / src.layout.width
    const sy = rect.height / src.layout.height
    return {
      x: round1(rect.left + x * sx),
      y: round1(rect.top + y * sy),
      w: round1(w * sx),
      h: round1(h * sy),
    }
  }

  function uiHotspots(): Hotspot[] {
    return src.uiButtons().map((button) => ({
      id: button.id,
      rect: toViewport(button.x, button.y, button.w, button.h),
      label: button.label ?? button.id,
      enabled: button.enabled,
    }))
  }

  /**
   * 보드 위의 누를 곳 — 이미 선 기물과, **기물을 고른 동안에만** 빈 터.
   *
   * 건설 카드(`build:*`)는 여기가 아니라 패널에서 나온다. 기물을 선택해도
   * 카드가 사라지지 않게 바꾼 뒤로는 **어느 모드에서든 목록에 남는다** —
   * 예전에는 정보창이 카드를 통째로 밀어내서 훅에서도 같이 사라졌다.
   *
   * 빈 터를 항상 내보내지 않는 이유는 24×15 격자에서 250칸이 넘게 나오는데,
   * 건설 모드가 아닐 때 빈 터를 누르면 선택이 풀리는 것 말고는 아무 일도
   * 일어나지 않기 때문이다. "지금 누를 수 있는 것"이라는 훅의 질문에 대한
   * 답이 아니다. 기물을 고르는 순간(패널 카드도 훅에 있다) 배치 가능한
   * 칸이 전부 나타난다 — 골드가 모자라면 `enabled: false`로 나타난다.
   */
  function boardHotspots(): Hotspot[] {
    const game = src.game()
    const board = src.layout.board
    const out: Hotspot[] = []
    // 확인창이 떠 있으면 판 위 클릭은 통과하지 않는다. 목록에서 지우지 않고
    // `enabled: false`로 남겨 "왜 안 눌리는가"를 훅에서도 읽을 수 있게 한다.
    const live = src.confirm() === null && !game.isOver

    for (const tower of game.towers) {
      out.push({
        id: `tower:${tower.id}`,
        rect: toViewport(
          board.x + tower.col * TILE_SIZE,
          board.y + tower.row * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
        ),
        label: `${tower.def.name} Lv.${tower.level} (${tower.col},${tower.row})`,
        enabled: live,
      })
    }

    const buildId = game.selectedBuildId
    if (buildId === null) return out

    const cost = buildCost(buildId)
    const name = getTowerDef(buildId).name
    const affordable = game.gold >= cost
    for (let row = 0; row < game.grid.rows; row++) {
      for (let col = 0; col < game.grid.cols; col++) {
        if (!game.grid.canBuild(col, row)) continue
        out.push({
          id: `tile:${col},${row}`,
          rect: toViewport(
            board.x + col * TILE_SIZE,
            board.y + row * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
          ),
          label: `${name} 배치 (${col},${row})`,
          enabled: live && affordable,
        })
      }
    }
    return out
  }

  function hotspots(): Hotspot[] {
    // 지금 상태로 다시 그려서 히트 영역을 새로 만든다. 조작 → 확인을 붙여
    // 쓰는 playtester가 프레임을 기다릴 필요가 없어야 한다.
    src.redraw()
    if (src.screen() !== 'play') return uiHotspots()
    // UI가 뒤에 오도록 둔다 — 결과 화면 버튼은 보드 위에 겹쳐 그려지고,
    // 게임의 히트 테스트도 나중 것을 우선한다(`hitTest`는 역순 탐색).
    return [...boardHotspots(), ...uiHotspots()]
  }

  function towerState(game: Game): unknown {
    const tower = game.selectedTower
    if (!tower) return null
    return {
      id: tower.id,
      name: tower.def.name,
      level: tower.level,
      col: tower.col,
      row: tower.row,
      maxLevel: tower.isMaxLevel,
      upgradeCost: tower.upgradeCost,
      sellValue: tower.sellValue(),
      targeting: TARGET_PRIORITY_LABEL[tower.targetPriority],
      kills: tower.kills,
      damageDealt: Math.round(tower.damageDealt),
    }
  }

  function state(): unknown {
    const screen = src.screen()
    const progress = src.progress()
    const difficulty = getDifficulty(progress.difficulty)

    const base = {
      screen,
      difficulty: { id: difficulty.id, name: difficulty.name, hpScale: difficulty.hpScale },
      progress: {
        clearedCount: progress.clearedCount,
        totalStages: STAGES.length,
        cleared: STAGES.filter((s) => progress.isCleared(s.id)).map((s) => s.id),
        unlocked: STAGES.filter((s) => progress.isUnlocked(s)).map((s) => s.id),
        unlockedTowers: progress.unlockedTowers().map((id) => ({
          id,
          name: getTowerDef(id).name,
        })),
      },
    }

    if (screen !== 'play') return base

    const game = src.game()
    const stage = src.stage()
    const waves = game.waves
    const spawn = waves.spawnProgress
    const banner = modeBanner(game)
    const notice = src.notice()
    const confirm = src.confirm()

    return {
      ...base,
      // 화면에 떠 있는 글자는 훅에서도 읽혀야 한다. 이 셋이 "지금 내 조작이
      // 어떻게 됐는가"에 대한 화면의 답 전부다.
      mode: banner.mode,
      modeLabel: banner.title,
      modeHint: banner.hint,
      notice: notice ? { text: notice.text, kind: notice.kind } : null,
      confirm: confirm
        ? {
            title: confirm.title,
            detail: confirm.detail,
            confirmLabel: confirm.confirmLabel,
            cancelLabel: confirm.cancelLabel,
          }
        : null,
      stage: {
        id: stage.id,
        index: stage.index,
        name: stage.name,
        subtitle: stage.subtitle,
        map: stage.level.name,
        cols: game.grid.cols,
        rows: game.grid.rows,
      },
      phase: game.phase,
      phaseLabel: PHASE_LABEL[game.phase],
      over: game.isOver,
      lives: game.lives,
      maxLives: stage.startLives,
      gold: game.gold,
      paused: src.paused(),
      speed: src.speed(),
      wave: {
        number: waves.waveNumber,
        total: waves.totalWaves,
        running: waves.running,
        prepRemaining: round1(Math.max(0, waves.prepRemaining)),
        spawned: spawn.spawned,
        spawnTotal: spawn.total,
        reward: waves.currentWave.reward,
        warning: waves.currentWave.warning ?? null,
      },
      enemiesOnField: game.enemies.length,
      towersBuilt: game.towers.length,
      kills: game.totalKills,
      leaked: game.totalLeaked,
      goldEarned: game.goldEarned,
      goldSpent: game.goldSpent,
      earlyCallBonus: game.earlyCallBonus,
      // 건설 메뉴는 hotspots에도 있지만, "왜 안 지어지는가"는 골드와 값을
      // 나란히 놓고 봐야 읽힌다.
      build: game.availableTowers.map((id) => ({
        id,
        name: getTowerDef(id).name,
        cost: buildCost(id),
        affordable: game.gold >= buildCost(id),
        selected: game.selectedBuildId === id,
      })),
      selectedBuild: game.selectedBuildId
        ? { id: game.selectedBuildId, name: getTowerDef(game.selectedBuildId).name }
        : null,
      selectedTower: towerState(game),
      towers: game.towers.map((t) => ({
        id: t.id,
        name: t.def.name,
        level: t.level,
        col: t.col,
        row: t.row,
      })),
    }
  }

  const ready = new Promise<void>((resolve) => {
    // 첫 프레임이 그려져야 히트 영역이 채워지고, 배경 사진 디코드가 끝나야
    // 타이틀이 최종 모습이 된다. 자산이 깨져도 멈추지 않도록 상한을 둔다.
    const deadline = performance.now() + 5000
    const tick = (): void => {
      if ((src.rendered() && backdropImagesSettled()) || performance.now() > deadline) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  Object.assign(window as unknown as Record<string, unknown>, {
    __playtest: { ready, state, hotspots },
  })
}
