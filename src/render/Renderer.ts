import { TILE_SIZE } from '../game/Game'
import type { Game } from '../game/Game'
import type { Enemy } from '../game/Enemy'
import type { Tower } from '../game/Tower'
import { getTowerDef } from '../data/towers'
import type { Layout } from '../ui/layout'
import { FONT, PALETTE, roundRect } from './palette'
import { enemySilhouettePath, enemyWingsPath } from './shapes'

/**
 * 보드 렌더러.
 *
 * 게임 상태를 읽기만 하고 절대 변경하지 않는다. 스프라이트 없이 캔버스
 * 도형만으로 그리므로 에셋 파이프라인 없이 바로 돌아가고, 나중에 이미지를
 * 붙일 때도 이 파일의 draw* 메서드만 교체하면 된다.
 */
export class Renderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly layout: Layout,
  ) {}

  /** 배경 지형은 매 프레임 바뀌지 않으므로 오프스크린에 한 번만 그려 캐시한다. */
  private terrainCache: HTMLCanvasElement | null = null

  /** 맵이 바뀌거나 게임을 다시 시작할 때 호출해 지형 캐시를 버린다. */
  invalidateTerrain(): void {
    this.terrainCache = null
  }

  drawBoard(game: Game, time: number): void {
    const { ctx } = this
    const { board } = this.layout

    ctx.save()
    ctx.translate(board.x, board.y)
    ctx.beginPath()
    ctx.rect(0, 0, board.w, board.h)
    ctx.clip()

    this.drawTerrain(game)
    this.drawPlacementHint(game)
    this.drawRangeCircles(game)
    this.drawTowers(game, time)
    this.drawEnemies(game, time)
    this.drawProjectiles(game)
    this.drawEffects(game)

    ctx.restore()

    // 보드 테두리
    ctx.strokeStyle = PALETTE.boardEdge
    ctx.lineWidth = 2
    roundRect(ctx, board.x - 1, board.y - 1, board.w + 2, board.h + 2, 8)
    ctx.stroke()
  }

  private drawTerrain(game: Game): void {
    if (!this.terrainCache) this.terrainCache = this.buildTerrain(game)
    this.ctx.drawImage(this.terrainCache, 0, 0)
  }

  private buildTerrain(game: Game): HTMLCanvasElement {
    const { board } = this.layout
    const canvas = document.createElement('canvas')
    canvas.width = board.w
    canvas.height = board.h
    const ctx = canvas.getContext('2d')!
    const { grid, path } = game

    // 잔디 체크무늬
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        ctx.fillStyle = (col + row) % 2 === 0 ? PALETTE.grassA : PALETTE.grassB
        ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      }
    }

    // 건설 가능 타일 격자선
    ctx.strokeStyle = PALETTE.grassLine
    ctx.lineWidth = 1
    for (let col = 0; col <= grid.cols; col++) {
      ctx.beginPath()
      ctx.moveTo(col * TILE_SIZE + 0.5, 0)
      ctx.lineTo(col * TILE_SIZE + 0.5, board.h)
      ctx.stroke()
    }
    for (let row = 0; row <= grid.rows; row++) {
      ctx.beginPath()
      ctx.moveTo(0, row * TILE_SIZE + 0.5)
      ctx.lineTo(board.w, row * TILE_SIZE + 0.5)
      ctx.stroke()
    }

    // 경로: 두꺼운 폴리라인 위에 밝은 안쪽 선을 겹쳐 흙길처럼 보이게 한다.
    const stroke = (width: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      path.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
    }
    stroke(TILE_SIZE, PALETTE.pathOuter)
    stroke(TILE_SIZE - 10, PALETTE.pathInner)

    ctx.setLineDash([6, 12])
    stroke(2, PALETTE.pathDash)
    ctx.setLineDash([])

    // 장애물 바위
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.kindAt(col, row) !== 'blocked') continue
        const cx = (col + 0.5) * TILE_SIZE
        const cy = (row + 0.5) * TILE_SIZE
        ctx.fillStyle = PALETTE.blockedFill
        ctx.strokeStyle = PALETTE.blockedEdge
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx - 13, cy + 9)
        ctx.lineTo(cx - 8, cy - 8)
        ctx.lineTo(cx + 3, cy - 12)
        ctx.lineTo(cx + 13, cy + 2)
        ctx.lineTo(cx + 9, cy + 11)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }

    // 출발지 / 목표 표식
    const start = path.positionAt(0)
    const end = path.positionAt(path.totalLength)
    ctx.fillStyle = 'rgba(255,107,107,0.9)'
    ctx.font = FONT.label
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('▶ 적 출현', Math.max(6, start.x + 8), start.y - 26)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(90,169,230,0.95)'
    ctx.fillText('왕성 ◀', Math.min(board.w - 6, end.x - 6), end.y - 26)

    return canvas
  }

  /** 건설 모드일 때 커서 아래 타일의 가/불가를 표시. */
  private drawPlacementHint(game: Game): void {
    const { ctx } = this
    const tile = game.hoverTile
    if (!tile || !game.selectedBuildId) return

    const ok = game.hoverBuildable
    const x = tile.x * TILE_SIZE
    const y = tile.y * TILE_SIZE

    ctx.fillStyle = ok ? PALETTE.validFill : PALETTE.invalidFill
    ctx.strokeStyle = ok ? PALETTE.validEdge : PALETTE.invalidEdge
    ctx.lineWidth = 2
    roundRect(ctx, x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4, 5)
    ctx.fill()
    ctx.stroke()

    // 지어질 타워의 사거리 미리보기
    const def = getTowerDef(game.selectedBuildId)
    const center = { x: x + TILE_SIZE / 2, y: y + TILE_SIZE / 2 }
    this.rangeCircle(center.x, center.y, def.levels[0].range * TILE_SIZE)
  }

  private drawRangeCircles(game: Game): void {
    const selected = game.selectedTower
    if (selected) this.rangeCircle(selected.pos.x, selected.pos.y, selected.rangePx(TILE_SIZE))

    // 건설 모드가 아닐 때 마우스를 올린 타워의 사거리도 보여준다.
    if (!game.selectedBuildId && game.hoverTile) {
      const id = game.grid.towerIdAt(game.hoverTile.x, game.hoverTile.y)
      const hovered = id !== undefined ? game.towers.find((t) => t.id === id) : undefined
      if (hovered && hovered !== selected) {
        this.rangeCircle(hovered.pos.x, hovered.pos.y, hovered.rangePx(TILE_SIZE))
      }
    }
  }

  private rangeCircle(x: number, y: number, radius: number): void {
    const { ctx } = this
    ctx.fillStyle = PALETTE.rangeFill
    ctx.strokeStyle = PALETTE.rangeEdge
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawTowers(game: Game, time: number): void {
    for (const tower of game.towers) this.drawTower(tower, tower === game.selectedTower, time)
  }

  private drawTower(tower: Tower, selected: boolean, time: number): void {
    const { ctx } = this
    const { pos, def } = tower
    const size = TILE_SIZE - 8

    ctx.save()
    ctx.translate(pos.x, pos.y)

    // 받침대
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    roundRect(ctx, -size / 2 + 2, -size / 2 + 4, size, size, 7)
    ctx.fill()

    ctx.fillStyle = def.color
    ctx.strokeStyle = selected ? '#ffffff' : 'rgba(0,0,0,0.45)'
    ctx.lineWidth = selected ? 2 : 1.5
    roundRect(ctx, -size / 2, -size / 2, size, size, 7)
    ctx.fill()
    ctx.stroke()

    // 레벨 표시 — 좌상단 점 개수
    ctx.fillStyle = def.accent
    for (let i = 0; i < tower.level; i++) {
      ctx.beginPath()
      ctx.arc(-size / 2 + 5 + i * 5, -size / 2 + 5, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }

    // 포신 — 발사 직후 뒤로 밀렸다가 돌아온다
    ctx.rotate(tower.turretAngle)
    const recoil = tower.recoil * 3
    ctx.translate(-recoil, 0)
    this.drawTurret(def.shape, def.accent, time)

    ctx.restore()
  }

  private drawTurret(shape: string, accent: string, time: number): void {
    const { ctx } = this
    ctx.fillStyle = accent
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 1.2

    switch (shape) {
      case 'arrow':
        ctx.beginPath()
        ctx.moveTo(14, 0)
        ctx.lineTo(-2, -5)
        ctx.lineTo(-2, 5)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        break

      case 'orb': {
        const pulse = 1 + Math.sin(time * 3) * 0.1
        ctx.beginPath()
        ctx.arc(4, 0, 6 * pulse, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.arc(4, 0, 9 * pulse, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }

      case 'cannon':
        ctx.beginPath()
        ctx.rect(-2, -4.5, 16, 9)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        break

      case 'crystal': {
        const spin = time * 1.2
        ctx.rotate(spin)
        ctx.beginPath()
        ctx.moveTo(0, -9)
        ctx.lineTo(6, 0)
        ctx.lineTo(0, 9)
        ctx.lineTo(-6, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        break
      }
    }
  }

  private drawEnemies(game: Game, time: number): void {
    for (const enemy of game.enemies) {
      if (enemy.distance < 0) continue
      // 쐐기 실루엣과 날개는 진행 방향을 따라야 한다.
      const dir = game.path.directionAt(enemy.distance)
      this.drawEnemy(enemy, Math.atan2(dir.y, dir.x), time)
    }
  }

  private drawEnemy(enemy: Enemy, angle: number, time: number): void {
    const { ctx } = this
    const { pos, def } = enemy
    const r = def.radius

    // 공중 유닛은 그림자를 아래에 깔고 본체를 띄운다. 형태(날개)와 함께
    // 세 겹으로 표시하는 이유는 정지 화면·고배속·색각 이상 어디서도
    // "이건 대포탑이 못 때린다"가 읽혀야 하기 때문이다.
    // 그림자는 공중일 때 더 작고 진하게 — 본체와의 거리를 만든다.
    const lift = def.flying ? 13 : 0
    ctx.fillStyle = def.flying ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(
      pos.x,
      pos.y + r * 0.55,
      r * (def.flying ? 0.6 : 0.85),
      r * (def.flying ? 0.24 : 0.35),
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()

    const bodyY = pos.y - lift
    const hit = enemy.flashTimer > 0

    // 날개 (본체 뒤).
    //
    // 본체와 같은 색·같은 명도로 그리면 실루엣이 하나로 뭉쳐서 "날고 있다"가
    // 안 읽힌다 — 늑대 기수(지상 쐐기)와 와이번(공중 쐐기)이 색으로만 구분되는
    // 상태가 된다. 그래서 밝은 테두리로 본체와 값을 분리하고 폭을 키웠다.
    if (def.flying) {
      const flap = (Math.sin(time * 9 + enemy.id) + 1) / 2
      ctx.save()
      ctx.translate(pos.x, bodyY)
      ctx.rotate(angle + Math.PI / 2)
      enemyWingsPath(ctx, 0, 0, r, flap)
      ctx.fillStyle = hit ? '#ffffff' : def.color
      ctx.globalAlpha = 0.75
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.restore()
    }

    // 본체 실루엣
    ctx.fillStyle = hit ? '#ffffff' : def.color
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = def.silhouette === 'boss' ? 2.5 : 1.5
    enemySilhouettePath(ctx, def.silhouette, pos.x, bodyY, r, angle)
    ctx.fill()
    ctx.stroke()

    // 방어 표식은 실루엣에서 파생시킨다 — 임계값을 따로 두면 실루엣과
    // 어긋난다 (예전에는 마저 45%인 보스에 마법 표식이 안 떴다).
    const sil = def.silhouette
    const showArmor = def.armor > 0 && (sil === 'armored' || sil === 'bulwark' || sil === 'boss')
    const showWard =
      def.magicResist > 0 && (sil === 'warded' || sil === 'bulwark' || sil === 'boss')

    // 장갑 — 같은 실루엣을 안쪽에 한 겹 더
    if (showArmor) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2
      enemySilhouettePath(ctx, sil, pos.x, bodyY, r * 0.62, angle)
      ctx.stroke()
    }
    // 마법 저항 — 점선 오라
    if (showWard) {
      ctx.strokeStyle = 'rgba(206,158,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.arc(pos.x, bodyY, r * 1.32, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // 감속 표식
    if (enemy.isSlowed) {
      ctx.strokeStyle = 'rgba(168,236,255,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pos.x, bodyY, r * 1.55, 0, Math.PI * 2)
      ctx.stroke()
    }

    // HP 바 — 만피일 때는 숨겨서 화면을 덜 어지럽게 한다
    if (enemy.hpRatio < 1) {
      const barW = def.boss ? r * 3 : r * 2
      const barH = def.boss ? 5 : 3
      const bx = pos.x - barW / 2
      // 마름모·보스는 위로 더 뾰족해서 바가 겹친다 — 실루엣 높이만큼 띄운다.
      const topExtent = sil === 'warded' ? r * 1.2 : sil === 'boss' ? r * 1.12 : r
      const by = bodyY - topExtent - barH - (showWard || enemy.isSlowed ? 9 : 4)
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2)
      ctx.fillStyle =
        enemy.hpRatio > 0.5 ? PALETTE.good : enemy.hpRatio > 0.25 ? PALETTE.warn : PALETTE.danger
      ctx.fillRect(bx, by, barW * enemy.hpRatio, barH)
    }
  }

  private drawProjectiles(game: Game): void {
    const { ctx } = this
    for (const p of game.projectiles) {
      if (p.dead) continue
      const { pos, spec, heading } = p

      // 진행 방향으로 짧은 잔상
      ctx.strokeStyle = spec.color
      ctx.globalAlpha = 0.4
      ctx.lineWidth = spec.radius * 1.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(pos.x - heading.x * 9, pos.y - heading.y * 9)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      ctx.globalAlpha = 1

      ctx.fillStyle = spec.color
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, spec.radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawEffects(game: Game): void {
    const { ctx } = this
    const { blasts, particles, texts } = game.effects

    for (const b of blasts) {
      const t = b.age / b.life
      ctx.globalAlpha = (1 - t) * 0.7
      ctx.strokeStyle = b.color
      ctx.lineWidth = 3 * (1 - t) + 1
      ctx.beginPath()
      ctx.arc(b.pos.x, b.pos.y, b.radius * (0.35 + t * 0.85), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    for (const p of particles) {
      const t = p.age / p.life
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = p.color
      ctx.fillRect(p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1

    ctx.font = FONT.bodyBold
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const t of texts) {
      const k = t.age / t.life
      ctx.globalAlpha = 1 - k * k
      ctx.fillStyle = t.color
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 3
      ctx.strokeText(t.text, t.pos.x, t.pos.y)
      ctx.fillText(t.text, t.pos.x, t.pos.y)
    }
    ctx.globalAlpha = 1
  }

  /** 승리/패배 시 보드 위에 덮는 결과 화면. */
  drawGameOver(game: Game): void {
    if (!game.isOver) return
    const { ctx } = this
    const { board } = this.layout
    const win = game.phase === 'victory'

    ctx.save()
    ctx.fillStyle = 'rgba(8,11,16,0.82)'
    ctx.fillRect(board.x, board.y, board.w, board.h)

    const cx = board.x + board.w / 2
    const cy = board.y + board.h / 2

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = FONT.huge
    ctx.fillStyle = win ? PALETTE.good : PALETTE.danger
    ctx.fillText(win ? '왕국을 지켜냈다!' : '왕성이 함락되었다', cx, cy - 52)

    ctx.font = FONT.body
    ctx.fillStyle = PALETTE.textMuted
    const lines = [
      `도달 웨이브 ${Math.min(game.waves.waveNumber, 20)} / 20`,
      `처치 ${game.totalKills} · 유출 ${game.totalLeaked} · 누적 획득 ${game.goldEarned}G`,
      `남은 생명 ${game.lives} · 건설한 타워 ${game.towers.length}`,
    ]
    lines.forEach((line, i) => ctx.fillText(line, cx, cy + 4 + i * 20))

    ctx.font = FONT.label
    ctx.fillStyle = PALETTE.accent
    ctx.fillText('R 키를 눌러 다시 시작', cx, cy + 92)
    ctx.restore()
  }
}
