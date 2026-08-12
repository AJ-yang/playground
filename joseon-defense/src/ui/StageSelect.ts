import { STAGES, TOTAL_STAGES, type StageDef } from '../data/stages'
import { TOWER_ORDER, getTowerDef } from '../data/towers'
import type { Progress } from '../game/Progress'
import { FONT, PALETTE, roundRect } from '../render/palette'
import { TOWER_ART, drawArt } from '../render/art'
import { getDifficulty } from '../data/difficulty'
import type { Layout, UiButton } from './layout'

/**
 * 스테이지 선택 화면.
 *
 * 여기서 보여줘야 하는 것은 세 가지다 — **어디까지 왔는가, 다음은 어떤 맵인가,
 * 무엇이 열렸는가.** 특히 맵 축소도를 카드에 직접 그리는데, "갈림길 서낭"이나
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
    ctx.fillText('조선 방어전', 40, 88)

    ctx.font = FONT.body
    ctx.fillStyle = PALETTE.textMuted
    const introW = ctx.measureText('전쟁을 하나씩 넘길 때마다 그 시대의 기물이 열립니다').width
    ctx.fillText('전쟁을 하나씩 넘길 때마다 그 시대의 기물이 열립니다', 40, 112)

    // 난이도 배지 — 판마다 걸리는 설정이라 어느 화면에서도 지금 값이 보여야 한다.
    const diff = getDifficulty(progress.difficulty)
    const badgeX = 40 + introW + 16
    ctx.font = FONT.tiny
    const label = `난이도 ${diff.name} · 적 체력 ${Math.round(diff.hpScale * 100)}%`
    const badgeW = ctx.measureText(label).width + 20
    ctx.fillStyle = `${diff.color}22`
    roundRect(ctx, badgeX, 100, badgeW, 20, 10)
    ctx.fill()
    ctx.strokeStyle = `${diff.color}66`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = diff.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, badgeX + badgeW / 2, 110)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    // 진행도
    ctx.textAlign = 'right'
    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText('진행도', layout.width - 40, 52)
    ctx.font = FONT.huge
    ctx.fillStyle = PALETTE.gold
    ctx.fillText(`${progress.clearedCount} / ${TOTAL_STAGES}`, layout.width - 40, 88)
    ctx.textAlign = 'left'

    this.button({
      id: 'toTitle',
      x: layout.width - 320,
      y: 100,
      w: 130,
      h: 26,
      label: '◀ 타이틀 · 난이도',
      enabled: true,
      subtle: true,
    })

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
    const cardH = 430

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
      this.drawMapThumbnail(stage, x + 16, y + 68, cardW - 32, 150)

      // 잠긴 스테이지는 축소도를 덮고 자물쇠를 올린다. 글자만 흐리게 하면
      // 축소도가 그대로 선명해서 잠금/해금 구분이 거의 안 됐다.
      if (!unlocked) {
        ctx.save()
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(12,16,22,0.68)'
        roundRect(ctx, x + 16, y + 68, cardW - 32, 150, 5)
        ctx.fill()
        this.lockIcon(x + cardW / 2, y + 143, 26, 'rgba(255,255,255,0.42)')
        ctx.restore()
      }

      // 한 줄 소개 (좁은 카드라 두 줄까지 접는다)
      ctx.font = FONT.tiny
      ctx.fillStyle = PALETTE.textMuted
      this.wrapText(stage.subtitle, x + 16, y + 236, cardW - 32, 14)

      // 정보
      ctx.font = FONT.tiny
      ctx.fillStyle = PALETTE.textDim
      const routes = stage.level.routes.length
      ctx.fillText(
        `${stage.waves.length}웨이브 · 경로 ${routes}갈래 · ${stage.startGold}G`,
        x + 16,
        y + 272,
      )

      const best = progress.bestLivesFor(stage.id)
      if (best !== null) {
        ctx.fillStyle = PALETTE.good
        ctx.fillText(`최고 기록 — 생명 ${best} 남김`, x + 16, y + 288)
      }

      // 보상 — 색 사각형이 아니라 실제 타워 그림. 보드에서 보게 될 물건과
      // 카드에서 보는 물건이 같아야 "무엇이 열리는가"가 한 번에 읽힌다.
      if (stage.unlocksTowers.length > 0) {
        // 둘이 열리는 스테이지가 있으므로 가로로 나란히 놓는다.
        let rx = x + 24
        for (const id of stage.unlocksTowers) {
          const reward = getTowerDef(id)
          const art = TOWER_ART[reward.id]
          if (art) drawArt(ctx, art, rx, y + 317, 22, { color: reward.color, accent: reward.accent })
          ctx.fillStyle = cleared ? PALETTE.textDim : PALETTE.gold
          ctx.font = FONT.tiny
          ctx.textBaseline = 'middle'
          ctx.fillText(reward.name, rx + 14, y + 309)
          rx += 16 + ctx.measureText(reward.name).width + 18
        }
        ctx.fillStyle = cleared ? PALETTE.textDim : PALETTE.gold
        ctx.font = FONT.tiny
        ctx.fillText(cleared ? '해금됨' : '보상', x + 16, y + 289)
      } else {
        ctx.fillStyle = PALETTE.danger
        ctx.font = FONT.tiny
        ctx.fillText('최종 스테이지', x + 16, y + 309)
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

  /**
   * 맵의 경로를 카드 안에 축소해 그린다.
   *
   * 보드와 **같은 색**을 쓴다. 예전에는 장애물을 `blockedFill`(푸른 회색)로
   * 칠했는데, 실제 보드에서는 회색 바위와 초록 소나무라 축소도만 보라빛
   * 얼룩처럼 보였다 — 지형이 아니라 렌더 오류로 읽혔다.
   *
   * 출발점·목표는 경로가 보드 가장자리에서 끝나므로 안쪽으로 밀어 그린다.
   * 그러지 않으면 위쪽에서 내려오는 경로(S5의 3번 갈래)는 표식이 잘려
   * 갈래가 하나 없는 것처럼 보인다.
   */
  private drawMapThumbnail(stage: StageDef, x: number, y: number, w: number, h: number): void {
    const { ctx } = this
    const { cols, rows, routes, blocked } = stage.level

    ctx.fillStyle = PALETTE.grassB
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

    // 장애물 — 보드처럼 바위(회색)와 나무(초록)를 섞는다. 좌표에서 결정하므로
    // 같은 맵은 항상 같은 배치가 나온다.
    for (const b of blocked) {
      const isTree = (b.x * 7 + b.y * 13) % 3 === 0
      ctx.fillStyle = isTree ? PALETTE.treeCanopy : PALETTE.rockFill
      ctx.beginPath()
      ctx.ellipse(
        ox + (b.x + 0.5) * scale,
        oy + (b.y + 0.5) * scale,
        scale * 0.34,
        scale * 0.3,
        0,
        0,
        Math.PI * 2,
      )
      ctx.fill()
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
    strokeAll(scale * 1.05, PALETTE.pathBank)
    strokeAll(scale * 0.85, PALETTE.pathOuter)
    strokeAll(scale * 0.45, PALETTE.pathInner)

    // 표식이 잘리지 않게 축소도 안쪽으로 민다.
    const dot = Math.max(2.6, scale * 0.72)
    const inset = (px: number, py: number): [number, number] => [
      Math.min(Math.max(px, x + dot + 1), x + w - dot - 1),
      Math.min(Math.max(py, y + dot + 1), y + h - dot - 1),
    ]

    // 출발점 표식 — 갈래 수가 한눈에 들어오게
    for (const route of routes) {
      const start = route[0]!
      const [sx, sy] = inset(ox + toPx(start.x), oy + toPx(start.y))
      ctx.fillStyle = PALETTE.danger
      ctx.beginPath()
      ctx.arc(sx, sy, dot, 0, Math.PI * 2)
      ctx.fill()
    }
    // 목표는 마을이라 점이 아니라 작은 지붕 실루엣으로 — 출발점과 역할이 다르다.
    const goal = routes[0]![routes[0]!.length - 1]!
    const [gx, gy] = inset(ox + toPx(goal.x), oy + toPx(goal.y))
    const kw = dot * 1.7
    const kh = dot * 1.9
    ctx.fillStyle = PALETTE.accent
    ctx.beginPath()
    // 아래 몸통
    ctx.rect(gx - kw / 2, gy - kh * 0.18, kw, kh * 0.68)
    // 위 톱니 세 개
    ctx.rect(gx - kw / 2, gy - kh * 0.5, kw * 0.28, kh * 0.34)
    ctx.rect(gx - kw * 0.14, gy - kh * 0.5, kw * 0.28, kh * 0.34)
    ctx.rect(gx + kw * 0.22, gy - kh * 0.5, kw * 0.28, kh * 0.34)
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

      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      roundRect(ctx, x, y - 16, 32, 32, 7)
      ctx.fill()

      if (has) {
        const art = TOWER_ART[id]
        if (art) drawArt(ctx, art, x + 16, y + 15, 32, { color: def.color, accent: def.accent })
      } else {
        // 잠긴 칸은 그림 대신 자물쇠 — 실루엣만 보여주면 "이미 있는 것"으로 읽힌다.
        this.lockIcon(x + 16, y, 11, 'rgba(255,255,255,0.3)')
      }

      ctx.font = FONT.body
      ctx.fillStyle = has ? PALETTE.text : PALETTE.textDim
      ctx.textBaseline = 'middle'
      ctx.fillText(has ? def.name : '???', x + 40, y)

      x += 40 + ctx.measureText(has ? def.name : '???').width + 26
    }
  }

  /** 자물쇠 아이콘. 잠금은 흐리게 처리하는 것만으로는 잘 안 읽힌다. */
  private lockIcon(cx: number, cy: number, size: number, color: string): void {
    const { ctx } = this
    const w = size
    const h = size * 0.78
    const bodyTop = cy - h / 2 + size * 0.24

    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.4, size * 0.14)
    ctx.beginPath()
    ctx.arc(cx, bodyTop, w * 0.29, Math.PI, 0)
    ctx.stroke()

    ctx.fillStyle = color
    roundRect(ctx, cx - w / 2, bodyTop, w, h * 0.72, size * 0.16)
    ctx.fill()
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
