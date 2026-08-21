import * as THREE from 'three'
import { GameLoop } from './core/loop'
import { norm, type Vec2 } from './core/vec2'
import { TUNING } from './data/tuning'
import { Ai } from './game/Ai'
import { Game } from './game/Game'
import type { Side } from './game/types'
import { Actors } from './render/Actors'
import { Cameras } from './render/Cameras'
import { C } from './render/palette'
import { World } from './render/World'
import { Banner, Hud } from './ui/Hud'

/**
 * 진입점 — 판을 만들고, 입력을 붙이고, 루프를 돌린다.
 *
 * 입력이 여기 모여 있는 이유는 **입력이 곧 이 게임의 주장**이기 때문이다.
 * 부감에서는 마우스 두 버튼이 서로 다른 것을 움직이고(부대 / 나), 1인칭에서는
 * 내 몸이 직접 움직인다. 그 차이가 GDD 3.2의 전부이고, 코드에서도 한 곳에
 * 모여 있어야 손댈 때 균형이 안 깨진다.
 */

const HUMAN: Side = 0

const app = document.getElementById('app')!
const hudRoot = document.getElementById('hud')!
const bannerRoot = document.getElementById('banner')!

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setClearColor(C.sky)
app.appendChild(renderer.domElement)

const hud = new Hud(hudRoot)
const banner = new Banner(bannerRoot)

let session: Session | null = null

interface Session {
  game: Game
  ai: Ai
  scene: THREE.Scene
  world: World
  actors: Actors
  cameras: Cameras
  firstPerson: boolean
  keys: Set<string>
  ended: boolean
}

function start(seed = Math.floor(Math.random() * 0x7fffffff)): void {
  session?.world.dispose()
  session?.actors.dispose()

  const game = new Game({ seed, humanSide: HUMAN })
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(C.sky, 120, 320)

  const world = new World(game, seed)
  const actors = new Actors(game)
  scene.add(world.root, actors.root)

  session = {
    game,
    ai: new Ai(game, (1 - HUMAN) as Side),
    scene,
    world,
    actors,
    cameras: new Cameras(innerWidth / innerHeight),
    firstPerson: false,
    keys: new Set(),
    ended: false,
  }
  resize()
}

// ────────────────────────────────────────────────────────────── 입력

/**
 * 강림·복귀.
 *
 * 1인칭에서는 포인터 락을 건다. 락이 걸려야 시선이 화면 밖으로 안 나가고,
 * 무엇보다 **지금 내가 몸 안에 있다**는 것이 몸으로 느껴진다.
 */
function toggleFirstPerson(): void {
  const s = session
  if (!s || s.ended) return
  s.firstPerson = !s.firstPerson
  s.game.setDriving(HUMAN, s.firstPerson)
  if (s.firstPerson) {
    renderer.domElement.requestPointerLock()
  } else if (document.pointerLockElement) {
    document.exitPointerLock()
  }
}

addEventListener('keydown', (e) => {
  const s = session
  if (!s) return
  const k = e.key.toLowerCase()
  s.keys.add(k)
  if (e.key === 'Tab') {
    e.preventDefault()
    toggleFirstPerson()
    return
  }
  if (k === '1') s.game.enqueue(HUMAN, 'shield')
  if (k === '2') s.game.enqueue(HUMAN, 'axe')
  if (k === 'escape' && s.firstPerson) toggleFirstPerson()
})

addEventListener('keyup', (e) => session?.keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => session?.keys.clear())

// 포인터 락이 풀리면(사용자가 Esc를 눌렀거나 창을 벗어났다) 부감으로 되돌린다.
document.addEventListener('pointerlockchange', () => {
  const s = session
  if (!s) return
  if (!document.pointerLockElement && s.firstPerson) {
    s.firstPerson = false
    s.game.setDriving(HUMAN, false)
  }
})

addEventListener('mousemove', (e) => {
  const s = session
  if (!s || !s.firstPerson || !document.pointerLockElement) return
  const a = s.game.players[HUMAN].avatar
  a.yaw -= e.movementX * TUNING.lookSensitivity
  s.cameras.addPitch(e.movementY * TUNING.lookSensitivity)
})

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

renderer.domElement.addEventListener('mousedown', (e) => {
  const s = session
  if (!s || s.ended) return

  if (s.firstPerson) {
    // 1인칭의 좌클릭 — 보고 있는 쪽으로 부대를 보낸다. 눈으로 본 곳을
    // 가리키는 것이라, 부감에서 칸을 고르는 것과는 다른 감각이 된다.
    if (e.button === 0) {
      const a = s.game.players[HUMAN].avatar
      const ahead = {
        x: a.pos.x + Math.sin(a.yaw) * 14,
        z: a.pos.z + Math.cos(a.yaw) * 14,
      }
      s.game.setRally(HUMAN, ahead)
    }
    return
  }

  const p = s.cameras.screenToGround(e.clientX, e.clientY, innerWidth, innerHeight)
  if (!p) return
  if (e.button === 0) s.game.setRally(HUMAN, p)
  else if (e.button === 2) s.game.commandAvatar(HUMAN, p)
})

// ────────────────────────────────────────────────────────────── 루프

function walkDir(keys: Set<string>, yaw: number): Vec2 {
  let f = 0
  let r = 0
  if (keys.has('w') || keys.has('arrowup')) f += 1
  if (keys.has('s') || keys.has('arrowdown')) f -= 1
  if (keys.has('d') || keys.has('arrowright')) r += 1
  if (keys.has('a') || keys.has('arrowleft')) r -= 1
  if (f === 0 && r === 0) return { x: 0, z: 0 }
  // yaw는 +z를 정면으로 재는 각이다(Game·Actors와 같은 규약).
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  return norm({ x: fx * f + fz * r, z: fz * f - fx * r })
}

const loop = new GameLoop({
  update(dt) {
    const s = session
    if (!s) return

    if (s.firstPerson) {
      const a = s.game.players[HUMAN].avatar
      const dir = walkDir(s.keys, a.yaw)
      if (dir.x !== 0 || dir.z !== 0) s.game.driveAvatar(HUMAN, dir, dt)
    }

    s.ai.update(dt)
    s.game.update(dt)

    if (s.game.phase === 'over' && !s.ended && s.game.endTimer > TUNING.endBannerDelay) {
      s.ended = true
      if (document.pointerLockElement) document.exitPointerLock()
      s.firstPerson = false
      s.actors.revealAll()
      banner.showEnd(s.game, () => start())
    }
  },

  render() {
    const s = session
    if (!s) return
    s.world.sync(s.game, HUMAN)
    s.actors.sync(s.game, HUMAN, s.firstPerson)

    const cam = s.firstPerson ? s.cameras.first : s.cameras.overhead
    if (s.firstPerson) {
      const a = s.game.players[HUMAN].avatar
      s.cameras.placeFirst(a.pos, a.yaw)
    }
    renderer.render(s.scene, cam)
    hud.render(s.game, s.firstPerson)
  },
})

// ────────────────────────────────────────────────────────────── 창

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false)
  session?.cameras.layout(innerWidth / innerHeight)
}
addEventListener('resize', resize)

start()
resize()
loop.start()
banner.showStart(() => start())
