import { STAGES, TOTAL_STAGES, type StageDef } from '../data/stages'
import { TOWER_ORDER, getTowerDef } from '../data/towers'
import type { Progress } from '../game/Progress'
import { FONT, PALETTE, roundRect } from '../render/palette'
import type { Layout, UiButton } from './layout'

/**
 * 스테이지 선택 화면.
 *
 * 여기서 보여줘야 하는 것은 세 가지다 — **어디까지 왔는가, 다음은 어떤 맵인가,
 * 무엇이 열렸는가.** 특히 맵 축소도를 카드에 직접 그리는데, "두 갈래 길"이나
 * "세 방향" 같은 지형 차이는 글로 읽는 것보다 형태로 보는 편이 훨씬 빠르다.
 */
export class StageSelect {
  private buttons: UiButton[] = []

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly layout: Layout,
  ) {}

  get hitAreas(): readonly UiButton[] {
    return this.buttons
  }

  draw(progress: Progress): void {
    this.buttons = []
    const { ctx, layout } = this

    ctx.fillStyle = PALETTE.bg
    ctx.fillRect(0, 0, layout.width, layout.height)

    this.drawHeader(progress)
    this.drawStageCards(progress)
    this.drawUnlockedTowers(progress)
  }

  private drawHeader(progress: Progress): void {
    const { ctx, layout } = this

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText('경로형 타워디펜스', 40, 46)

    ctx.font = FONT.huge
    ctx.fillStyle = PALETTE.text
    ctx.fillText('왕국 방어전', 40, 88)

    ctx.font = FONT.body
    ctx.fillStyle = PALETTE.textMuted
    ctx.fillText('스테이지를 깰 때마다 새 기물이 열립니다', 40, 112)

    // 진행도
    ctx.textAlign = 'right'
    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText('진행도', layout.width - 40, 52)
    ctx.font = FONT.huge
    ctx.fillStyle = PALETTE.gold
    ctx.fillText(`${progress.clearedCount} / ${TOTAL_STAGES}`, layout.width - 40, 88)
    ctx.textAlign = 'left'

    if (progress.clearedCount > 0) {
      this.button({
        id: 'resetProgress',
        x: layout.width - 176,
        y: 100,
        w: 136,
        h: 26,
        label: '진행도 초기화',
        enabled: true,
        subtle: true,
      })
    }
  }

  private drawStageCards(progress: Progress): void {
    const { ctx, layout } = this
    const top = 152
    const gap = 14
    const cardW = (layout.width - 80 - gap * (TOTAL_STAGES - 1)) / TOTAL_STAGES
    const cardH = 326

    STAGES.forEach((stage, i) => {
      const x = 40 + i * (cardW + gap)
      const y = top
      const unlocked = progress.isUnlocked(stage)
      const cleared = progress.isCleared(stage.id)

      ctx.fillStyle = unlocked ? PALETTE.panelBg : 'rgba(255,255,255,0.02)'
      roundRect(ctx, x, y, cardW, cardH, 10)
      ctx.fill()
      ctx.strokeStyle = cleared
        ? 'rgba(139,212,80,0.5)'
        : unlocked
          ? PALETTE.accent
          : PALETTE.panelEdge
      ctx.lineWidth = unlocked ? 1.5 : 1
      ctx.stroke()

      ctx.globalAlpha = unlocked ? 1 : 0.42

      // 번호 + 클리어 표식
      ctx.font = FONT.small
      ctx.fillStyle = PALETTE.textDim
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`STAGE ${stage.index}`, x + 16, y + 24)
      if (cleared) {
        ctx.fillStyle = PALETTE.good
        ctx.textAlign = 'right'
        ctx.fillText('클리어', x + cardW - 16, y + 24)
      }

      // 이름
      ctx.textAlign = 'left'
      ctx.font = FONT.title
      ctx.fillStyle = PALETTE.text
      ctx.fillText(stage.name, x + 16, y + 50)

      // 맵 축소도 — 지형 차이를 형태로 보여준다
      this.drawMapThumbnail(stage, x + 16, y + 68, cardW - 32, 92)

      // 한 줄 소개 (좁은 카드라 두 줄까지 접는다)
      ctx.font = FONT.tiny
      ctx.fillStyle = PALETTE.textMuted
      this.wrapText(stage.subtitle, x + 16, y + 178, cardW - 32, 14)

      // 정보
      ctx.font = FONT.tiny
      ctx.fillStyle = PALETTE.textDim
      const routes = stage.level.routes.length
      ctx.fillText(
        `${stage.waves.length}웨이브 · 경로 ${routes}갈래 · ${stage.startGold}G`,
        x + 16,
        y + 214,
      )

      const best = progress.bestLivesFor(stage.id)
      if (best !== null) {
        ctx.fillStyle = PALETTE.good
        ctx.fillText(`최고 기록 — 생명 ${best} 남김`, x + 16, y + 230)
      }

      // 보상
      if (stage.unlocksTower) {
        const reward = getTowerDef(stage.unlocksTower)
        ctx.fillStyle = reward.color
        roundRect(ctx, x + 16, y + 244, 14, 14, 4)
        ctx.fill()
        ctx.fillStyle = cleared ? PALETTE.textDim : PALETTE.gold
        ctx.font = FONT.tiny
        ctx.fillText(
          cleared ? `${reward.name} 해금됨` : `보상 · ${reward.name}`,
          x + 36,
          y + 251,
        )
      } else {
        ctx.fillStyle = PALETTE.danger
        ctx.font = FONT.tiny
        ctx.fillText('최종 스테이지', x + 16, y + 251)
      }

      ctx.globalAlpha = 1

      // 진입 버튼 / 잠금 안내
      if (unlocked) {
        this.button({
          id: `stage:${stage.id}`,
          x: x + 12,
          y: y + cardH - 44,
          w: cardW - 24,
          h: 34,
          label: cleared ? '다시 도전' : '시작',
          enabled: true,
          primary: !cleared,
        })
      } else {
        const prev = STAGES[i - 1]
        ctx.font = FONT.tiny
        ctx.fillStyle = PALETTE.textDim
        ctx.textAlign = 'center'
        ctx.fillText(
          prev ? `${prev.name} 클리어 필요` : '잠김',
          x + cardW / 2,
          y + cardH - 27,
        )
        ctx.textAlign = 'left'
      }
    })
  }

  /** 맵의 경로를 카드 안에 축소해 그린다. */
  private drawMapThumbnail(stage: StageDef, x: number, y: number, w: number, h: number): void {
    const { ctx } = this
    const { cols, rows, routes, blocked } = stage.level

    ctx.fillStyle = PALETTE.grassA
    roundRect(ctx, x, y, w, h, 5)
    ctx.fill()

    // 격자 비율을 유지하며 카드 안에 맞춘다.
    const scale = Math.min(w / cols, h / rows)
    const ox = x + (w - cols * scale) / 2
    const oy = y + (h - rows * scale) / 2
    const toPx = (t: number) => (t + 0.5) * scale

    ctx.save()
    roundRect(ctx, x, y, w, h, 5)
    ctx.clip()

    ctx.fillStyle = PALETTE.blockedFill
    for (const b of blocked) {
      ctx.fillRect(ox + b.x * scale, oy + b.y * scale, scale, scale)
    }

    const strokeAll = (width: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (const route of routes) {
        ctx.beginPath()
        route.forEach((p, i) => {
          const px = ox + toPx(p.x)
          const py = oy + toPx(p.y)
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        })
        ctx.stroke()
      }
    }
    strokeAll(scale * 0.95, PALETTE.pathOuter)
    strokeAll(scale * 0.55, PALETTE.pathInner)

    // 출발점 표식 — 갈래 수가 한눈에 들어오게
    for (const route of routes) {
      const start = route[0]!
      ctx.fillStyle = PALETTE.danger
      ctx.beginPath()
      ctx.arc(ox + toPx(start.x), oy + toPx(start.y), scale * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }
    const goal = routes[0]![routes[0]!.length - 1]!
    ctx.fillStyle = PALETTE.accent
    ctx.beginPath()
    ctx.arc(ox + toPx(goal.x), oy + toPx(goal.y), scale * 0.7, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    roundRect(ctx, x, y, w, h, 5)
    ctx.stroke()
  }

  private drawUnlockedTowers(progress: Progress): void {
    const { ctx, layout } = this
    const unlocked = progress.unlockedTowers()
    const y = layout.height - 66

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = FONT.label
    ctx.fillStyle = PALETTE.textMuted
    ctx.fillText('보유 기물', 40, y)

    let x = 120
    for (const id of TOWER_ORDER) {
      const def = getTowerDef(id)
      const has = unlocked.includes(id)

      ctx.globalAlpha = has ? 1 : 0.28
      ctx.fillStyle = def.color
      roundRect(ctx, x, y - 13, 26, 26, 6)
      ctx.fill()
      ctx.fillStyle = def.accent
      ctx.beginPath()
      ctx.arc(x + 13, y, 5.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = FONT.body
      ctx.fillStyle = has ? PALETTE.text : PALETTE.textDim
      ctx.fillText(has ? def.name : '???', x + 34, y)
      ctx.globalAlpha = 1

      x += 34 + ctx.measureText(has ? def.name : '???').width + 26
    }
  }

  /** 카드 폭에 맞춰 글자를 접는다. 캔버스에는 자동 줄바꿈이 없다. */
  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const { ctx } = this
    const words = text.split(' ')
    let line = ''
    let cursorY = y

    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cursorY)
        line = word
        cursorY += lineHeight
      } else {
        line = test
      }
    }
    if (line) ctx.fillText(line, x, cursorY)
  }

  private button(opts: {
    id: string
    x: number
    y: number
    w: number
    h: number
    label: string
    enabled: boolean
    primary?: boolean
    subtle?: boolean
  }): void {
    const { ctx } = this
    const { x, y, w, h, label, primary, subtle } = opts

    let fill = 'rgba(255,255,255,0.06)'
    let edge = 'rgba(255,255,255,0.12)'
    let text: string = PALETTE.text
    if (primary) {
      fill = 'rgba(139,212,80,0.20)'
      edge = 'rgba(139,212,80,0.7)'
      text = PALETTE.good
    } else if (subtle) {
      fill = 'transparent'
      edge = 'rgba(255,255,255,0.10)'
      text = PALETTE.textDim
    }

    ctx.fillStyle = fill
    roundRect(ctx, x, y, w, h, 6)
    if (fill !== 'transparent') ctx.fill()
    ctx.strokeStyle = edge
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = FONT.bodyBold
    ctx.fillStyle = text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
    ctx.textAlign = 'left'

    this.buttons.push({ id: opts.id, x, y, w, h, enabled: opts.enabled })
  }
}
