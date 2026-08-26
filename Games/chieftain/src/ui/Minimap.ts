import {
  COLS,
  MAP_H,
  MAP_W,
  NAV_COLS,
  NAV_ROWS,
  ROWS,
  type Land,
} from '../data/land'
import { TUNING } from '../data/tuning'
import { UNITS } from '../data/units'
import type { Game } from '../game/Game'
import { NEUTRAL, NOBODY, type Side } from '../game/types'
import { C } from '../render/palette'

/**
 * 미니맵.
 *
 * ## 왜 지금 생겼나
 *
 * 판이 아홉 칸이던 시절에는 필요가 없었다. 부감 카메라 하나에 판 전체가
 * 들어왔고, "지금 무슨 일이 어디서 일어나는가"는 그냥 화면을 보면 됐다.
 *
 * 땅이 300×180으로 넓어지면서 그 성질이 깨졌다(GDD 3.3). 카메라는 아바타를
 * 따라 스크롤하고, 한 화면에는 판의 삼분의 일쯤만 들어온다. **판 전체를 보는
 * 눈이 화면에서 사라진 것**이라, 그것을 다시 만들어 주지 않으면 넓은 맵은
 * 그냥 길 잃기 좋은 맵이 된다.
 *
 * ## 무엇을 그리는가
 *
 * 세 층이다. 지형(한 번 굽고 계속 쓴다) → 소유·안개(지역 5×3짜리 그림을
 * 늘려 부드럽게) → 지금 움직이는 것들(유닛·아바타·시야 사각형).
 *
 * ## 조작
 *
 * 3D 화면과 **같은 두 버튼**이다 — 좌클릭은 부대, 우클릭은 나. 여기서만 되는
 * 새 조작을 만들지 않는 것이, 규칙 모르는 사람에게 배울 것을 안 늘리면서
 * 넓은 맵을 쓸 수 있게 하는 유일한 방법이다(GDD 6.5).
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  /** 지형. 판마다 한 번만 굽는다. */
  private terrainLayer: HTMLCanvasElement | null = null
  /** 소유·안개를 지역 해상도로 그려 두고 늘린다. 3D 오버레이와 같은 방식이다. */
  private readonly tintLayer = makeCanvas(COLS, ROWS)
  private readonly fogLayer = makeCanvas(COLS, ROWS)

  private landRef: Land | null = null

  constructor(
    private readonly root: HTMLElement,
    private readonly onRally: (p: { x: number; z: number }) => void,
    private readonly onAvatar: (p: { x: number; z: number }) => void,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.round(W * DPR)
    this.canvas.height = Math.round(H * DPR)
    this.canvas.style.width = `${W}px`
    this.canvas.style.height = `${H}px`
    this.canvas.style.cursor = 'crosshair'
    this.canvas.style.display = 'block'
    this.canvas.style.pointerEvents = 'auto'
    this.root.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('2d 컨텍스트를 못 얻었다')
    this.ctx = ctx
    this.ctx.scale(DPR, DPR)

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const r = this.canvas.getBoundingClientRect()
      const p = {
        x: ((e.clientX - r.left) / r.width - 0.5) * MAP_W,
        z: ((e.clientY - r.top) / r.height - 0.5) * MAP_H,
      }
      if (e.button === 0) this.onRally(p)
      else if (e.button === 2) this.onAvatar(p)
    })
  }

  /** 판이 새로 깔릴 때. 지형을 다시 굽는다. */
  reset(land: Land): void {
    this.landRef = land
    this.terrainLayer = bakeTerrain(land)
  }

  show(on: boolean): void {
    this.root.style.display = on ? 'block' : 'none'
  }

  /**
   * `view`가 null이면 시야 사각형을 안 그린다 — 1인칭일 때다. 그때 화면에
   * 보이는 것은 사각형이 아니라 원뿔이라, 사각형을 그리면 거짓말이 된다.
   */
  render(
    game: Game,
    me: Side,
    view: { focus: { x: number; z: number }; span: number } | null,
  ): void {
    if (this.landRef !== game.board.land) this.reset(game.board.land)
    const g = this.ctx
    g.clearRect(0, 0, W, H)

    // ── 1층 지형
    if (this.terrainLayer) {
      g.imageSmoothingEnabled = true
      g.drawImage(this.terrainLayer, 0, 0, W, H)
    }

    // ── 2층 소유·안개
    paintRegions(this.tintLayer, this.fogLayer, game, me)
    g.globalAlpha = 0.55
    g.drawImage(this.tintLayer, 0, 0, W, H)
    g.globalAlpha = 1
    g.drawImage(this.fogLayer, 0, 0, W, H)

    // ── 3층 지금 움직이는 것들
    const foe = (1 - me) as Side

    for (const b of game.buildings) {
      if (!game.board.at(b.tile).seen[me]) continue
      g.fillStyle = hex(C.side[b.side])
      const p = toScreen(b.pos)
      g.fillRect(p.x - 2, p.y - 2, 4, 4)
    }

    // 본진. 적 본진은 **한 번이라도 본 뒤에** 찍힌다 — 안 그러면 미니맵이
    // 첫 프레임부터 상대 위치를 알려 주고, 탐험이 할 일이 아니게 된다.
    for (const s of [me, foe] as Side[]) {
      const keep = game.players[s].keepTile
      if (s !== me && !game.board.at(keep).seen[me]) continue
      g.strokeStyle = hex(C.side[s])
      g.lineWidth = 1.5
      const q = toScreen(game.board.anchor(keep))
      g.strokeRect(q.x - 3.5, q.y - 3.5, 7, 7)
    }

    for (const u of game.units) {
      if (u.hp <= 0) continue
      if (u.faction !== me && !game.canSee(me, u)) continue
      const p = toScreen(u.pos)
      g.fillStyle =
        u.faction === NEUTRAL ? hex(C.neutral) : hex(C.side[u.faction as Side])
      const r = UNITS[u.kind].civilian ? 1.1 : 1.6
      g.beginPath()
      g.arc(p.x, p.y, r, 0, Math.PI * 2)
      g.fill()
    }

    // 내 지휘 반경. 미니맵에서 **가장 눈에 띄어야 하는 것**이다 — 이 원이
    // 어디 있느냐가 곧 내 전력이 어디 있느냐다(GDD 3.1).
    const a = game.players[me].avatar
    const ap = toScreen(a.pos)
    g.strokeStyle = 'rgba(255, 224, 138, 0.5)'
    g.lineWidth = 1
    g.beginPath()
    g.arc(ap.x, ap.y, (TUNING.commandRadius / MAP_W) * W, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = hex(C.radius)
    g.beginPath()
    g.arc(ap.x, ap.y, 2.6, 0, Math.PI * 2)
    g.fill()

    // 지금 보고 있는 곳. 스크롤하는 카메라는 이게 없으면 자기가 판의 어디를
    // 보는지 알 수가 없다.
    if (view) {
      const vw = (view.span * (innerWidth / innerHeight)) / MAP_W
      const vh = view.span / MAP_H
      const c = toScreen(view.focus)
      g.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      g.lineWidth = 1
      g.strokeRect(c.x - (vw * W) / 2, c.y - (vh * H) / 2, vw * W, vh * H)
    } else {
      // 1인칭 — 어디를 보고 있는지만 짧은 침으로 찍는다.
      g.strokeStyle = hex(C.radius)
      g.lineWidth = 1.4
      g.beginPath()
      g.moveTo(ap.x, ap.y)
      g.lineTo(ap.x + Math.sin(a.yaw) * 9, ap.y + Math.cos(a.yaw) * 9)
      g.stroke()
    }
  }

  dispose(): void {
    this.canvas.remove()
  }
}

const W = 220
const H = Math.round((W * MAP_H) / MAP_W)
const DPR = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2)

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function toScreen(p: { x: number; z: number }): { x: number; y: number } {
  return { x: (p.x / MAP_W + 0.5) * W, y: (p.z / MAP_H + 0.5) * H }
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

/**
 * 지형을 통행 격자 해상도로 한 번 굽는다.
 *
 * 높이는 안 쓴다 — 미니맵에서 필요한 것은 "여기가 땅이냐"뿐이고, 음영을
 * 넣으면 그 위에 얹을 소유색이 안 읽힌다.
 */
function bakeTerrain(land: Land): HTMLCanvasElement {
  const c = makeCanvas(NAV_COLS, NAV_ROWS)
  const g = c.getContext('2d')!
  const img = g.createImageData(NAV_COLS, NAV_ROWS)
  const d = img.data
  for (let i = 0; i < NAV_COLS * NAV_ROWS; i++) {
    const solid = land.walk[i] === 1
    const rgb = solid ? C.grass : C.water
    d[i * 4] = (rgb >> 16) & 0xff
    d[i * 4 + 1] = (rgb >> 8) & 0xff
    d[i * 4 + 2] = rgb & 0xff
    d[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

/** 지역 5×3짜리 두 장. 늘려 그리면 경계가 부드러워진다(3D 오버레이와 같다). */
function paintRegions(
  tint: HTMLCanvasElement,
  fog: HTMLCanvasElement,
  game: Game,
  me: Side,
): void {
  const tg = tint.getContext('2d')!
  const fg = fog.getContext('2d')!
  const ti = tg.createImageData(COLS, ROWS)
  const fi = fg.createImageData(COLS, ROWS)
  const fogRgb = C.fog

  for (const t of game.board.tiles) {
    const i = t.def.id * 4
    const hold = t.hold
    const side: Side = hold >= 0 ? 0 : 1
    const rgb = C.side[side]
    ti.data[i] = (rgb >> 16) & 0xff
    ti.data[i + 1] = (rgb >> 8) & 0xff
    ti.data[i + 2] = rgb & 0xff
    ti.data[i + 3] = Math.round(Math.min(1, Math.abs(hold)) * 255)

    // 한 번도 못 본 곳은 덮는다. 본 적 있으면 지형은 기억한다(GDD 4.1).
    const unseen = !t.seen[me]
    fi.data[i] = (fogRgb >> 16) & 0xff
    fi.data[i + 1] = (fogRgb >> 8) & 0xff
    fi.data[i + 2] = fogRgb & 0xff
    fi.data[i + 3] = unseen ? 235 : game.visible[me].has(t.def.id) ? 0 : 105
    if (t.owner === NOBODY && t.neutral && !t.neutral.cleared && !unseen) {
      // 중립이 살아 있는 곳은 색을 안 얹는다 — 아직 아무의 땅도 아니다.
      ti.data[i + 3] = 0
    }
  }
  tg.putImageData(ti, 0, 0)
  fg.putImageData(fi, 0, 0)
}
