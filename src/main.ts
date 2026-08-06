import { GameLoop } from './core/loop'
import { LEVEL_ONE } from './data/levels'
import { TOWER_ORDER } from './data/towers'
import { Game, TILE_SIZE } from './game/Game'
import { Renderer } from './render/Renderer'
import { PALETTE } from './render/palette'
import { Hud } from './ui/Hud'
import { computeLayout, hitTest } from './ui/layout'

const canvas = document.getElementById('game') as HTMLCanvasElement | null
if (!canvas) throw new Error('#game 캔버스를 찾을 수 없습니다')
const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('2D 컨텍스트를 생성할 수 없습니다')

const layout = computeLayout(LEVEL_ONE)

// 고해상도 디스플레이 대응: 논리 크기는 layout 그대로 두고 백버퍼만 키운다.
const dpr = Math.min(window.devicePixelRatio || 1, 2)
canvas.width = layout.width * dpr
canvas.height = layout.height * dpr
canvas.style.width = `${layout.width}px`
canvas.style.height = `${layout.height}px`
ctx.scale(dpr, dpr)

let game = new Game(LEVEL_ONE)
const renderer = new Renderer(ctx, layout)
const hud = new Hud(ctx, layout)

let paused = false
let speed: 1 | 2 | 3 = 1
let elapsed = 0

const loop = new GameLoop({
  update(dt) {
    elapsed += dt
    game.update(dt)
  },
  render() {
    ctx.fillStyle = PALETTE.bg
    ctx.fillRect(0, 0, layout.width, layout.height)
    renderer.drawBoard(game, elapsed)
    renderer.drawGameOver(game)
    hud.draw(game, speed, paused)
  },
})

function applyTimeScale(): void {
  loop.timeScale = paused ? 0 : speed
}

function restart(): void {
  game = new Game(LEVEL_ONE, Math.floor(Math.random() * 0xffffffff))
  renderer.invalidateTerrain()
  paused = false
  speed = 1
  elapsed = 0
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
      restart()
      break
  }
}

window.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case '1':
    case '2':
    case '3':
    case '4': {
      const towerId = TOWER_ORDER[Number(event.key) - 1]
      if (towerId) game.selectBuild(game.selectedBuildId === towerId ? null : towerId)
      break
    }
    case 'escape':
      game.selectBuild(null)
      game.selectedTower = null
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
      restart()
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
  __tileSize: TILE_SIZE,
})
