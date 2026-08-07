import { DIFFICULTIES } from '../data/difficulty'
import { TOTAL_STAGES } from '../data/stages'
import type { Progress } from '../game/Progress'
import { FONT, PALETTE, roundRect } from '../render/palette'
import { CASTLE_ART, ENEMY_ART, GATE_ART, TOWER_ART, drawArt } from '../render/art'
import { enemySilhouettePath } from '../render/shapes'
import { getEnemyDef } from '../data/enemies'
import { getTowerDef } from '../data/towers'
import type { Layout, UiButton } from './layout'

/**
 * 타이틀 화면.
 *
 * 스테이지 선택 앞에 한 겹을 더 두는 이유는 **난이도를 판이 시작되기 전에
 * 정해야 하기 때문**이다. 스테이지 선택 화면에 난이도를 끼워 넣으면 카드마다
 * 난이도가 다를 수 있다는 인상을 주는데, 실제로는 판 전체에 걸리는 설정이다.
 *
 * 게임을 처음 켠 사람에게 "이건 무엇인가"를 그림 한 장으로 말하는 자리이기도
 * 하다 — 무덤에서 나온 것이 밤길을 따라 마을로 향하고 기물이 그 길을 지킨다는
 * 구도를 배경에 그린다. 규칙 설명 문장보다 이 그림 하나가 빠르다.
 */
export class TitleScreen {
  private buttons: UiButton[] = []

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly layout: Layout,
  ) {}

  get hitAreas(): readonly UiButton[] {
    return this.buttons
  }

  draw(progress: Progress, time: number): void {
    this.buttons = []
    const { ctx, layout } = this

    ctx.fillStyle = PALETTE.bg
    ctx.fillRect(0, 0, layout.width, layout.height)

    this.drawBackdrop(time)

    const cx = layout.width / 2

    // ── 제목
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.textDim
    ctx.letterSpacing = '6px'
    ctx.fillText('경로형 타워디펜스', cx, 88)
    ctx.letterSpacing = '0px'

    ctx.font = '800 62px system-ui, sans-serif'
    ctx.fillStyle = PALETTE.text
    ctx.fillText('조선 방어전', cx, 138)

    ctx.font = FONT.body
    ctx.fillStyle = PALETTE.textMuted
    ctx.fillText('왜구의 노략에서 병자호란까지 — 활과 화약으로 성을 지킨다', cx, 180)

    // ── 난이도
    ctx.font = FONT.label
    ctx.fillStyle = PALETTE.textMuted
    ctx.fillText('난이도', cx, 224)

    ctx.font = FONT.tiny
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText('적의 체력만 달라집니다 — 웨이브 구성과 타워 수치는 동일', cx, 246)

    const cardW = 224
    const cardH = 98
    const gap = 16
    const totalW = DIFFICULTIES.length * cardW + (DIFFICULTIES.length - 1) * gap
    let x = cx - totalW / 2
    const y = 266

    for (const diff of DIFFICULTIES) {
      const active = progress.difficulty === diff.id
      ctx.fillStyle = active ? `${diff.color}22` : 'rgba(255,255,255,0.03)'
      roundRect(ctx, x, y, cardW, cardH, 10)
      ctx.fill()
      ctx.strokeStyle = active ? diff.color : 'rgba(255,255,255,0.09)'
      ctx.lineWidth = active ? 2 : 1
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.font = FONT.big
      ctx.fillStyle = active ? diff.color : PALETTE.textMuted
      ctx.fillText(diff.name, x + cardW / 2, y + 30)

      // 체력 배율을 막대로도 보여준다 — 숫자보다 차이가 빨리 읽힌다.
      const barW = cardW - 56
      const barX = x + 28
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      roundRect(ctx, barX, y + 46, barW, 6, 3)
      ctx.fill()
      ctx.fillStyle = active ? diff.color : 'rgba(255,255,255,0.18)'
      // 1.25배를 막대 가득으로 잡아 세 난이도가 한눈에 비교된다.
      roundRect(ctx, barX, y + 46, barW * Math.min(1, diff.hpScale / 1.25), 6, 3)
      ctx.fill()

      ctx.font = FONT.tiny
      ctx.fillStyle = active ? PALETTE.textMuted : PALETTE.textDim
      ctx.fillText(diff.desc, x + cardW / 2, y + 72)

      this.buttons.push({ id: `difficulty:${diff.id}`, x, y, w: cardW, h: cardH, enabled: true })
      x += cardW + gap
    }

    // ── 시작 버튼
    const started = progress.clearedCount > 0
    this.button({
      id: 'start',
      x: cx - 130,
      y: 388,
      w: 260,
      h: 50,
      label: started ? '이어서 하기' : '게임 시작',
      primary: true,
    })

    ctx.textAlign = 'center'
    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText(
      started
        ? `진행도 ${progress.clearedCount} / ${TOTAL_STAGES} · 보유 기물 ${progress.unlockedTowers().length}종`
        : `스테이지 ${TOTAL_STAGES}개 · 전쟁을 하나씩 넘길 때마다 그 시대의 기물이 열립니다`,
      cx,
      460,
    )

    this.drawRoster(cx, 490)
  }

  /**
   * 배경 — 무덤에서 마을로 이어지는 밤길과 그 위를 지나는 것들.
   *
   * 게임의 한 줄 규칙을 그림으로 말한다. 아주 옅게 깔아 글자를 방해하지 않는다.
   */
  private drawBackdrop(time: number): void {
    const { ctx, layout } = this
    const w = layout.width
    const h = layout.height

    // 위에서 아래로 옅어지는 잔디 바탕
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(31,44,30,0)')
    grad.addColorStop(0.55, 'rgba(31,44,30,0.35)')
    grad.addColorStop(1, 'rgba(31,44,30,0.7)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    const roadY = h - 44

    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = PALETTE.pathBank
    ctx.lineWidth = 44
    ctx.beginPath()
    ctx.moveTo(-20, roadY)
    ctx.lineTo(w + 20, roadY)
    ctx.stroke()
    ctx.strokeStyle = PALETTE.pathOuter
    ctx.lineWidth = 36
    ctx.stroke()
    ctx.strokeStyle = PALETTE.pathInner
    ctx.lineWidth = 24
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = 0.75
    drawArt(ctx, GATE_ART, 84, roadY + 14, 78)
    drawArt(ctx, CASTLE_ART, w - 92, roadY + 16, 92)

    // 길 위를 행진하는 적 — 시간에 따라 천천히 오른쪽으로 흐른다.
    const marchers = ['grunt', 'armored', 'wyvern', 'goblinking', 'sentinel'] as const
    marchers.forEach((id, i) => {
      const def = getEnemyDef(id)
      const span = w - 300
      const t = ((time * 0.05 + i * 0.2) % 1)
      const mx = 150 + t * span
      const r = def.radius
      ctx.fillStyle = 'rgba(8,10,14,0.4)'
      enemySilhouettePath(ctx, def.silhouette, mx, roadY, r * 1.1, 0)
      ctx.fill()
      const art = ENEMY_ART[id]
      if (art) drawArt(ctx, art, mx, roadY, r * 2.5, { color: def.color, accent: def.accent }, false)
    })

    ctx.restore()
  }

  /** 하단의 기물 목록 — 무엇을 모으게 되는지 미리 보여준다. */
  private drawRoster(cx: number, y: number): void {
    const { ctx } = this
    const ids = ['archer', 'mage', 'cannon', 'frost', 'venom']
    const step = 74
    let x = cx - ((ids.length - 1) * step) / 2

    for (const id of ids) {
      const def = getTowerDef(id)
      ctx.globalAlpha = 0.85
      drawArt(ctx, TOWER_ART[id]!, x, y + 22, 44, { color: def.color, accent: def.accent })
      ctx.globalAlpha = 1
      ctx.font = FONT.tiny
      ctx.fillStyle = PALETTE.textDim
      ctx.textAlign = 'center'
      ctx.fillText(def.name, x, y + 38)
      x += step
    }
  }

  private button(opts: {
    id: string
    x: number
    y: number
    w: number
    h: number
    label: string
    primary?: boolean
  }): void {
    const { ctx } = this
    const { x, y, w, h, label, primary } = opts

    ctx.fillStyle = primary ? 'rgba(139,212,80,0.20)' : 'rgba(255,255,255,0.06)'
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.strokeStyle = primary ? 'rgba(139,212,80,0.75)' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = primary ? 1.8 : 1
    ctx.stroke()

    ctx.font = '700 18px system-ui, sans-serif'
    ctx.fillStyle = primary ? PALETTE.good : PALETTE.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)

    this.buttons.push({ id: opts.id, x, y, w, h, enabled: true })
  }
}
