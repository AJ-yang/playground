import { GameLoop } from './core/loop'
import { STAGES, getStage, type StageDef } from './data/stages'
import { TOWER_ORDER, getTowerDef } from './data/towers'
import { Game, TILE_SIZE } from './game/Game'
import { Progress, browserStorage } from './game/Progress'
import { Renderer } from './render/Renderer'
import { PALETTE, FONT } from './render/palette'
import { Hud } from './ui/Hud'
import { StageSelect } from './ui/StageSelect'
import { computeLayout, hitTest } from './ui/layout'

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

type Screen = 'select' | 'play'
let screen: Screen = 'select'
let stage: StageDef = progress.nextStage() ?? STAGES[0]!
let game = new Game(stage, { availableTowers: progress.unlockedTowers() })

let paused = false
let speed: 1 | 2 | 3 = 1
let elapsed = 0
/** 클리어 직후 한 번만 띄우는 해금 안내 (타워 ID) */
let unlockBanner: string | null = null
/** 이번 판의 승패를 이미 진행도에 반영했는가 */
let resultRecorded = false

const loop = new GameLoop({
  update(dt) {
    if (screen !== 'play') return
    elapsed += dt
    game.update(dt)
    if (game.phase === 'victory' && !resultRecorded) {
      resultRecorded = true
      unlockBanner = progress.completeStage(stage, game.lives)
    } else if (game.phase === 'defeat') {
      resultRecorded = true
    }
  },
  render() {
    if (screen === 'select') {
      stageSelect.draw(progress)
      return
    }
    ctx.fillStyle = PALETTE.bg
    ctx.fillRect(0, 0, layout.width, layout.height)
    renderer.drawBoard(game, elapsed)
    renderer.drawGameOver(game)
    hud.draw(game, speed, paused)
    drawPlayChrome()
  },
})

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

  if (game.isOver && unlockBanner) {
    const def = getTowerDef(unlockBanner)
    const cx = layout.board.x + layout.board.w / 2
    const cy = layout.board.y + layout.board.h / 2 + 128
    ctx!.textAlign = 'center'
    ctx!.font = FONT.title
    ctx!.fillStyle = def.accent
    ctx!.fillText(`새 기물 해금 — ${def.name}`, cx, cy)
    ctx!.font = FONT.small
    ctx!.fillStyle = PALETTE.textMuted
    ctx!.fillText(def.tagline, cx, cy + 22)
    ctx!.textAlign = 'left'
  }
}

function applyTimeScale(): void {
  loop.timeScale = screen === 'play' && !paused ? speed : 0
}

function startStage(target: StageDef): void {
  stage = target
  game = new Game(target, { availableTowers: progress.unlockedTowers() })
  renderer.invalidateTerrain()
  screen = 'play'
  paused = false
  speed = 1
  elapsed = 0
  unlockBanner = null
  resultRecorded = false
  applyTimeScale()
}

function backToSelect(): void {
  screen = 'select'
  unlockBanner = null
  applyTimeScale()
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
  // 우클릭은 건설 취소 / 선택 해제로 쓴다.
  event.preventDefault()
  game.selectBuild(null)
  game.selectedTower = null
})

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return
  const { x, y } = toCanvasSpace(event)

  if (screen === 'select') {
    const button = hitTest(stageSelect.hitAreas, x, y)
    if (!button?.enabled) return
    if (button.id.startsWith('stage:')) startStage(getStage(button.id.slice('stage:'.length)))
    else if (button.id === 'resetProgress') progress.reset()
    return
  }

  const button = hitTest(hud.hitAreas, x, y)
  if (button) {
    if (button.enabled) handleUiButton(button.id, button.payload)
    return
  }

  const tile = boardTileAt(x, y)
  if (tile) game.clickTile(tile.x, tile.y)
})

function handleUiButton(id: string, payload?: string): void {
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
    case 'restart':
      startStage(stage)
      break
  }
}

window.addEventListener('keydown', (event) => {
  if (screen === 'select') {
    // 숫자키로 스테이지를 바로 고를 수 있게 — 반복 플레이가 잦은 화면이다.
    const n = Number(event.key)
    if (n >= 1 && n <= STAGES.length) {
      const target = STAGES[n - 1]!
      if (progress.isUnlocked(target)) startStage(target)
    }
    return
  }

  switch (event.key.toLowerCase()) {
    case '1':
    case '2':
    case '3':
    case '4':
    case '5': {
      // 메뉴에 보이는 순서(해금된 것만)와 숫자키를 맞춘다.
      const menu = TOWER_ORDER.filter((id) => game.canUse(id))
      const towerId = menu[Number(event.key) - 1]
      if (towerId) game.selectBuild(game.selectedBuildId === towerId ? null : towerId)
      break
    }
    case 'escape':
      if (game.selectedBuildId || game.selectedTower) {
        game.selectBuild(null)
        game.selectedTower = null
      } else {
        backToSelect()
      }
      break
    case ' ':
      event.preventDefault()
      game.callNextWave()
      break
    case 'p':
      paused = !paused
      applyTimeScale()
      break
    case 'u':
      game.upgradeSelected()
      break
    case 'x':
      game.sellSelected()
      break
    case 't':
      game.cycleSelectedTargeting()
      break
    case 'r':
      startStage(stage)
      break
    case 'q':
      backToSelect()
      break
  }
})

// 탭이 백그라운드로 가면 자동 일시정지 — 돌아왔을 때 웨이브가 다 지나가 있는 사고를 막는다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused) {
    paused = true
    applyTimeScale()
  }
})

applyTimeScale()
loop.start()

// 개발 편의: 콘솔에서 상태를 들여다볼 수 있게 노출한다.
Object.assign(window as unknown as Record<string, unknown>, {
  __game: () => game,
  __progress: () => progress,
  __startStage: (id: string) => startStage(getStage(id)),
  __tileSize: TILE_SIZE,
})
