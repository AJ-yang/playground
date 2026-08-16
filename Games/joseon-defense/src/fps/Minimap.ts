import type { Game } from '../game/Game'
import { TILE_SIZE } from '../game/Game'
import type { Player } from './Player'
import type { BoardFrame } from './coords'

/**
 * 우상단 미니맵.
 *
 * **1인칭 타워디펜스에서 이것은 장식이 아니라 필수 부품이다.** 눈높이가
 * 사람 키로 내려가는 순간 "적이 어느 갈래로 오고 있는가"와 "내 기물이 어디에
 * 서 있는가"가 통째로 안 보이게 된다. 2D 지휘관 시점이 공짜로 주던 정보라
 * 없으면 판단 자체가 불가능해진다.
 *
 * 대신 **위치와 갈래만** 보여준다. 체력·사거리·타겟팅 같은 것은 여기 넣지
 * 않는다 — 그것까지 읽히면 미니맵만 보고 플레이하게 되어, 걸어 다니며
 * 눈으로 보는 것이 무의미해진다.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly frame: BoardFrame,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('미니맵 2D 컨텍스트를 만들 수 없습니다')
    this.ctx = ctx
  }

  draw(game: Game, player: Player): void {
    const { ctx } = this
    const level = game.stage.level
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr
      this.canvas.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const pad = 4
    const scale = Math.min((w - pad * 2) / level.cols, (h - pad * 2) / level.rows)
    const ox = (w - level.cols * scale) / 2
    const oy = (h - level.rows * scale) / 2
    /** 보드 픽셀 → 미니맵 좌표 */
    const mx = (px: number): number => ox + (px / TILE_SIZE) * scale
    const my = (py: number): number => oy + (py / TILE_SIZE) * scale

    ctx.fillStyle = 'rgba(10,14,20,0.82)'
    ctx.fillRect(0, 0, w, h)

    // 지형 — 지을 수 있는 곳과 막힌 곳
    for (let row = 0; row < level.rows; row++) {
      for (let col = 0; col < level.cols; col++) {
        const kind = game.grid.kindAt(col, row)
        if (kind === 'buildable') continue
        ctx.fillStyle = kind === 'path' ? '#5e4f39' : '#2b3140'
        ctx.fillRect(ox + col * scale, oy + row * scale, scale, scale)
      }
    }

    // 마을(경로의 끝) — 지켜야 하는 곳을 한눈에.
    for (const path of game.paths) {
      const end = path.positionAt(path.totalLength)
      ctx.fillStyle = '#ecd06a'
      ctx.beginPath()
      ctx.arc(mx(end.x), my(end.y), scale * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // 기물
    for (const tower of game.towers) {
      ctx.fillStyle = tower.def.accent
      ctx.fillRect(mx(tower.pos.x) - scale * 0.32, my(tower.pos.y) - scale * 0.32, scale * 0.64, scale * 0.64)
    }

    // 적 — 보스는 크게.
    for (const enemy of game.enemies) {
      if (enemy.distance < 0) continue
      ctx.fillStyle = enemy.def.boss ? '#ff5c5c' : enemy.def.color
      ctx.beginPath()
      ctx.arc(mx(enemy.pos.x), my(enemy.pos.y), scale * (enemy.def.boss ? 0.45 : 0.26), 0, Math.PI * 2)
      ctx.fill()
    }

    // 나 — 삼각형이 바라보는 방향까지 말한다.
    const me = this.frame.toBoardPx(player.position.x, player.position.z)
    const px = mx(me.x)
    const py = my(me.y)
    // 월드에서 yaw=0은 -Z를 본다. 보드 좌표계로 옮기면 -y 방향이다.
    const angle = -player.yaw - Math.PI / 2
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle)
    // 시야각 부채꼴 — 지금 화면에 무엇이 담겨 있는지가 미니맵에서 읽힌다.
    ctx.fillStyle = 'rgba(90,169,230,0.16)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, scale * 5, -0.5, 0.5)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#5a9fd6'
    ctx.beginPath()
    ctx.moveTo(scale * 0.7, 0)
    ctx.lineTo(-scale * 0.4, scale * 0.42)
    ctx.lineTo(-scale * 0.4, -scale * 0.42)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.strokeStyle = 'rgba(230,237,243,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
  }
}
