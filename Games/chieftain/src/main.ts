import * as THREE from 'three'
import { GameLoop, MAX_FRAME_TIME } from './core/loop'
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
import { DRAG_SLOP, unitAt, unitsInBox } from './ui/select'
import { Minimap } from './ui/Minimap'

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
const minimapRoot = document.getElementById('minimap')!
const boxEl = document.getElementById('selbox')!

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

/**
 * 미니맵은 판보다 오래 산다.
 *
 * 판이 새로 깔릴 때마다 만들면 캔버스와 이벤트 핸들러가 계속 쌓인다. 하나
 * 만들어 두고 `reset`으로 지형만 갈아 끼운다.
 */
const minimap = new Minimap(
  minimapRoot,
  // 좌클릭 — 조준 중이면 거기 강림하고, 아니면 그쪽으로 화면을 옮긴다.
  (p) => {
    const s = session
    if (!s || s.ended) return
    if (s.aiming) descendAt(s, p)
    else s.cameras.lookAtPoint(p)
  },
  // 우클릭 — 3D 화면과 같다. 고른 부대를 그리로 보낸다.
  (p) => {
    const s = session
    if (!s || s.ended || s.selected.size === 0) return
    s.game.commandUnits(HUMAN, [...s.selected], p)
  },
)

let session: Session | null = null

interface Session {
  game: Game
  ai: Ai
  scene: THREE.Scene
  world: World
  actors: Actors
  cameras: Cameras
  firstPerson: boolean
  /** 강림할 자리를 짚는 중인가. Tab이 켜고 클릭이 끈다. */
  aiming: boolean
  /**
   * 번개가 꽂히고 몸으로 들어가기까지 남은 시간.
   *
   * 0.5초쯤 부감에 붙들어 둔다. 즉시 1인칭으로 갈아타면 **자기가 뭘 했는지
   * 못 본다** — 번개도, 발밑에 켜지는 반경 링도 전부 1인칭 카메라 안쪽에서
   * 벌어지고 끝난다. 강림은 이 게임에서 가장 무거운 한 번이므로 그 장면이
   * 있어야 한다.
   */
  striking: number
  /**
   * 지금 고른 유닛.
   *
   * **`Game` 밖에 산다.** 선택은 판정에 관여하지 않고 화면의 사정일 뿐이라,
   * 여기 두어야 락스텝에서 두 사람이 서로 다른 것을 골라 놓고도 같은 판을
   * 굴린다(GDD 7.2).
   */
  selected: Set<number>
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
    aiming: false,
    striking: 0,
    selected: new Set(),
    keys: new Set(),
    ended: false,
  }
  minimap.reset(game.board.land)
  // 판 밖에서 지켜보는 시작이라 화면이 어디를 봐야 할지가 따로 정해져야
  // 한다. 내 본진이다 — 첫 화면에 내 것이 보여야 무엇을 잃을 수 있는지 안다.
  cameras.lookAtPoint(game.board.anchor(game.players[HUMAN].keepTile))
  resize()
}

// ────────────────────────────────────────────────────────────── 입력

/**
 * 강림은 이제 **두 걸음**이다.
 *
 * `Tab`은 내려가는 것이 아니라 **조준을 켜는 것**이고, 그다음 짚은 자리에
 * 내려간다. 신이 판 밖에 있으므로 "어디에 나타날 것인가"가 없으면 강림이
 * 성립하지 않고, 그 선택 자체가 이 게임에서 가장 무거운 결정이다(GDD 3.2) —
 * 반경을 옮기는 유일한 방법이기 때문이다.
 *
 * 포인터 락은 걸되 **의존하지는 않는다.** 락이 걸리면 시선이 화면 밖으로 안
 * 나가서 제일 좋지만, 샌드박스된 iframe이나 권한을 막아둔 브라우저에서는
 * 요청이 조용히 거절된다. 1인칭 시선은 이 게임의 핵심이라 거기서 죽으면
 * 안 되므로, 락이 없으면 **드래그로 둘러보는 방식**으로 물러선다.
 */
function beginAim(): void {
  const s = session
  if (!s || s.ended || s.firstPerson) return
  const a = s.game.players[HUMAN].avatar
  if (a.descendIn > 0) {
    s.game.note(`아직 내려갈 수 없다 (${a.descendIn.toFixed(1)}초)`, HUMAN)
    return
  }
  s.aiming = true
}

function cancelAim(): void {
  if (session) session.aiming = false
}

/** 짚은 자리에 실제로 내려간다. 못 가는 자리면 조준을 안 끈다. */
function descendAt(s: Session, p: Vec2): void {
  if (!s.game.descend(HUMAN, p)) {
    s.game.note('보이는 땅에만 내려갈 수 있다', HUMAN)
    return
  }
  s.aiming = false
  s.actors.strike(HUMAN, s.game.players[HUMAN].avatar.pos)
  s.cameras.lookAtPoint(s.game.players[HUMAN].avatar.pos)
  s.striking = STRIKE_HOLD
}

/** 번개를 보여 주는 시간(초). */
const STRIKE_HOLD = 0.55

function enterFirstPerson(s: Session): void {
  s.firstPerson = true
  lookDrag = false
  try {
    const r = renderer.domElement.requestPointerLock() as unknown
    if (r instanceof Promise) r.catch(() => {})
  } catch {
    /* 락 없이 간다 */
  }
}

/** 올라간다. 몸이 사라지고 반경도 같이 꺼진다. */
function ascend(): void {
  const s = session
  if (!s || !s.firstPerson) return
  s.firstPerson = false
  // 올라오면 화면은 방금 서 있던 자리에 남는다. 안 그러면 판 어디를 보고
  // 있었는지 잃어버린 채로 부감에 던져진다.
  s.cameras.lookAtPoint(s.game.players[HUMAN].avatar.pos)
  s.game.ascend(HUMAN)
  lookDrag = false
  if (document.pointerLockElement) document.exitPointerLock()
}

/** 마지막으로 본 커서 자리. 조준 원과 가장자리 스크롤이 이걸 따라간다. */
const pointer = { x: innerWidth / 2, y: innerHeight / 2 }

/**
 * 커서가 창 안에 있는가.
 *
 * **가장자리 스크롤에서 이것이 없으면 화면이 영영 흘러간다.** 커서를 창 밖으로
 * 빼거나 다른 창으로 넘어가면 `mousemove`가 끊기는데, 마지막으로 본 자리가
 * 하필 가장자리라 판이 끝까지 밀려 버린다. 나가는 순간을 잡아서 멈춘다.
 */
let pointerIn = true
document.documentElement.addEventListener('mouseleave', () => {
  pointerIn = false
})
document.documentElement.addEventListener('mouseenter', () => {
  pointerIn = true
})

let lookDrag = false
let dragDist = 0

/** 부감에서 왼쪽 버튼을 누른 채 끄는 중인가. 끝나면 상자 안이 선택된다. */
let box: { x0: number; y0: number; x1: number; y1: number } | null = null

addEventListener('keydown', (e) => {
  const s = session
  if (!s) return
  const k = e.key.toLowerCase()
  s.keys.add(k)
  if (e.key === 'Tab') {
    e.preventDefault()
    if (s.firstPerson) ascend()
    else if (s.aiming) cancelAim()
    else beginAim()
    return
  }
  if (k === '1') s.game.enqueue(HUMAN, 'shield')
  if (k === '2') s.game.enqueue(HUMAN, 'axe')
  if (k === '4') s.game.enqueue(HUMAN, 'worker')
  // 3 — 신이 선 자리에 전진 기지. 강림해 있어야만 지을 수 있다.
  if (k === '3') s.game.build(HUMAN)
  if (k === 'escape') {
    if (s.aiming) cancelAim()
    else if (s.firstPerson) ascend()
    else s.selected.clear()
  }
})

addEventListener('keyup', (e) => session?.keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => {
  session?.keys.clear()
  // 다른 창으로 넘어가는 것도 커서가 나간 것과 같다. 알트탭 순간 커서가
  // 가장자리에 있었으면 돌아왔을 때 판이 끝으로 밀려 있다.
  pointerIn = false
})

// 포인터 락이 풀리면(사용자가 Esc를 눌렀거나 창을 벗어났다) 올라온다.
document.addEventListener('pointerlockchange', () => {
  const s = session
  if (!s) return
  if (!document.pointerLockElement && s.firstPerson) {
    s.firstPerson = false
    s.cameras.lookAtPoint(s.game.players[HUMAN].avatar.pos)
    s.game.ascend(HUMAN)
  }
})

addEventListener('mousemove', (e) => {
  const s = session
  if (!s) return
  pointer.x = e.clientX
  pointer.y = e.clientY
  pointerIn = true

  if (box) {
    box.x1 = e.clientX
    box.y1 = e.clientY
    dragDist += Math.abs(e.movementX) + Math.abs(e.movementY)
    drawBox(dragDist >= DRAG_SLOP ? box : null)
    return
  }

  if (!s.firstPerson) return
  const locked = document.pointerLockElement === renderer.domElement
  if (!locked && !lookDrag) return
  if (lookDrag) dragDist += Math.abs(e.movementX) + Math.abs(e.movementY)
  const a = s.game.players[HUMAN].avatar
  a.yaw -= e.movementX * TUNING.lookSensitivity
  s.cameras.addPitch(e.movementY * TUNING.lookSensitivity)
})

addEventListener('mouseup', (e) => {
  const s = session
  if (!s || e.button !== 0) return

  if (box) {
    const b = box
    box = null
    drawBox(null)
    if (s.ended) return
    if (dragDist < DRAG_SLOP) pickOne(s, b.x1, b.y1)
    else pickBox(s, b)
    return
  }

  if (!lookDrag) return
  lookDrag = false
  // 끌지 않고 뗐으면 클릭으로 친다 — 보는 쪽으로 부대를 보낸다.
  if (dragDist < DRAG_SLOP && s.firstPerson && !s.ended) rallyAhead(s)
})

/**
 * 한 놈 고르기.
 *
 * 빈 땅을 짚으면 **선택이 풀린다.** 스타크래프트가 그렇게 하고, 그래야
 * "고른 것이 없다"는 상태를 사람이 손으로 만들 수 있다. Shift를 누르고
 * 있으면 더한다.
 */
function pickOne(s: Session, x: number, y: number): void {
  const id = unitAt(s.game, HUMAN, s.cameras.overhead, s.world.terrain, x, y, viewport())
  if (!s.keys.has('shift')) s.selected.clear()
  if (id >= 0) {
    if (s.selected.has(id)) s.selected.delete(id)
    else s.selected.add(id)
  }
}

function pickBox(s: Session, b: { x0: number; y0: number; x1: number; y1: number }): void {
  const ids = unitsInBox(s.game, HUMAN, s.cameras.overhead, s.world.terrain, b, viewport())
  if (!s.keys.has('shift')) s.selected.clear()
  for (const id of ids) s.selected.add(id)
}

function viewport(): { width: number; height: number } {
  return { width: innerWidth, height: innerHeight }
}

/** 1인칭의 부대 명령 — 보고 있는 앞쪽으로 보낸다. */
function rallyAhead(s: Session): void {
  const a = s.game.players[HUMAN].avatar
  const point = {
    x: a.pos.x + Math.sin(a.yaw) * 14,
    z: a.pos.z + Math.cos(a.yaw) * 14,
  }
  // 골라 둔 부대가 있으면 그놈들만, 없으면 전군을 부른다. 1인칭에서는
  // 유닛을 짚을 수가 없으므로 부감에서 골라 둔 것이 그대로 이어진다.
  if (s.selected.size > 0) s.game.commandUnits(HUMAN, [...s.selected], point)
  else s.game.setRally(HUMAN, point)
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

renderer.domElement.addEventListener('mousedown', (e) => {
  const s = session
  if (!s || s.ended) return

  if (s.firstPerson) {
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

  // ── 부감

  if (s.aiming) {
    // 조준 중에는 두 버튼이 같은 뜻이다 — 왼쪽은 내려가고, 오른쪽은 그만둔다.
    const p = s.cameras.screenToGround(e.clientX, e.clientY, innerWidth, innerHeight)
    if (e.button === 2) cancelAim()
    else if (p) descendAt(s, p)
    return
  }

  if (e.button === 0) {
    // 누른 순간부터 상자다. 안 끌고 떼면 클릭으로 친다(`mouseup`).
    box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }
    dragDist = 0
    return
  }

  if (e.button === 2) {
    /**
     * **모든 이동은 우클릭이다.**
     *
     * 고른 것이 없으면 아무 일도 안 일어난다. 예전에는 우클릭이 아바타를
     * 움직였는데, 신이 판 밖으로 나간 지금 그 명령은 존재하지 않는다.
     */
    if (s.selected.size === 0) return
    const p = s.cameras.screenToGround(e.clientX, e.clientY, innerWidth, innerHeight)
    if (p) s.game.commandUnits(HUMAN, [...s.selected], p)
  }
})

/** 드래그 상자를 화면에 그린다. 3D가 아니라 DOM이라 픽셀에 딱 맞는다. */
function drawBox(b: { x0: number; y0: number; x1: number; y1: number } | null): void {
  if (!b) {
    boxEl.style.display = 'none'
    return
  }
  boxEl.style.display = 'block'
  boxEl.style.left = `${Math.min(b.x0, b.x1)}px`
  boxEl.style.top = `${Math.min(b.y0, b.y1)}px`
  boxEl.style.width = `${Math.abs(b.x1 - b.x0)}px`
  boxEl.style.height = `${Math.abs(b.y1 - b.y0)}px`
}

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
 * 화면 가장자리에서 시점이 밀리기 시작하는 띠의 두께(px).
 *
 * 너무 얇으면 겨냥하다 못 맞히고, 너무 두꺼우면 화면 구석의 유닛을 고르려다
 * 판이 흘러간다. 24px는 커서를 끝까지 밀면 확실히 잡히면서, 구석의 유닛을
 * 클릭할 자리는 남기는 값이다.
 */
const EDGE_PX = 24

/**
 * 가장자리에 얼마나 깊이 들어갔는지에 따라 속도를 정한다.
 *
 * 껐다 켰다 하지 않고 **기울인다** — 띠에 들어서는 순간 최고 속도로 튀면
 * 조준하다 스치기만 해도 판이 확 밀린다. 대신 0에서 시작하면 띠의 바깥쪽이
 * 아무 반응도 없어서 먹통으로 느껴지므로, 0.35에서 출발해 끝에서 1이 된다.
 */
function edgeRamp(t: number): number {
  return 0.35 + 0.65 * Math.min(1, t)
}

/** 미니맵이 차지한 자리. 창 크기가 안 변하면 안 변하므로 재두고 쓴다. */
let minimapRect = minimapRoot.getBoundingClientRect()

/**
 * 커서가 화면 끝에 닿아 있으면 그쪽으로 미는 방향.
 *
 * `panDir`와 같은 부호 규약을 쓴다 — 화면 위쪽이 −z다. 둘은 더해지고, 합이
 * 1을 넘으면 `panOverhead`가 잘라 낸다.
 *
 * **미니맵 위에서는 안 민다.** 미니맵이 오른쪽 아래 구석에 붙어 있어서
 * 가장자리 띠와 그대로 겹친다. 빼 두지 않으면 미니맵을 짚으려고 다가가는 것만으로
 * 판이 대각선으로 흘러가서, 짚으려던 자리가 손 밑에서 도망간다.
 */
function edgeDir(): { x: number; z: number } {
  if (!pointerIn) return { x: 0, z: 0 }
  const { x: px, y: py } = pointer
  if (
    px >= minimapRect.left &&
    px <= minimapRect.right &&
    py >= minimapRect.top &&
    py <= minimapRect.bottom
  ) {
    return { x: 0, z: 0 }
  }

  let x = 0
  let z = 0
  if (px < EDGE_PX) x = -edgeRamp((EDGE_PX - px) / EDGE_PX)
  else if (px > innerWidth - EDGE_PX) x = edgeRamp((px - (innerWidth - EDGE_PX)) / EDGE_PX)
  if (py < EDGE_PX) z = -edgeRamp((EDGE_PX - py) / EDGE_PX)
  else if (py > innerHeight - EDGE_PX) z = edgeRamp((py - (innerHeight - EDGE_PX)) / EDGE_PX)
  return { x, z }
}

/**
 * 부감에서 화면을 미는 방향. 1인칭의 `walkDir`와 같은 키를 쓴다.
 *
 * 같은 키가 시점에 따라 **다른 것을 움직인다** — 1인칭에서는 몸이 가고
 * 부감에서는 화면이 간다. 배울 것이 늘지 않으면서 둘 다 자연스럽다.
 */
function panDir(keys: Set<string>): { x: number; z: number } {
  let x = 0
  let z = 0
  if (keys.has('a') || keys.has('arrowleft')) x -= 1
  if (keys.has('d') || keys.has('arrowright')) x += 1
  if (keys.has('w') || keys.has('arrowup')) z -= 1
  if (keys.has('s') || keys.has('arrowdown')) z += 1
  if (x !== 0 && z !== 0) {
    const k = Math.SQRT1_2
    x *= k
    z *= k
  }
  return { x, z }
}

/**
 * 렌더 프레임 간격을 재는 시계.
 *
 * 시뮬레이션은 고정 1/60초로 돌지만(`GameLoop`), **애니메이션은 실제 프레임
 * 간격으로 돌아야 한다.** 걷는 동작을 고정 스텝에 묶으면 프레임이 밀릴 때
 * 다리가 같이 끊긴다. 판정에 관여하지 않는 값이라 결정론도 안 깨진다.
 */
const renderClock = new THREE.Clock()

/**
 * 이번 프레임 간격. 시뮬레이션과 **같은 상한**에서 자른다.
 *
 * 자르지 않으면 탭을 떠났다 돌아온 첫 프레임의 dt가 몇 초가 되고, 그 한 프레임에
 * 카메라가 판 끝까지 밀린다 — 가장자리 스크롤을 넣은 뒤로는 이게 흔한 일이 된다.
 * 알트탭 하는 순간 커서가 화면 끝에 있는 경우가 많기 때문이다. 걸음 애니메이션도
 * 같은 dt를 쓰므로 한 프레임에 다리가 몇 바퀴 돌던 것이 같이 없어진다.
 */
function frameDelta(): number {
  return Math.min(renderClock.getDelta(), MAX_FRAME_TIME)
}

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
    const dt = frameDelta()

    // 번개가 다 치면 몸으로 들어간다.
    if (s.striking > 0) {
      s.striking -= dt
      if (s.striking <= 0) enterFirstPerson(s)
    }
    const me = s.game.players[HUMAN].avatar
    if (s.firstPerson) {
      s.cameras.placeFirst(me.pos, me.yaw)
    } else {
      /**
       * 부감은 **아무도 안 따라간다.**
       *
       * 신이 판 밖으로 나가면서 따라갈 몸이 없어졌다. WASD로 밀고, 미니맵을
       * 짚어 옮기고, 올라오면 마지막으로 서 있던 자리로 간다 — 판 밖에서
       * 내려다보는 존재에게 맞는 카메라다(GDD 3.2).
       */
      const pan = panDir(s.keys)
      // 판이 끝나면 배너가 화면을 덮는다. 그 위에서 다시 시작 버튼을 누르러
      // 가는 길에 판이 흘러가면 안 된다.
      const edge = s.ended ? { x: 0, z: 0 } : edgeDir()
      s.cameras.panOverhead(pan.x + edge.x, pan.z + edge.z, dt)
    }
    /**
     * 죽은 유닛은 선택에서 빠진다.
     *
     * 안 지우면 하단 패널이 시체를 붙들고 있고, 우클릭이 아무 일도 안 하는
     * 유령 선택이 남는다.
     */
    if (s.selected.size > 0) {
      for (const id of s.selected) {
        if (!s.game.units.some((u) => u.id === id && u.hp > 0)) s.selected.delete(id)
      }
    }
    s.actors.setSelection(s.selected)

    // 조준 원은 커서를 따라간다. 못 내려가는 자리면 붉어진다.
    if (s.aiming) {
      const p = s.cameras.screenToGround(pointer.x, pointer.y, innerWidth, innerHeight)
      s.actors.aimAt(p, !!p && s.game.canDescend(HUMAN, p))
    } else {
      s.actors.aimAt(null, false)
    }

    applyFog(s.scene, s.firstPerson)
    s.world.sync(s.game, HUMAN)
    // 카메라를 먼저 자리잡고 넘긴다 — 체력바가 카메라를 향해 서야 한다.
    s.actors.sync(s.game, HUMAN, s.firstPerson, cam, dt)
    // 걸음 흔들림은 뼈대가 굴린 위상에서 나오므로 sync 뒤에 얹는다.
    if (s.firstPerson) s.cameras.applyFirstBob(s.actors.viewerBob)
    renderer.render(s.scene, cam)
    hud.render(s.game, s.firstPerson, s.selected, s.aiming)
    // 미니맵은 1인칭에서도 그린다. 눈앞만 보이는 시점일수록 판 전체를 보는
    // 눈이 더 필요하고, 강림한 채로 부대를 보낼 수 있다는 것이 강림의 값을
    // 깎지 않는 유일한 방법이다(GDD 3.2).
    minimap.render(
      s.game,
      HUMAN,
      s.firstPerson ? null : { focus: s.cameras.focus, span: s.cameras.span },
    )
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
  // 미니맵은 오른쪽 아래에 붙어 있으므로 창이 바뀌면 자리도 바뀐다. 매 프레임
  // 물어보면 HUD가 방금 갈아엎은 문서를 다시 배치하게 만들어서, 여기서만 잰다.
  minimapRect = minimapRoot.getBoundingClientRect()
}
addEventListener('resize', resize)

start()
resize()
loop.start()
banner.showStart(() => start())
