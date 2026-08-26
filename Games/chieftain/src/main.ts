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
import { bakeSky } from './render/sky'
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
renderer.setClearColor(C.skyHorizon)

/**
 * 톤매핑을 켠다.
 *
 * 기본값은 `NoToneMapping`이라 밝은 값이 1에서 그냥 잘린다. 그러면 빛을 받는
 * 면이 전부 같은 밝기로 뭉개져서, 단색 프리미티브가 **페인트칠한 판때기처럼**
 * 보인다. ACES는 그 위쪽을 눌러 계조를 남기므로 같은 지오메트리·같은 조명에도
 * 면이 둥글게 읽힌다. 이 한 줄이 "딱딱하다"의 절반이다.
 */
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15

// 그림자. 아홉 칸 맵이라 태양 하나에 2048 맵 한 장이면 된다(World.buildLights).
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

app.appendChild(renderer.domElement)

/** 하늘은 판이 바뀌어도 그대로다. 한 번 굽고 계속 쓴다. */
const sky = bakeSky()

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
  scene.background = sky
  // 안개 색은 지평선에 맞춘다. 먼 지형이 하늘로 녹아들어야 거리가 생긴다.
  // 거리(near/far)는 매 프레임 시점에 따라 갈아 끼운다 — `applyFog`.
  scene.fog = new THREE.Fog(C.skyHorizon, FOG_OVERHEAD[0], FOG_OVERHEAD[1])

  const world = new World(game, seed, sky)
  const actors = new Actors(game, world.terrain)
  scene.add(world.root, actors.root)

  const cameras = new Cameras(innerWidth / innerHeight, world.terrain)
  /**
   * 시야에 드는 팔은 **카메라에 매단다.** 그래야 시선을 돌려도 손이 따라온다.
   *
   * three는 씬 그래프에 들어 있는 카메라의 자식만 그리므로, 카메라 자체를
   * 씬에 넣어야 한다. 카메라는 그리는 대상이 아니라 아무것도 안 보이지만
   * 자식은 이걸로 살아난다.
   */
  scene.add(cameras.first)
  cameras.first.add(actors.viewArm.root)

  session = {
    game,
    ai: new Ai(game, (1 - HUMAN) as Side),
    scene,
    world,
    actors,
    cameras,
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
 * 포인터 락을 걸되 **의존하지는 않는다.** 락이 걸리면 시선이 화면 밖으로 안
 * 나가서 제일 좋지만, 샌드박스된 iframe이나 권한을 막아둔 브라우저에서는
 * 요청이 조용히 거절된다. 1인칭 시선은 이 게임의 핵심이라 거기서 죽으면
 * 안 되므로, 락이 없으면 **드래그로 둘러보는 방식**으로 물러선다.
 */
function toggleFirstPerson(): void {
  const s = session
  if (!s || s.ended) return
  s.firstPerson = !s.firstPerson
  s.game.setDriving(HUMAN, s.firstPerson)
  lookDrag = false
  if (s.firstPerson) {
    // 거절되면 Promise가 reject되거나 예외가 난다. 어느 쪽이든 삼킨다 —
    // 실패해도 드래그 조작이 살아 있으므로 알릴 것이 없다.
    try {
      const r = renderer.domElement.requestPointerLock() as unknown
      if (r instanceof Promise) r.catch(() => {})
    } catch {
      /* 락 없이 간다 */
    }
  } else if (document.pointerLockElement) {
    document.exitPointerLock()
  }
}

/**
 * 포인터 락이 없을 때 시선을 돌리는 길.
 *
 * 1인칭에서 누른 채 끌면 둘러보고, 끌지 않고 떼면 부대 명령이 된다. 둘을
 * 가르는 것은 **끈 거리**다(`DRAG_SLOP`). 이렇게 겹쳐 두면 조작 안내를 한
 * 줄 더 늘리지 않아도 되고, 규칙 모르는 사람은 그냥 마우스를 움직여 보다가
 * 알아챈다.
 */
let lookDrag = false
let dragDist = 0
const DRAG_SLOP = 6

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
  // 3 — 아바타가 선 자리에 전진 기지. 부감·1인칭 어디서나 같은 키다.
  if (k === '3') s.game.build(HUMAN)
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
  if (!s || !s.firstPerson) return
  const locked = document.pointerLockElement === renderer.domElement
  if (!locked && !lookDrag) return
  if (lookDrag) dragDist += Math.abs(e.movementX) + Math.abs(e.movementY)
  const a = s.game.players[HUMAN].avatar
  a.yaw -= e.movementX * TUNING.lookSensitivity
  s.cameras.addPitch(e.movementY * TUNING.lookSensitivity)
})

addEventListener('mouseup', (e) => {
  const s = session
  if (!s || e.button !== 0 || !lookDrag) return
  lookDrag = false
  // 끌지 않고 뗐으면 클릭으로 친다 — 보는 쪽으로 부대를 보낸다.
  if (dragDist < DRAG_SLOP && s.firstPerson && !s.ended) rallyAhead(s)
})

/** 1인칭의 부대 명령 — 아바타가 보고 있는 앞쪽으로 보낸다. */
function rallyAhead(s: Session): void {
  const a = s.game.players[HUMAN].avatar
  s.game.setRally(HUMAN, {
    x: a.pos.x + Math.sin(a.yaw) * 14,
    z: a.pos.z + Math.cos(a.yaw) * 14,
  })
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

renderer.domElement.addEventListener('mousedown', (e) => {
  const s = session
  if (!s || s.ended) return

  if (s.firstPerson) {
    // 1인칭의 좌클릭 — 보고 있는 쪽으로 부대를 보낸다. 눈으로 본 곳을
    // 가리키는 것이라, 부감에서 칸을 고르는 것과는 다른 감각이 된다.
    if (e.button !== 0) return
    if (document.pointerLockElement === renderer.domElement) {
      rallyAhead(s)
    } else {
      // 락이 없다 — 지금부터 끄는 것은 시선이고, 안 끌고 떼면 명령이다.
      lookDrag = true
      dragDist = 0
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

/** Q·E로 돌 때의 각속도(라디안/초). */
const TURN_RATE = 2.1

/**
 * 렌더 프레임 간격을 재는 시계.
 *
 * 시뮬레이션은 고정 1/60초로 돌지만(`GameLoop`), **애니메이션은 실제 프레임
 * 간격으로 돌아야 한다.** 걷는 동작을 고정 스텝에 묶으면 프레임이 밀릴 때
 * 다리가 같이 끊긴다. 판정에 관여하지 않는 값이라 결정론도 안 깨진다.
 */
const renderClock = new THREE.Clock()

const loop = new GameLoop({
  update(dt) {
    const s = session
    if (!s) return

    if (s.firstPerson) {
      const a = s.game.players[HUMAN].avatar
      // Q·E로도 돌아본다. 마우스가 아예 안 먹는 환경에서의 마지막 길이다.
      if (s.keys.has('q')) a.yaw += TURN_RATE * dt
      if (s.keys.has('e')) a.yaw -= TURN_RATE * dt
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
    const cam = s.firstPerson ? s.cameras.first : s.cameras.overhead
    if (s.firstPerson) {
      const a = s.game.players[HUMAN].avatar
      s.cameras.placeFirst(a.pos, a.yaw)
    }
    applyFog(s.scene, s.firstPerson)
    s.world.sync(s.game, HUMAN)
    // 카메라를 먼저 자리잡고 넘긴다 — 체력바가 카메라를 향해 서야 한다.
    s.actors.sync(s.game, HUMAN, s.firstPerson, cam, renderClock.getDelta())
    // 걸음 흔들림은 뼈대가 굴린 위상에서 나오므로 sync 뒤에 얹는다.
    if (s.firstPerson) s.cameras.applyFirstBob(s.actors.viewerBob)
    renderer.render(s.scene, cam)
    hud.render(s.game, s.firstPerson)
  },
})

/**
 * 안개 거리는 **시점마다 다르다.**
 *
 * 부감 카메라는 판에서 140 넘게 떨어져 있고 1인칭은 판 위에 서 있다. 하나의
 * 거리로 둘을 맞추면 한쪽이 반드시 망가진다 — 부감이 멀쩡하면 1인칭에 안개가
 * 없고, 1인칭이 멀쩡하면 부감에서 맵 전체가 뿌예진다. 그래서 시점이 바뀔 때
 * 거리만 갈아 끼운다. 색은 지평선 하나로 공유한다.
 */
const FOG_OVERHEAD: readonly [number, number] = [170, 400]
const FOG_FIRST: readonly [number, number] = [45, 165]

function applyFog(scene: THREE.Scene, firstPerson: boolean): void {
  const fog = scene.fog as THREE.Fog
  const [near, far] = firstPerson ? FOG_FIRST : FOG_OVERHEAD
  fog.near = near
  fog.far = far
}

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
