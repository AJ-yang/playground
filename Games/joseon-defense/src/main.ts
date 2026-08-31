import { GameLoop } from './core/loop'
import { STAGES, getStage, type StageDef } from './data/stages'
import { DIFFICULTIES } from './data/difficulty'
import { TOWER_ORDER, getTowerDef } from './data/towers'
import { Game, TILE_SIZE } from './game/Game'
import { Progress, browserStorage } from './game/Progress'
import { Renderer } from './render/Renderer'
import { PALETTE, FONT } from './render/palette'
import { Hud } from './ui/Hud'
import { StageSelect } from './ui/StageSelect'
import { TitleScreen } from './ui/TitleScreen'
import { computeLayout, hitTest } from './ui/layout'
import { NoticeBox, type ConfirmPrompt } from './ui/feedback'
import { installPlaytest } from './ui/playtest'

const canvas = document.getElementById('game') as HTMLCanvasElement | null
if (!canvas) throw new Error('#game 캔버스를 찾을 수 없습니다')
const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('2D 컨텍스트를 생성할 수 없습니다')

// 모든 맵이 같은 격자 크기를 쓰므로 레이아웃은 한 번만 계산한다.
const { cols, rows } = STAGES[0]!.level
const layout = computeLayout(cols, rows)

// 고해상도 디스플레이 대응: 논리 크기는 layout 그대로 두고 백버퍼만 키운다.
const dpr = Math.min(window.devicePixelRatio || 1, 2)
canvas.width = layout.width * dpr
canvas.height = layout.height * dpr
canvas.style.width = `${layout.width}px`
canvas.style.height = `${layout.height}px`
ctx.scale(dpr, dpr)

const progress = new Progress(browserStorage())
const renderer = new Renderer(ctx, layout)
const hud = new Hud(ctx, layout)
const stageSelect = new StageSelect(ctx, layout)
const titleScreen = new TitleScreen(ctx, layout)

type Screen = 'title' | 'select' | 'play'
let screen: Screen = 'title'
let stage: StageDef = progress.nextStage() ?? STAGES[0]!
let game = new Game(stage, {
  availableTowers: progress.unlockedTowers(),
  hpScale: progress.hpScale,
})

let paused = false
let speed: 1 | 2 | 3 = 1
let elapsed = 0
/** 클리어 직후 한 번만 띄우는 해금 안내 (타워 ID) */
let unlockBanner: string[] = []
/** 이번 판의 승패를 이미 진행도에 반영했는가 */
let resultRecorded = false
/** 첫 프레임을 그렸는가. 조작 훅의 ready 판정에만 쓴다. */
let firstFrameDrawn = false
/**
 * 방금 조작이 어떻게 됐는지 말해 주는 쪽지.
 *
 * 게임 상태가 아니라 화면 상태라 `Game` 밖에 둔다 — 시뮬레이터는 이 층을
 * 통째로 쓰지 않으므로 게임 규칙이 여기 섞이면 안 된다.
 */
const notices = new NoticeBox()
/** 열려 있는 확인창. 떠 있는 동안 판은 멈추고 다른 조작은 막힌다. */
let confirmPrompt: ConfirmPrompt | null = null

function notify(text: string, at: { x: number; y: number } | null = null): void {
  notices.show(text, 'fail', at)
}

const loop = new GameLoop({
  update(dt) {
    // 타이틀 배경의 행진 연출도 시간이 필요하므로 elapsed는 항상 돈다.
    elapsed += dt
    if (screen !== 'play') return
    game.update(dt)
    if (game.phase === 'victory' && !resultRecorded) {
      resultRecorded = true
      unlockBanner = progress.completeStage(stage, game.lives)
    } else if (game.phase === 'defeat') {
      resultRecorded = true
    }
  },
  render: drawFrame,
})

/**
 * 이번 프레임 그리기.
 *
 * 루프 밖에서도 부를 수 있게 이름 있는 함수로 뺐다. 클릭 영역은 **그리면서**
 * 만들어지므로(`Hud`·`StageSelect`·`TitleScreen`), 조작 훅이 "지금" 누를 수
 * 있는 것을 물으면 마지막 프레임이 아니라 지금 상태로 한 번 더 그려야
 * 답이 한 프레임 밀리지 않는다. 그리기는 게임 상태를 바꾸지 않으므로
 * 여러 번 불러도 안전하다.
 */
function drawFrame(): void {
  firstFrameDrawn = true
  if (screen === 'title') {
    titleScreen.draw(progress, elapsed)
    return
  }
  if (screen === 'select') {
    stageSelect.draw(progress)
    return
  }
  ctx!.fillStyle = PALETTE.bg
  ctx!.fillRect(0, 0, layout.width, layout.height)
  renderer.drawBoard(game, elapsed)
  const unlock = unlockBanner.map(getTowerDef)
  const resultBottom = renderer.drawGameOver(game, unlock)
  // 스테이지 이름은 확인창 그늘 아래로 들어가야 하므로 HUD보다 먼저 그린다.
  drawPlayChrome()
  hud.draw(game, {
    timeScale: speed,
    paused,
    notice: notices.current(),
    noticeProgress: notices.progress(),
    confirm: confirmPrompt,
  })
  // 결과 화면 버튼은 오버레이 위에 그려야 하므로 HUD 다음이다.
  // (확인창은 판이 끝나기 전에만 뜨므로 둘이 겹치는 일은 없다.)
  hud.drawResultActions(game, nextStage() !== null, resultBottom)
}

/** 플레이 화면 상단 좌측의 스테이지 표시와 나가기 버튼. */
function drawPlayChrome(): void {
  // 스테이지 이름은 상단 바가 이미 꽉 차 있어 보드 좌상단에 얹는다.
  const x = layout.board.x + 10
  const y = layout.board.y + 14
  ctx!.textAlign = 'left'
  ctx!.textBaseline = 'middle'
  ctx!.font = FONT.small
  ctx!.fillStyle = 'rgba(230,237,243,0.65)'
  ctx!.fillText(`S${stage.index} ${stage.name}`, x, y)

}

/**
 * 방금 판의 **바로 다음** 스테이지. 아직 잠겨 있으면 null.
 *
 * `progress.nextStage()`(아직 못 깬 첫 스테이지)를 쓰지 않는 이유는, 이미 깬
 * 스테이지를 다시 플레이했을 때 엉뚱하게 앞쪽 스테이지로 보내기 때문이다.
 * "다음"은 순서상 다음이어야 한다.
 */
function nextStage(): StageDef | null {
  const i = STAGES.indexOf(stage)
  const next = STAGES[i + 1]
  return next && progress.isUnlocked(next) ? next : null
}

function applyTimeScale(): void {
  // 확인창이 떠 있는 동안은 판이 멈춘다. "이 판을 버릴까요"를 묻는 사이에
  // 웨이브가 계속 밀려오면 묻는 의미가 없다.
  const stopped = paused || confirmPrompt !== null
  loop.timeScale = screen === 'play' && !stopped ? speed : 0
}

function startStage(target: StageDef): void {
  stage = target
  confirmPrompt = null
  notices.clear()
  game = new Game(target, {
    availableTowers: progress.unlockedTowers(),
    hpScale: progress.hpScale,
  })
  renderer.invalidateTerrain()
  screen = 'play'
  paused = false
  speed = 1
  elapsed = 0
  unlockBanner = []
  resultRecorded = false
  applyTimeScale()
}

function backToSelect(): void {
  screen = 'select'
  unlockBanner = []
  confirmPrompt = null
  notices.clear()
  applyTimeScale()
}

/**
 * 진행 중인 판이 있는가 — 확인창을 띄울지 판단한다.
 *
 * 아무것도 안 한 판(첫 웨이브 준비 중, 기물 0기)까지 확인을 물으면 확인창이
 * 소음이 되고, 소음이 된 확인창은 사람이 읽지 않고 누른다.
 */
function runInProgress(): boolean {
  if (game.isOver) return false
  return (
    game.towers.length > 0 ||
    game.waves.running ||
    game.waves.waveNumber > 1 ||
    game.lives < stage.startLives
  )
}

/**
 * 판을 버리는 조작 — 확인을 거친다.
 *
 * GDD 8.0: 되돌릴 수 없는 조작에는 확인을 둔다. 판매는 70% 환급으로 되돌릴 수
 * 있고, 배치는 팔면 되고, 배속·일시정지는 언제든 되돌아온다. 진행 중인 판을
 * 버리는 것만 되돌아올 길이 없는데 그것 하나만 확인이 없었다.
 */
function askAbandon(kind: 'leave' | 'restart'): void {
  const act = kind === 'leave' ? backToSelect : () => startStage(stage)
  if (!runInProgress()) {
    act()
    return
  }
  const wave = Math.min(game.waves.waveNumber, game.waves.totalWaves)
  confirmPrompt = {
    title: kind === 'leave' ? '진행 중인 판을 버릴까요?' : '처음부터 다시 할까요?',
    detail: `웨이브 ${wave}/${game.waves.totalWaves} · 기물 ${game.towers.length}기 · 보유 ${game.gold}G · 생명 ${game.lives}`,
    confirmLabel: kind === 'leave' ? '버리고 나가기' : '처음부터 다시',
    cancelLabel: '계속하기 (Esc)',
    onConfirm: act,
  }
  notices.clear()
  applyTimeScale()
}

function resolveConfirm(accept: boolean): void {
  const prompt = confirmPrompt
  if (!prompt) return
  confirmPrompt = null
  applyTimeScale()
  if (accept) prompt.onConfirm()
}

// ────────────────────────────── 입력 ──────────────────────────────

/** 마우스 이벤트 좌표를 캔버스 논리 좌표로 변환. CSS 스케일링까지 보정한다. */
function toCanvasSpace(event: MouseEvent): { x: number; y: number } {
  const rect = canvas!.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * layout.width,
    y: ((event.clientY - rect.top) / rect.height) * layout.height,
  }
}

function boardTileAt(x: number, y: number): { x: number; y: number } | null {
  const bx = x - layout.board.x
  const by = y - layout.board.y
  if (bx < 0 || by < 0 || bx >= layout.board.w || by >= layout.board.h) return null
  return game.grid.tileAt(bx, by)
}

canvas.addEventListener('mousemove', (event) => {
  if (screen !== 'play') return
  const { x, y } = toCanvasSpace(event)
  game.hoverTile = boardTileAt(x, y)
})

canvas.addEventListener('mouseleave', () => {
  game.hoverTile = null
})

canvas.addEventListener('contextmenu', (event) => {
  // 우클릭은 배치 취소 / 선택 해제로 쓴다.
  event.preventDefault()
  if (confirmPrompt) return
  game.selectBuild(null)
  game.selectedTower = null
})

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return
  const { x, y } = toCanvasSpace(event)

  if (screen === 'title') {
    const button = hitTest(titleScreen.hitAreas, x, y)
    if (!button?.enabled) return
    if (button.id.startsWith('difficulty:')) {
      progress.setDifficulty(button.id.slice('difficulty:'.length))
    } else if (button.id === 'start') {
      screen = 'select'
    }
    return
  }

  if (screen === 'select') {
    const button = hitTest(stageSelect.hitAreas, x, y)
    if (!button?.enabled) return
    if (button.id.startsWith('stage:')) startStage(getStage(button.id.slice('stage:'.length)))
    else if (button.id === 'resetProgress') progress.reset()
    else if (button.id === 'toTitle') screen = 'title'
    return
  }

  const button = hitTest(hud.hitAreas, x, y)
  if (button) {
    // **못 눌리는 버튼도 이유를 말한다.** 눌러도 아무 일이 없는 것이 침묵의
    // 절반이었다 — 골드가 모자라 회색이 된 강화 버튼과 "게임 종료"로 바뀐
    // 웨이브 버튼이 그랬다.
    if (button.enabled) handleUiButton(button.id, button.payload)
    else notify(disabledReason(button.id), { x: button.x + button.w / 2, y: button.y })
    return
  }

  // 확인창이 떠 있으면 판 위 클릭은 통과시키지 않는다.
  if (confirmPrompt) return

  const tile = boardTileAt(x, y)
  if (tile) {
    const at = {
      x: layout.board.x + (tile.x + 0.5) * TILE_SIZE,
      y: layout.board.y + (tile.y + 0.5) * TILE_SIZE,
    }
    const onTower = game.grid.towerIdAt(tile.x, tile.y) !== undefined
    const hadSelection = game.selectedTower !== null
    const result = game.clickTile(tile.x, tile.y)
    if (result && !result.ok) {
      // `BuildResult`가 이미 만들고 있던 사유를 화면에 잇는다.
      notify(result.reason, at)
    } else if (!result && !onTower && !game.selectedBuildId && !hadSelection) {
      // 아무것도 선택하지 않은 상태의 클릭도 실패다.
      notify('먼저 병종을 고르세요', at)
    }
  }
})

/**
 * 회색 버튼을 눌렀을 때의 사유.
 *
 * 강화는 `Game.upgradeSelected()`가 돌려주는 사유를 그대로 쓴다 — 버튼이
 * 회색인 조건과 그 메서드가 거절하는 조건이 같으므로 실제로 강화되는 일은
 * 없고, 사유 문자열을 UI에서 다시 짓지 않으니 둘이 어긋날 수도 없다.
 */
function disabledReason(id: string): string {
  if (confirmPrompt) return '먼저 확인창에 답해 주세요'
  if (id === 'upgrade') {
    const result = game.upgradeSelected()
    return result.ok ? '강화했습니다' : result.reason
  }
  if (id === 'nextWave') {
    return game.isOver ? '판이 이미 끝났습니다' : '웨이브가 진행 중입니다'
  }
  if (id === 'nextStage') return '다음 스테이지가 아직 잠겨 있습니다'
  if (game.isOver) return '판이 끝나 조작할 수 없습니다'
  return '지금은 누를 수 없습니다'
}

function handleUiButton(id: string, payload?: string): void {
  if (id.startsWith('confirm:')) {
    resolveConfirm(id === 'confirm:yes')
    return
  }
  if (id.startsWith('build:')) {
    const towerId = payload ?? id.slice('build:'.length)
    game.selectBuild(game.selectedBuildId === towerId ? null : towerId)
    return
  }
  if (id.startsWith('speed:')) {
    speed = Number(id.slice('speed:'.length)) as 1 | 2 | 3
    paused = false
    applyTimeScale()
    return
  }

  switch (id) {
    case 'pause':
      paused = !paused
      applyTimeScale()
      break
    case 'nextWave':
      game.callNextWave()
      break
    case 'upgrade':
      game.upgradeSelected()
      break
    case 'sell':
      game.sellSelected()
      break
    case 'targeting':
      game.cycleSelectedTargeting()
      break
    // 배치 취소·정보창 닫기. 우클릭과 Esc는 아는 사람만 쓰는 길이라
    // 화면에도 같은 길을 낸다.
    case 'cancelBuild':
      game.selectBuild(null)
      break
    case 'closeTower':
    case 'closeTowerBanner':
      game.selectedTower = null
      break
    case 'restart':
      askAbandon('restart')
      break
    case 'nextStage': {
      const next = nextStage()
      if (next) startStage(next)
      break
    }
    case 'toSelect':
      askAbandon('leave')
      break
  }
}

window.addEventListener('keydown', (event) => {
  if (screen === 'title') {
    if (event.key === 'Enter' || event.key === ' ') screen = 'select'
    // 1~3으로 난이도를 바로 고를 수 있게 — 반복 플레이가 잦은 화면이다.
    const n = Number(event.key)
    if (n >= 1 && n <= DIFFICULTIES.length) progress.setDifficulty(DIFFICULTIES[n - 1]!.id)
    return
  }

  if (screen === 'select') {
    // 숫자키로 스테이지를 바로 고를 수 있게 — 반복 플레이가 잦은 화면이다.
    const n = Number(event.key)
    if (n >= 1 && n <= STAGES.length) {
      const target = STAGES[n - 1]!
      if (progress.isUnlocked(target)) startStage(target)
    }
    return
  }

  // 확인창이 떠 있는 동안은 그 창에만 답할 수 있다.
  if (confirmPrompt) {
    if (event.key === 'Escape') resolveConfirm(false)
    else if (event.key === 'Enter') resolveConfirm(true)
    return
  }

  switch (event.key.toLowerCase()) {
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8': {
      // 메뉴에 보이는 순서(해금된 것만)와 숫자키를 맞춘다.
      const menu = TOWER_ORDER.filter((id) => game.canUse(id))
      const towerId = menu[Number(event.key) - 1]
      if (towerId) game.selectBuild(game.selectedBuildId === towerId ? null : towerId)
      else notify(`이번 판에 쓸 수 있는 병종은 ${menu.length}종입니다`)
      break
    }
    case 'escape':
      if (game.selectedBuildId || game.selectedTower) {
        game.selectBuild(null)
        game.selectedTower = null
      } else {
        // Esc 두 번이 판을 통째로 버리던 자리다. 이제 확인을 거친다.
        askAbandon('leave')
      }
      break
    case ' ':
      event.preventDefault()
      if (game.isOver) notify('판이 이미 끝났습니다')
      else if (game.waves.running) notify('웨이브가 진행 중입니다')
      else game.callNextWave()
      break
    case 'p':
      paused = !paused
      applyTimeScale()
      break
    case 'u': {
      const result = game.upgradeSelected()
      if (!result.ok) notify(result.reason, towerAnchor())
      break
    }
    case 'x': {
      if (game.isOver) notify('판이 끝나 조작할 수 없습니다')
      else {
        const anchor = towerAnchor()
        const result = game.sellSelected()
        if (!result.ok) notify(result.reason, anchor)
      }
      break
    }
    case 't':
      if (!game.selectedTower) notify('먼저 기물을 클릭해 고르세요')
      else game.cycleSelectedTargeting()
      break
    case 'r':
      askAbandon('restart')
      break
    case 'q':
      askAbandon('leave')
      break
  }
})

/** 선택된 기물의 화면 좌표. 기물에 대한 사유는 그 기물 옆에 뜬다. */
function towerAnchor(): { x: number; y: number } | null {
  const tower = game.selectedTower
  if (!tower) return null
  return { x: layout.board.x + tower.pos.x, y: layout.board.y + tower.pos.y }
}

// 탭이 백그라운드로 가면 자동 일시정지 — 돌아왔을 때 웨이브가 다 지나가 있는 사고를 막는다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused) {
    paused = true
    applyTimeScale()
  }
})

applyTimeScale()
loop.start()

// 조작 훅 (표준 계약 4.2). 프로덕션 빌드에서도 남는다 — 배포본을 그대로
// 검증할 수 있어야 한다. 게임 상태는 읽기만 하고, 화면별 히트 영역을
// 그리는 쪽에서 그대로 받아 CSS 픽셀 좌표로 환산해 내보낸다.
installPlaytest({
  canvas,
  layout,
  screen: () => screen,
  game: () => game,
  stage: () => stage,
  progress: () => progress,
  paused: () => paused,
  speed: () => speed,
  redraw: drawFrame,
  uiButtons: () =>
    screen === 'title'
      ? titleScreen.hitAreas
      : screen === 'select'
        ? stageSelect.hitAreas
        : hud.hitAreas,
  rendered: () => firstFrameDrawn,
  notice: () => notices.current(),
  confirm: () => confirmPrompt,
})

// 개발 편의: 콘솔에서 상태를 들여다볼 수 있게 노출한다.
Object.assign(window as unknown as Record<string, unknown>, {
  __game: () => game,
  __progress: () => progress,
  __startStage: (id: string) => startStage(getStage(id)),
  __tileSize: TILE_SIZE,
})
