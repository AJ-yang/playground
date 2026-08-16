import * as THREE from 'three'
import { GameLoop } from '../core/loop'
import { STAGES, type StageDef } from '../data/stages'
import { TARGET_PRIORITY_ORDER } from '../game/types'
import { TOWER_ORDER } from '../data/towers'
import { Game, TILE_SIZE } from '../game/Game'
import { Progress, browserStorage } from '../game/Progress'
import { Actors } from './Actors'
import { Aimer, type AimResult } from './aim'
import { BuildCursor } from './BuildCursor'
import { Hud } from './Hud'
import { Minimap } from './Minimap'
import { Player } from './Player'
import { World } from './World'
import { C } from './palette3d'
import { PX_TO_M } from './coords'

/**
 * 1인칭 전장 — 3D 모드의 진입점.
 *
 * **시뮬레이션은 한 줄도 새로 쓰지 않았다.** `Game`·`Enemy`·`Tower`·
 * `WaveManager`는 2D가 쓰던 것 그대로이고, 여기서 하는 일은 그 상태를 3D로
 * 비추고 입력을 같은 명령 메서드(tryBuild/upgradeTower/...)로 돌려보내는 것뿐이다.
 * 그래서 헤드리스 밸런스 시뮬레이터가 검증한 수치가 이 화면에서도 정확히 같은
 * 판을 만든다 — 3D는 **보는 방식**이지 다른 게임이 아니다.
 *
 * 1인칭이 바꾸는 것은 딱 하나, **정보의 양**이다. 맵 전체가 한눈에 안 들어오는
 * 대신 발밑과 눈앞이 자세해진다. 그 손실을 메우려고 미니맵과 사거리 원을 뒀고,
 * 그 이득을 살리려고 손이 닿는 거리 안에서만 지을 수 있게 했다.
 */

const canvas = document.getElementById('scene') as HTMLCanvasElement | null
if (!canvas) throw new Error('#scene 캔버스를 찾을 수 없습니다')
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement | null
if (!minimapCanvas) throw new Error('#minimap 캔버스를 찾을 수 없습니다')

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(C.fog, 30, 190)

const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 600)
camera.rotation.order = 'YXZ'

const progress = new Progress(browserStorage())
const SENS_KEY = 'joseon-defense/fps/sensitivity'

// ────────────────────────────── 판의 상태 ──────────────────────────────

let stage: StageDef = progress.nextStage() ?? STAGES[0]!
let game = new Game(stage, { availableTowers: progress.unlockedTowers(), hpScale: progress.hpScale })

// 아래 넷은 스테이지마다 통째로 다시 세운다. mountWorld()가 유일한 생성 창구다.
let world!: World
let actors!: Actors
let cursor!: BuildCursor
let aimer!: Aimer
let minimap!: Minimap

let aim: AimResult = { kind: 'none' }
/** 'play'일 때만 시간이 흐른다. */
let screen: 'select' | 'play' | 'menu' | 'result' = 'select'
let elapsed = 0
let resultRecorded = false
let showAllRanges = false
/** Tab을 누르고 있는 동안 뜨는 전황판 */
let showStages = false

const player = new Player(
  camera,
  () => world.frame,
  {
    solidTile: (col, row) => isSolidTile(col, row),
    crowd: () => crowdNearPlayer(),
  },
)

const hud = new Hud({
  startStage: (target) => startStage(target),
  setDifficulty: (id) => {
    progress.setDifficulty(id)
    hud.renderSelect(progress)
  },
  resetProgress: () => {
    progress.reset()
    hud.renderSelect(progress)
  },
  resume: () => requestLock(),
  restart: () => startStage(stage),
  toSelect: () => toSelect(),
  nextStage: () => {
    const next = nextStage()
    if (next) startStage(next)
  },
  setSensitivity: (value) => {
    player.sensitivity = value / 10000
    try {
      window.localStorage.setItem(SENS_KEY, String(value))
    } catch {
      // 사생활 모드에서는 저장이 막힌다. 이번 판 동안만 적용되면 충분하다.
    }
  },
})

// ────────────────────────────── 세계 만들기 ──────────────────────────────

function mountWorld(): void {
  world?.dispose()
  actors?.dispose()
  cursor?.dispose()
  scene.clear()

  world = new World(game)
  actors = new Actors(world.frame)
  cursor = new BuildCursor(world.frame)
  aimer = new Aimer(world.frame)
  minimap = new Minimap(minimapCanvas!, world.frame)
  scene.add(world.root, actors.root, cursor.root)
}

/**
 * 시작 위치 — **마을 앞**.
 *
 * 지켜야 하는 것을 등지고 오는 쪽을 보게 세운다. 판이 시작되자마자 무엇을
 * 지키는지와 어디서 오는지가 한 화면에 담겨야, 첫 기물을 어디에 놓을지
 * 생각이 곧바로 시작된다. 길 한복판은 피한다 — 첫 웨이브가 몸을 밀고 지나간다.
 */
function placePlayer(): void {
  const path = game.mainPath
  const back = Math.max(0, path.totalLength - TILE_SIZE * 3)
  const point = path.positionAt(back)
  const dir = path.directionAt(back)
  const side = { x: -dir.y, y: dir.x }
  // 카메라는 yaw가 0일 때 -Z를 본다. 적이 오는 쪽(-dir)을 보려면 이 값이다.
  const facing = Math.atan2(dir.x, dir.y)

  for (const offset of [1.6, -1.6, 2.6, -2.6, 0]) {
    const px = {
      x: point.x + side.x * TILE_SIZE * offset,
      y: point.y + side.y * TILE_SIZE * offset,
    }
    const spot = world.frame.toWorld(px)
    const tile = world.frame.tileAt(spot.x, spot.z)
    if (!game.grid.inBounds(tile.col, tile.row)) continue
    if (isSolidTile(tile.col, tile.row)) continue
    player.spawnAt(spot.x, spot.z, facing)
    return
  }
  player.spawnAt(0, 0, facing)
}

function isSolidTile(col: number, row: number): boolean {
  if (!game.grid.inBounds(col, row)) return false
  if (game.grid.kindAt(col, row) === 'blocked') return true
  return game.grid.towerIdAt(col, row) !== undefined
}

const crowdBuffer: Array<{ x: number; z: number; r: number }> = []

/** 몸에 닿을 만큼 가까운 적만 추린다. 마흔 마리를 매 프레임 다 재지 않는다. */
function crowdNearPlayer(): Array<{ x: number; z: number; r: number }> {
  crowdBuffer.length = 0
  for (const enemy of game.enemies) {
    if (enemy.distance < 0) continue
    const x = world.frame.x(enemy.pos.x)
    const z = world.frame.z(enemy.pos.y)
    const dx = x - player.position.x
    const dz = z - player.position.z
    if (dx * dx + dz * dz > 16) continue
    crowdBuffer.push({ x, z, r: enemy.def.radius * PX_TO_M * (enemy.def.boss ? 2.2 : 1.3) })
  }
  return crowdBuffer
}

// ────────────────────────────── 흐름 ──────────────────────────────

function startStage(target: StageDef): void {
  stage = target
  game = new Game(target, { availableTowers: progress.unlockedTowers(), hpScale: progress.hpScale })
  mountWorld()
  placePlayer()
  elapsed = 0
  resultRecorded = false
  showAllRanges = false
  showStages = false
  aim = { kind: 'none' }
  screen = 'play'
  hud.show('lock')
  applyTimeScale()
  requestLock()
}

function toSelect(): void {
  screen = 'select'
  document.exitPointerLock()
  hud.renderSelect(progress)
  hud.show('select')
  applyTimeScale()
}

function nextStage(): StageDef | null {
  const index = STAGES.indexOf(stage)
  const next = STAGES[index + 1]
  return next && progress.isUnlocked(next) ? next : null
}

function requestLock(): void {
  if (screen === 'select') return
  screen = 'play'
  hud.show('lock')
  const result = canvas!.requestPointerLock() as unknown as Promise<void> | undefined
  // 크롬은 잠금을 푼 직후 다시 거는 것을 잠깐 막는다. 실패해도 화면을
  // 클릭하면 되므로 안내만 남기고 넘어간다.
  result?.catch?.(() => hud.notify('화면을 클릭하면 다시 들어갑니다'))
}

function finishIfOver(): void {
  if (!game.isOver || resultRecorded) return
  resultRecorded = true
  const unlocked = game.phase === 'victory' ? progress.completeStage(stage, game.lives) : []
  document.exitPointerLock()
  screen = 'result'
  hud.showResult(game, unlocked, nextStage() !== null)
  applyTimeScale()
}

function applyTimeScale(): void {
  loop.timeScale = screen === 'play' && player.locked ? 1 : 0
}

// ────────────────────────────── 루프 ──────────────────────────────

const loop = new GameLoop({
  update(dt) {
    elapsed += dt
    if (screen !== 'play') return
    player.update(dt)
    game.update(dt)
    finishIfOver()
  },
  render() {
    world.update(elapsed)
    if (screen !== 'select') {
      aim = screen === 'play' ? aimer.aim(camera, game, actors.pickables()) : { kind: 'none' }
      actors.sync(game, camera, elapsed)
      cursor.update(game, aim, showAllRanges)
      hud.update(game, stage, aim)
      hud.updateStagePanel(showStages && screen === 'play', progress, stage, game, elapsed)
      minimap.draw(game, player)
    }
    renderer.render(scene, camera)
  },
})

// ────────────────────────────── 입력 ──────────────────────────────

player.attach(canvas)

document.addEventListener('pointerlockchange', () => {
  if (screen === 'play' || screen === 'menu') {
    // 시선을 잃은 채로 시간이 흐르면 안 된다 — 잠금이 풀리면 곧 메뉴다.
    screen = player.locked ? 'play' : 'menu'
    hud.show(player.locked ? 'play' : 'menu')
  }
  applyTimeScale()
})

canvas.addEventListener('mousedown', (event) => {
  if (screen === 'select' || screen === 'result') return
  if (!player.locked) {
    requestLock()
    return
  }
  if (event.button === 2) {
    game.selectBuild(null)
    game.selectedTower = null
    return
  }
  if (event.button === 0) primaryAction()
})

canvas.addEventListener('contextmenu', (event) => event.preventDefault())
// 잠금 안내 화면은 어디를 눌러도 들어가진다 — 버튼을 찾아 누르게 하지 않는다.
document.getElementById('screen-lock')?.addEventListener('mousedown', () => requestLock())

function primaryAction(): void {
  if (aim.kind === 'build') {
    if (!aim.ok) {
      hud.notify(aim.reason, 'bad')
      return
    }
    const result = game.tryBuild(aim.towerId, aim.col, aim.row)
    if (!result.ok) hud.notify(result.reason, 'bad')
    return
  }
  if (aim.kind === 'tower') {
    game.selectedTower = aim.tower
    game.selectBuild(null)
  }
}

/** F·X·T가 대상으로 삼는 기물 — 겨누는 것이 우선, 없으면 마지막에 고른 것. */
function actionTarget() {
  return aim.kind === 'tower' ? aim.tower : game.selectedTower
}

window.addEventListener('keydown', (event) => {
  if (screen !== 'play' || !player.locked) return

  const digit = Number(event.key)
  if (Number.isInteger(digit) && digit >= 1 && digit <= 8) {
    // 목록에 보이는 순서(해금된 것만)와 숫자키를 맞춘다 — 2D와 같은 규칙이다.
    const menu = TOWER_ORDER.filter((id) => game.canUse(id))
    const towerId = menu[digit - 1]
    if (towerId) game.selectBuild(game.selectedBuildId === towerId ? null : towerId)
    return
  }

  switch (event.code) {
    case 'Space': {
      event.preventDefault()
      if (game.waves.running) {
        hud.notify('이미 교전 중입니다', 'bad')
        break
      }
      const before = game.gold
      game.callNextWave()
      const bonus = Math.floor(game.gold - before)
      hud.notify(bonus > 0 ? `조기 소환 — 보너스 ${bonus}G` : '웨이브 시작', 'good')
      break
    }
    case 'KeyF': {
      const tower = actionTarget()
      if (!tower) break
      const result = game.upgradeTower(tower)
      hud.notify(result.ok ? `${tower.def.name} Lv.${tower.level}` : result.reason, result.ok ? 'good' : 'bad')
      break
    }
    case 'KeyX': {
      const tower = actionTarget()
      if (!tower) break
      const refund = tower.sellValue()
      const name = tower.def.name
      game.sellTower(tower)
      hud.notify(`${name} 철수 — +${refund}G`, 'good')
      break
    }
    case 'KeyT': {
      actionTarget()?.cycleTargetPriority(TARGET_PRIORITY_ORDER)
      break
    }
    case 'KeyR':
      showAllRanges = true
      break
    case 'Tab':
      // 브라우저가 포커스를 옮기지 못하게 막는다. 잠금 중에는 옮길 곳도 없지만,
      // 막지 않으면 HUD 버튼에 포커스 링이 켜지고 그다음 Space가 그 버튼을 누른다.
      event.preventDefault()
      showStages = true
      break
  }
})

window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyR') showAllRanges = false
  if (event.code === 'Tab') {
    event.preventDefault()
    showStages = false
  }
})

// 탭이 뒤로 가면 잠금을 풀어 자동으로 멈춘다. 돌아왔을 때 웨이브가 다 지나가
// 있는 사고를 막는 것은 2D와 같은 규칙이다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.exitPointerLock()
})

function resize(): void {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)

// ────────────────────────────── 시작 ──────────────────────────────

let savedSensitivity = 22
try {
  savedSensitivity = Number(window.localStorage.getItem(SENS_KEY) ?? '22') || 22
} catch {
  // 저장소에 접근할 수 없으면 기본 감도로 시작한다.
}
player.sensitivity = savedSensitivity / 10000
hud.setSensitivityValue(savedSensitivity)

mountWorld()
placePlayer()
resize()
hud.renderSelect(progress)
hud.show('select')
applyTimeScale()
loop.start()

// 개발 편의: 콘솔에서 상태를 들여다볼 수 있게 노출한다.
Object.assign(window as unknown as Record<string, unknown>, {
  __game: () => game,
  __player: () => player,
  __stage: () => stage,
  // 드로우콜·삼각형 수를 콘솔에서 바로 볼 수 있게. 적이 마흔 마리 넘게 깔릴 때
  // 무엇이 비싼지는 추측하지 말고 이걸로 봐야 한다.
  __render: () => renderer.info.render,
})
