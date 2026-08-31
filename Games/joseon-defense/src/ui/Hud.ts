import type { Game } from '../game/Game'
import {
  MAX_SLOW,
  TOWER_KIND_DESC,
  TOWER_KIND_LABEL,
  TOWER_ORDER,
  getTowerDef,
  type TowerLevelDef,
} from '../data/towers'
import { getEnemyDef } from '../data/enemies'
import { TARGET_PRIORITY_LABEL, DAMAGE_TYPE_LABEL } from '../game/types'
import { FONT, PALETTE, roundRect } from '../render/palette'
import { enemySilhouettePath } from '../render/shapes'
import { ENEMY_ART, TOWER_ART, drawArt } from '../render/art'
import type { Layout, UiButton } from './layout'
import { NOTICE_LIFE_MS, type ConfirmPrompt, type Notice } from './feedback'
import { modeBanner } from './mode'

const SPEEDS = [1, 2, 3] as const

/** 이번 프레임에 HUD가 알아야 하는 화면 바깥 상태. */
export interface HudView {
  timeScale: number
  paused: boolean
  /** 방금 조작에 대한 응답. 없으면 null. */
  notice: Notice | null
  /** 쪽지 수명 진행도 0~1. 사라질 때 흐려지는 데 쓴다. */
  noticeProgress: number
  /** 열려 있는 확인창. 열려 있는 동안 나머지 조작은 전부 막힌다. */
  confirm: ConfirmPrompt | null
}

/**
 * 상단 HUD·우측 패널·판 위 오버레이(안내 띠·정보창·쪽지·확인창).
 *
 * 그리기와 히트 영역 계산을 한 곳에서 한다. 버튼을 그리면서 좌표를 배열에
 * 쌓아 반환하고, 입력 처리는 그 배열만 보고 판정한다 — 그림과 클릭 영역이
 * 어긋날 수 없는 구조다.
 *
 * **패널의 자리 다툼은 건설 카드가 이긴다.** 예전에는 기물을 하나 세우면
 * 정보창이 카드 목록을 통째로 밀어내서, 다음 기물을 지으려면 먼저 선택을
 * 풀어야 한다는 것을 아무도 알 수 없었다(566골드를 쥔 채로 진 판). 건설은
 * 매 웨이브 반복되는 행동이고 조회는 가끔 하는 일이라, 비키는 쪽은 정보창이다
 * — 정보창은 판 위 기물 옆에 뜬다.
 */
export class Hud {
  private buttons: UiButton[] = []
  /** 확인창이 떠 있는 동안 다른 버튼은 전부 죽는다. */
  private modal = false

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly layout: Layout,
  ) {}

  /** 이번 프레임의 클릭 가능 영역. draw() 직후에 유효하다. */
  get hitAreas(): readonly UiButton[] {
    return this.buttons
  }

  draw(game: Game, view: HudView): void {
    this.buttons = []
    this.modal = view.confirm !== null
    this.drawTopBar(game, view.timeScale, view.paused)
    this.drawPanel(game)
    this.drawModeBanner(game)
    this.drawTowerCard(game)
    this.drawNotice(view)
    if (view.confirm) this.drawConfirm(view.confirm)
  }

  // ────────────────────────────── 상단 바 ──────────────────────────────

  private drawTopBar(game: Game, timeScale: number, paused: boolean): void {
    const { ctx, layout } = this
    const h = layout.hudHeight

    ctx.fillStyle = PALETTE.hudBg
    ctx.fillRect(0, 0, layout.width, h)
    ctx.strokeStyle = PALETTE.hudEdge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h - 0.5)
    ctx.lineTo(layout.width, h - 0.5)
    ctx.stroke()

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    let x = 16
    x = this.drawLives(x, h / 2, game)
    x = this.stat(x, h / 2, '◈', String(game.gold), PALETTE.gold)
    x = this.stat(
      x,
      h / 2,
      '⚑',
      `${Math.min(game.waves.waveNumber, game.waves.totalWaves)} / ${game.waves.totalWaves}`,
      PALETTE.accent,
    )

    // 웨이브 상태 — 준비 중이면 남은 시간, 진행 중이면 스폰 진행률
    const statusX = x + 8
    const statusW = 210
    if (!game.isOver) {
      if (game.waves.running) {
        const { spawned, total } = game.waves.spawnProgress
        this.progressBar(
          statusX,
          h / 2 - 9,
          statusW,
          18,
          total === 0 ? 1 : spawned / total,
          PALETTE.danger,
          `교전 중 · 잔존 ${game.enemies.length}`,
        )
      } else {
        const wave = game.waves.currentWave
        const ratio = 1 - Math.max(0, game.waves.prepRemaining) / wave.prepTime
        this.progressBar(
          statusX,
          h / 2 - 9,
          statusW,
          18,
          ratio,
          PALETTE.good,
          `준비 ${Math.max(0, Math.ceil(game.waves.prepRemaining))}초`,
        )
      }
    }

    // 경고 문구
    const warning = game.waves.currentWave.warning
    if (warning && !game.waves.running && !game.isOver) {
      ctx.font = FONT.small
      ctx.fillStyle = PALETTE.warn
      ctx.textAlign = 'left'
      ctx.fillText(`⚠ ${warning}`, statusX + statusW + 14, h / 2)
    }

    // 우측 컨트롤: [다음 웨이브] [⏸] [1x][2x][3x]
    let rx = layout.width - 16
    for (let i = SPEEDS.length - 1; i >= 0; i--) {
      const speed = SPEEDS[i]!
      const w = 34
      rx -= w
      this.button({
        id: `speed:${speed}`,
        x: rx,
        y: h / 2 - 14,
        w,
        h: 28,
        label: `${speed}x`,
        active: !paused && timeScale === speed,
        enabled: true,
      })
      rx -= 4
    }
    rx -= 4
    const pauseW = 34
    rx -= pauseW
    this.button({
      id: 'pause',
      x: rx,
      y: h / 2 - 14,
      w: pauseW,
      h: 28,
      label: paused ? '▶' : '❚❚',
      hotspotLabel: paused ? '▶ 재개' : '❚❚ 일시정지',
      active: paused,
      enabled: true,
    })

    rx -= 12
    const callW = 128
    rx -= callW
    const canCall = !game.waves.running && !game.isOver
    this.button({
      id: 'nextWave',
      x: rx,
      y: h / 2 - 14,
      w: callW,
      h: 28,
      label: game.isOver ? '게임 종료' : canCall ? '다음 웨이브 ▶' : '웨이브 진행 중',
      enabled: canCall,
      primary: canCall,
    })
  }

  /**
   * 생명 표시. 남을수록 조용하고, 줄어들수록 커지고 붉어지고 맥동한다.
   *
   * 다른 지표(골드·웨이브)와 같은 크기로 나란히 두면 "20 → 19"가 눈에 들어오지
   * 않는다. 위험도에 따라 시각적 무게를 바꿔서, 화면을 안 보고 있어도 주변시로
   * 알아챌 수 있게 했다.
   */
  private drawLives(x: number, y: number, game: Game): number {
    const { ctx } = this
    const danger = game.dangerLevel
    const critical = danger > 0.55
    const pulse = critical ? 0.82 + 0.18 * Math.sin(performance.now() / 1000 * 6) : 1

    // 위험하면 배경에 붉은 알약을 깔아 영역 자체를 강조한다.
    if (danger > 0) {
      ctx.fillStyle = `rgba(255,60,60,${(0.16 * danger * pulse).toFixed(3)})`
      roundRect(ctx, x - 8, y - 15, 78, 30, 15)
      ctx.fill()
      ctx.strokeStyle = `rgba(255,80,80,${(0.5 * danger * pulse).toFixed(3)})`
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    const size = 16 + danger * 6
    ctx.font = `700 ${size.toFixed(0)}px system-ui, sans-serif`
    ctx.fillStyle = danger > 0 ? PALETTE.danger : PALETTE.life
    ctx.globalAlpha = pulse
    ctx.fillText('♥', x, y)
    const iconW = ctx.measureText('♥').width
    ctx.fillStyle = danger > 0.3 ? PALETTE.danger : PALETTE.text
    ctx.fillText(String(game.lives), x + iconW + 6, y)
    const valueW = ctx.measureText(String(game.lives)).width
    ctx.globalAlpha = 1

    return x + iconW + 6 + valueW + 26
  }

  private stat(x: number, y: number, icon: string, value: string, color: string): number {
    const { ctx } = this
    ctx.font = FONT.title
    ctx.fillStyle = color
    ctx.fillText(icon, x, y)
    const iconW = ctx.measureText(icon).width
    ctx.fillStyle = PALETTE.text
    ctx.fillText(value, x + iconW + 6, y)
    return x + iconW + 6 + ctx.measureText(value).width + 22
  }

  private progressBar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    color: string,
    label: string,
  ): void {
    const { ctx } = this
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    roundRect(ctx, x, y, w, h, h / 2)
    ctx.fill()
    ctx.save()
    roundRect(ctx, x, y, w, h, h / 2)
    ctx.clip()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.35
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h)
    ctx.restore()

    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.text
    ctx.textAlign = 'center'
    ctx.fillText(label, x + w / 2, y + h / 2)
    ctx.textAlign = 'left'
  }

  // ────────────────────────────── 우측 패널 ──────────────────────────────

  private drawPanel(game: Game): void {
    const { ctx, layout } = this
    const p = layout.panel

    ctx.fillStyle = PALETTE.panelBg
    roundRect(ctx, p.x, p.y, p.w, p.h, 8)
    ctx.fill()
    ctx.strokeStyle = PALETTE.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()

    // **카드는 절대 자리를 내주지 않는다.** 기물을 골라도, 세워도, 판이
    // 끝나도 목록은 같은 자리에 같은 순서로 남는다. 이 패널이 흔들리지 않는
    // 것 자체가 "언제든 또 지을 수 있다"는 응답이다.
    let y = p.y + 14
    y = this.drawBuildMenu(game, y)
    y += 6
    this.divider(y)
    y += 12
    this.drawWavePreview(game, y)
  }

  /**
   * 결과 화면 버튼 묶음. 보드 위 오버레이에 그린다.
   *
   * 예전에는 우측 패널 맨 아래에 "다시 시작"만 있었고 다음 스테이지로 가는
   * 길은 Q 키뿐이었다 — 한 판을 깬 사람이 다음에 무엇을 눌러야 하는지가
   * 화면에 없었다. 결과를 읽은 시선이 그대로 다음 행동에 닿도록 카드 바로
   * 아래에 놓는다.
   *
   * 그림은 Renderer가, 클릭 영역은 Hud가 소유한다는 경계는 지킨다 — 버튼은
   * 여기서만 만들어져 히트 영역과 절대 어긋나지 않는다.
   */
  drawResultActions(game: Game, hasNextStage: boolean, contentBottom: number): void {
    if (!game.isOver) return
    const { layout } = this
    const board = layout.board
    const win = game.phase === 'victory'

    // Renderer가 알려준 카드 아래에 붙인다.
    const y = contentBottom + 26

    const actions: Array<{ id: string; label: string; primary?: boolean }> = []
    if (win && hasNextStage) actions.push({ id: 'nextStage', label: '다음 스테이지 ▶', primary: true })
    actions.push({ id: 'restart', label: win ? '다시 하기 (R)' : '다시 시작 (R)', primary: !win })
    actions.push({ id: 'toSelect', label: '스테이지 선택 (Q)' })

    const h = 40
    const gap = 10
    const widths = actions.map((a) => (a.primary ? 176 : 148))
    const total = widths.reduce((sum, w) => sum + w, 0) + gap * (actions.length - 1)
    let x = board.x + board.w / 2 - total / 2

    actions.forEach((action, i) => {
      const w = widths[i]!
      this.button({ id: action.id, x, y, w, h, label: action.label, enabled: true, primary: action.primary })
      x += w + gap
    })

    // 전부 깼을 때는 다음이 없다는 사실을 말해 준다.
    if (win && !hasNextStage) {
      const { ctx } = this
      ctx.font = FONT.small
      ctx.fillStyle = PALETTE.gold
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('모든 스테이지를 클리어했습니다', board.x + board.w / 2, y + h + 20)
      ctx.textAlign = 'left'
    }
  }

  private drawBuildMenu(game: Game, startY: number): number {
    const { ctx, layout } = this
    const p = layout.panel

    ctx.font = FONT.label
    ctx.fillStyle = PALETTE.textMuted
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('배치', p.x + 14, startY)
    ctx.textBaseline = 'middle'

    let y = startY + 20

    // 해금된 기물만 노출한다. 잠긴 것을 흐리게 남겨두면 "언젠가 열린다"는
    // 정보는 주지만 준비 단계의 판단을 방해한다 — 스테이지 선택 화면이
    // 이미 해금 현황을 보여주므로 여기서는 쓸 수 있는 것만 보여준다.
    const menu = TOWER_ORDER.filter((id) => game.canUse(id))

    // 여덟 종이 전부 열리면 52px짜리 카드로는 목록만으로 패널이 넘쳐
    // 다음 웨이브 미리보기가 잘린다. 여섯 종을 넘으면 한 줄 소개를 접고
    // 카드를 낮춘다 — 소개는 어차피 기물을 고르면 상세 패널에 다시 나온다.
    const compact = menu.length > 6
    const cardH = compact ? 38 : 52
    // 갈래가 바뀌는 지점에 머리글을 넣는다. 여덟 종이 한 줄로 늘어서 있으면
    // "무엇 중에서 고르는 것인가"가 안 보이는데, 병(사람)·기(무기)·책(장애물)로
    // 갈라 두면 목록을 훑기 전에 성격부터 읽힌다. TOWER_ORDER가 이미 갈래 순으로
    // 정렬돼 있어 여기서는 바뀌는 곳만 짚으면 된다.
    let lastKind: string | null = null

    // 게임이 끝나면 메뉴 전체를 죽인다. 예전에는 패배 화면에서도 초록색
    // 업그레이드 버튼이 그대로 살아 있어 눌릴 것처럼 보였다.
    ctx.globalAlpha = game.isOver ? 0.4 : 1

    menu.forEach((towerId, i) => {
      const def = getTowerDef(towerId)
      const cost = def.levels[0].cost
      const affordable = game.gold >= cost
      const selected = game.selectedBuildId === towerId
      const x = p.x + 12
      const w = p.w - 24

      if (def.kind !== lastKind) {
        lastKind = def.kind
        ctx.globalAlpha = game.isOver ? 0.4 : 0.75
        ctx.font = FONT.tiny
        ctx.fillStyle = PALETTE.textMuted
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        const label = `${TOWER_KIND_LABEL[def.kind]}  ${TOWER_KIND_DESC[def.kind]}`
        ctx.fillText(label, x + 2, y + 7)
        // 머리글 오른쪽으로 옅은 선을 그어 묶음의 시작을 못 박는다
        const lw = ctx.measureText(label).width
        ctx.strokeStyle = 'rgba(255,255,255,0.09)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + lw + 10, y + 7.5)
        ctx.lineTo(x + w, y + 7.5)
        ctx.stroke()
        ctx.globalAlpha = game.isOver ? 0.4 : 1
        y += 17
      }

      ctx.fillStyle = selected ? 'rgba(90,169,230,0.18)' : 'rgba(255,255,255,0.035)'
      roundRect(ctx, x, y, w, cardH, 6)
      ctx.fill()
      ctx.strokeStyle = selected ? PALETTE.accent : 'rgba(255,255,255,0.07)'
      ctx.lineWidth = selected ? 1.6 : 1
      ctx.stroke()

      // 타워 배지 — 보드에 서는 건물 그림을 그대로 축소해 넣는다.
      // 색 사각형만 있던 시절에는 메뉴와 보드가 별개의 언어였다.
      //
      // 배경에 타워 색을 옅게 깐다. 몸체가 같은 계열 색인 기물끼리는
      // 그림만으로는 작은 크기에서 서로 비슷해 보였다.
      const badge = compact ? 24 : 32
      ctx.fillStyle = `${def.color}22`
      roundRect(ctx, x + 8, y + (cardH - badge) / 2, badge, badge, 6)
      ctx.fill()
      const towerArt = TOWER_ART[def.id]
      // 배지 안에 정확히 들어가도록 바닥 기준선을 상자 안쪽에 둔다.
      if (towerArt) {
        drawArt(ctx, towerArt, x + 8 + badge / 2, y + (cardH + badge) / 2 - 1, badge - 2, {
          color: def.color,
          accent: def.accent,
        })
      }

      ctx.globalAlpha = affordable ? 1 : 0.45
      ctx.font = FONT.bodyBold
      ctx.fillStyle = PALETTE.text
      ctx.textAlign = 'left'
      ctx.fillText(`${i + 1}. ${def.name}`, x + 16 + badge, compact ? y + cardH / 2 : y + 17)
      if (!compact) {
        ctx.font = FONT.tiny
        ctx.fillStyle = PALETTE.textDim
        ctx.fillText(def.tagline, x + 48, y + 33)
      }

      ctx.font = FONT.bodyBold
      ctx.fillStyle = affordable ? PALETTE.gold : PALETTE.danger
      ctx.textAlign = 'right'
      ctx.fillText(`${cost}G`, x + w - 10, compact ? y + cardH / 2 : y + 17)
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'

      this.buttons.push({
        id: `build:${towerId}`,
        x,
        y,
        w,
        h: cardH,
        // 골드가 모자라도 **고를 수는 있다.** 고르면 사거리 미리보기가 뜨고
        // 띠가 "골드가 N 부족합니다"를 말해 준다 — 못 고르게 막으면 왜 못
        // 짓는지가 다시 침묵이 된다.
        enabled: this.allow(`build:${towerId}`, !game.isOver),
        payload: towerId,
        // 카드에 실제로 찍히는 두 글자 덩어리("1. 사수"와 "70G")를 그대로 잇는다.
        label: `${i + 1}. ${def.name} ${cost}G`,
      })
      y += cardH + 6
    })

    ctx.globalAlpha = 1
    return y
  }

  /**
   * 선택한 기물의 정보창 — **판 위, 그 기물 옆에** 뜬다.
   *
   * 우측 패널에서 나온 이유는 건설 카드와 자리를 다투지 않기 위해서다(위 클래스
   * 주석). 옮기고 보니 덤이 하나 있었다 — 조회는 "이 기물"에 대한 것이므로
   * 창이 그 기물 옆에 붙는 편이 애초에 옳다. 창과 기물을 잇는 짧은 선을 그어
   * 어느 기물의 것인지 못 박는다.
   *
   * 건설 모드일 때는 그리지 않는다. 기물을 세우면 `Game`이 그 기물을 선택
   * 상태로 두는데, 지을 때마다 창이 튀어나오면 연속 배치를 방해한다.
   */
  private drawTowerCard(game: Game): void {
    const { ctx, layout } = this
    const tower = game.selectedTower
    if (!tower || game.isOver || game.selectedBuildId) return
    const board = layout.board
    const stats = tower.stats

    // 높이는 내용에서 뽑는다 — 감속·중독 줄은 기물마다 있고 없다.
    let rowCount = 4
    if (stats.splashRadius > 0) rowCount++
    if (stats.slowAmount > 0) rowCount += stats.cavalrySlow > 0 ? 2 : 1
    if (stats.poisonDps > 0) rowCount++
    const w = 234
    const h = 26 + 22 + rowCount * 18 + 24 + 34 + 40 + 28 + 26

    const anchorX = board.x + tower.pos.x
    const anchorY = board.y + tower.pos.y
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
    let x = anchorX + 30
    if (x + w > board.x + board.w - 8) x = anchorX - 30 - w
    x = clamp(x, board.x + 8, board.x + board.w - w - 8)
    // 위쪽은 안내 띠(모드 표시)를 피한다.
    const y0 = clamp(anchorY - h / 2, board.y + 52, board.y + board.h - h - 8)

    // 기물과 창을 잇는 선
    ctx.strokeStyle = `${tower.def.accent}99`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(anchorX, anchorY)
    ctx.lineTo(x < anchorX ? x + w : x, clamp(anchorY, y0 + 12, y0 + h - 12))
    ctx.stroke()

    ctx.fillStyle = 'rgba(15,20,29,0.96)'
    roundRect(ctx, x, y0, w, h, 8)
    ctx.fill()
    ctx.strokeStyle = `${tower.def.accent}aa`
    ctx.lineWidth = 1.4
    ctx.stroke()

    this.drawTowerInfo(game, x, y0 + 14, w)
  }

  private drawTowerInfo(game: Game, cardX: number, startY: number, cardW: number): void {
    const { ctx } = this
    const p = { x: cardX, w: cardW }
    const tower = game.selectedTower!
    const stats = tower.stats
    const next = tower.nextStats

    let y = startY
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = FONT.title
    ctx.fillStyle = PALETTE.text
    ctx.fillText(`${tower.def.name} Lv.${tower.level}`, p.x + 14, y + 8)

    // 닫는 길이 화면에 있어야 한다. 우클릭·Esc는 아는 사람만 쓰는 길이다.
    this.button({
      id: 'closeTower',
      x: p.x + p.w - 40,
      y: y - 4,
      w: 26,
      h: 24,
      label: '✕',
      hotspotLabel: '✕ 닫기 (Esc)',
      enabled: true,
    })
    y += 26

    const typeLabel = DAMAGE_TYPE_LABEL[tower.def.damageType]
    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText(`${typeLabel} · ${tower.def.targetsAir ? '보병·기병' : '보병 전용'}`, p.x + 14, y + 6)
    y += 22

    const rows: Array<[string, string, string | null]> = [
      ['공격력', String(stats.damage), next ? String(next.damage) : null],
      ['공격 속도', `${stats.fireRate.toFixed(2)}/s`, next ? `${next.fireRate.toFixed(2)}/s` : null],
      ['DPS', (stats.damage * stats.fireRate).toFixed(1), next ? (next.damage * next.fireRate).toFixed(1) : null],
      ['사거리', `${stats.range.toFixed(1)}칸`, next ? `${next.range.toFixed(1)}칸` : null],
    ]
    if (stats.splashRadius > 0) {
      rows.push([
        '폭발 범위',
        `${stats.splashRadius.toFixed(2)}칸`,
        next ? `${next.splashRadius.toFixed(2)}칸` : null,
      ])
    }
    if (stats.slowAmount > 0) {
      rows.push([
        '감속',
        `-${Math.round(stats.slowAmount * 100)}% / ${stats.slowDuration.toFixed(1)}s`,
        next ? `-${Math.round(next.slowAmount * 100)}%` : null,
      ])
      // 기마 감속은 이 기물을 언제 짓느냐를 가르는 수치라 따로 보여준다.
      if (stats.cavalrySlow > 0) {
        const cav = (s: TowerLevelDef) => Math.round(Math.min(MAX_SLOW, s.slowAmount + s.cavalrySlow) * 100)
        rows.push(['└ 기마에는', `-${cav(stats)}%`, next ? `-${cav(next)}%` : null])
      }
    }
    if (stats.poisonDps > 0) {
      rows.push([
        '중독',
        `${stats.poisonDps}/s × ${stats.poisonDuration.toFixed(1)}s`,
        next ? `${next.poisonDps}/s` : null,
      ])
    }

    ctx.font = FONT.small
    for (const [label, value, upgraded] of rows) {
      ctx.fillStyle = PALETTE.textDim
      ctx.textAlign = 'left'
      ctx.fillText(label, p.x + 14, y + 6)
      ctx.textAlign = 'right'
      ctx.fillStyle = PALETTE.text
      if (upgraded && upgraded !== value) {
        const arrowX = p.x + p.w - 14
        ctx.fillStyle = PALETTE.good
        ctx.fillText(upgraded, arrowX, y + 6)
        const upW = ctx.measureText(upgraded).width
        ctx.fillStyle = PALETTE.textDim
        ctx.fillText('→', arrowX - upW - 6, y + 6)
        const arrowW = ctx.measureText('→').width
        ctx.fillStyle = PALETTE.text
        ctx.fillText(value, arrowX - upW - arrowW - 12, y + 6)
      } else {
        ctx.fillText(value, p.x + p.w - 14, y + 6)
      }
      y += 18
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = PALETTE.textDim
    ctx.font = FONT.tiny
    ctx.fillText(`처치 ${tower.kills} · 누적 딜 ${Math.round(tower.damageDealt)}`, p.x + 14, y + 8)
    y += 24

    // 타겟팅
    this.button({
      id: 'targeting',
      x: p.x + 12,
      y,
      w: p.w - 24,
      h: 28,
      label: `타겟팅: ${TARGET_PRIORITY_LABEL[tower.targetPriority]}`,
      enabled: !game.isOver,
    })
    y += 34

    // 업그레이드
    const upgradeCost = tower.upgradeCost
    this.button({
      id: 'upgrade',
      x: p.x + 12,
      y,
      w: p.w - 24,
      h: 34,
      label: upgradeCost === null ? '최대 레벨' : `강화  ${upgradeCost}G`,
      enabled: !game.isOver && upgradeCost !== null && game.gold >= upgradeCost,
      primary: !game.isOver && upgradeCost !== null && game.gold >= upgradeCost,
    })
    y += 40

    // 철수
    this.button({
      id: 'sell',
      x: p.x + 12,
      y,
      w: p.w - 24,
      h: 28,
      label: `철수  +${tower.sellValue()}G`,
      enabled: !game.isOver,
      danger: true,
    })
  }

  private drawWavePreview(game: Game, startY: number): number {
    const { ctx, layout } = this
    const p = layout.panel
    const wave = game.waves.currentWave

    let y = startY
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = FONT.label
    ctx.fillStyle = PALETTE.textMuted
    ctx.fillText(`웨이브 ${wave.id} 구성`, p.x + 14, y)
    ctx.textBaseline = 'middle'
    y += 22

    // 같은 종류를 합쳐 보여준다
    const counts = new Map<string, number>()
    for (const g of wave.groups) counts.set(g.enemy, (counts.get(g.enemy) ?? 0) + g.count)

    for (const [enemyId, count] of counts) {
      const def = getEnemyDef(enemyId)

      // 보드와 **같은 그림**을 쓴다 — 미리보기가 곧 범례가 되도록.
      // 뒤의 어두운 실루엣까지 그대로 깔아야 형태 규칙이 패널에서도 성립한다.
      const art = ENEMY_ART[def.id]
      ctx.fillStyle = 'rgba(8,10,14,0.5)'
      enemySilhouettePath(ctx, def.silhouette, p.x + 22, y + 8, 7)
      ctx.fill()
      if (art) {
        drawArt(ctx, art, p.x + 22, y + 8, 17, { color: def.color, accent: def.accent }, false)
      } else {
        ctx.fillStyle = def.color
        enemySilhouettePath(ctx, def.silhouette, p.x + 22, y + 8, 6.5)
        ctx.fill()
      }
      if (def.flying) {
        // 기마는 형태가 아니라 부가 표식이므로 작은 먼지 힌트만 붙인다.
        ctx.strokeStyle = def.color
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(p.x + 12, y + 5)
        ctx.lineTo(p.x + 15.5, y + 8)
        ctx.moveTo(p.x + 32, y + 5)
        ctx.lineTo(p.x + 28.5, y + 8)
        ctx.stroke()
      }

      ctx.font = FONT.body
      ctx.fillStyle = PALETTE.text
      ctx.textAlign = 'left'
      ctx.fillText(def.name, p.x + 36, y + 8)
      ctx.textAlign = 'right'
      ctx.fillStyle = PALETTE.textDim
      ctx.fillText(`×${count}`, p.x + p.w - 14, y + 8)
      y += 17

      // 위협 태그
      // 태그는 실루엣이 나타내는 것과 같은 기준으로 뽑는다.
      // 형태와 글자가 어긋나면 형태를 못 믿게 된다.
      //
      // **글자는 게임이 실제로 쓰는 말이어야 한다.** 세계관을 조선의 전쟁으로
      // 갈면서 공중→기마 / 장갑→갑주 / 마법저항→산개로 개명했는데 이 태그만
      // 옛 이름이 남아, 말 탄 병사에게 「공중」이 붙고 화약밖에 없는 게임에
      // 「마저(마법저항)」가 떴다. 상성을 가르치는 유일한 화면이 게임의 다른
      // 어디에도 없는 단어로 말하고 있었던 셈이다.
      const sil = def.silhouette
      const tags: string[] = []
      if (def.flying) tags.push('기마')
      if (def.armor > 0 && (sil === 'armored' || sil === 'bulwark' || sil === 'boss')) {
        tags.push(`갑주 ${def.armor}`)
      }
      if (def.magicResist > 0 && (sil === 'warded' || sil === 'bulwark' || sil === 'boss')) {
        tags.push(`산개 ${Math.round(def.magicResist * 100)}%`)
      }
      if (sil === 'swift') tags.push('고속')
      if (def.boss) tags.push('보스')
      if (tags.length) {
        ctx.font = FONT.tiny
        ctx.fillStyle = PALETTE.warn
        ctx.textAlign = 'left'
        ctx.fillText(tags.join(' · '), p.x + 36, y + 5)
        y += 15
      }
      y += 4
    }

    ctx.textAlign = 'left'
    ctx.font = FONT.tiny
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText(`클리어 보상 ${wave.reward}G`, p.x + 14, y + 8)
    y += 22

    const hint = game.selectedBuildId
      ? '빈 땅을 클릭해 배치 · Esc 로 취소'
      : game.selectedTower
        ? '정보창은 판 위 기물 옆에 · Esc 닫기'
        : '카드를 고르고 빈 땅을 클릭'
    ctx.fillStyle = PALETTE.textDim
    ctx.font = FONT.tiny
    ctx.fillText(hint, p.x + 14, y + 8)

    return y + 24
  }

  // ────────────────────────────── 판 위 오버레이 ──────────────────────────────

  /**
   * 지금 무슨 모드인가 — **상시** 판 위에 있다.
   *
   * 세 가지가 한 자리에서 갈린다.
   *   - 모드 없음: 안내가 **가장 크다.** 방법을 이미 아는 사람에게만 보이는
   *     안내는 안내가 아니다. 예전에는 "빈 땅을 클릭해 배치"가 병종을 고른
   *     **뒤에야** 떴다.
   *   - 배치 모드: 무엇을 얼마에 놓으려는지 + 취소 버튼. 같은 숫자키가 모드를
   *     끄는 것은 그대로지만, 꺼진 것이 화면에 보인다.
   *   - 조회 모드: 무엇을 보고 있는지 + 닫기 버튼.
   */
  private drawModeBanner(game: Game): void {
    if (game.isOver) return
    const { ctx, layout } = this
    const board = layout.board
    const cx = board.x + board.w / 2
    const top = board.y + 8
    const banner = modeBanner(game)

    if (banner.mode === 'none') {
      const main = banner.title
      const sub = banner.hint
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.font = FONT.title
      const mw = ctx.measureText(main).width
      ctx.font = FONT.small
      const sw = ctx.measureText(sub).width
      const w = Math.max(mw, sw) + 48
      const h = 50
      const x = cx - w / 2
      this.pill(x, top, w, h, 'rgba(90,169,230,0.55)', 'rgba(12,17,25,0.86)')
      ctx.font = FONT.title
      ctx.fillStyle = PALETTE.text
      ctx.fillText(main, cx, top + 18)
      ctx.font = FONT.small
      ctx.fillStyle = PALETTE.accent
      ctx.fillText(sub, cx, top + 36)
      ctx.textAlign = 'left'
      return
    }

    // 모드가 켜져 있을 때는 띠를 낮춰 판을 덜 가린다.
    const h = 32
    const btnW = 92
    const text = banner.title
    const sub = banner.hint
    const accent =
      banner.mode === 'build'
        ? getTowerDef(game.selectedBuildId!).accent
        : game.selectedTower!.def.accent
    const edge = banner.blocked ? 'rgba(255,92,92,0.75)' : `${accent}cc`

    ctx.textBaseline = 'middle'
    ctx.font = FONT.label
    const tw = ctx.measureText(text).width
    ctx.font = FONT.small
    const sw = ctx.measureText(sub).width
    const w = 16 + tw + 10 + sw + 12 + btnW + 12
    const x = cx - w / 2
    this.pill(x, top, w, h, edge, 'rgba(12,17,25,0.86)')

    ctx.textAlign = 'left'
    ctx.font = FONT.label
    ctx.fillStyle = PALETTE.text
    ctx.fillText(text, x + 16, top + h / 2)
    ctx.font = FONT.small
    ctx.fillStyle = banner.blocked ? PALETTE.danger : PALETTE.textMuted
    ctx.fillText(sub, x + 16 + tw + 10, top + h / 2)

    const cancel = banner.cancel!
    this.button({
      id: cancel.id,
      x: x + w - 12 - btnW,
      y: top + 5,
      w: btnW,
      h: h - 10,
      label: cancel.label,
      enabled: true,
    })
  }

  private pill(x: number, y: number, w: number, h: number, edge: string, fill: string): void {
    const { ctx } = this
    ctx.fillStyle = fill
    roundRect(ctx, x, y, w, h, h / 2 > 16 ? 16 : h / 2)
    ctx.fill()
    ctx.strokeStyle = edge
    ctx.lineWidth = 1.4
    ctx.stroke()
  }

  /**
   * 방금 조작에 대한 응답 쪽지 — **그 자리에, 이유와 함께.**
   *
   * 실패한 클릭에 화면이 침묵하던 것이 566골드 사건의 직접 원인이다.
   * 사유 문자열은 `BuildResult`가 이미 만들고 있으므로 여기서는 나르기만 한다.
   */
  private drawNotice(view: HudView): void {
    const notice = view.notice
    if (!notice) return
    const { ctx, layout } = this

    // 마지막 0.5초에만 흐려진다 — 읽을 시간을 먼저 주고 나서 사라진다.
    const fadeFrom = 1 - 500 / NOTICE_LIFE_MS
    const alpha = view.noticeProgress < fadeFrom ? 1 : 1 - (view.noticeProgress - fadeFrom) / (1 - fadeFrom)
    // 뜨자마자 살짝 떠오른다. 같은 사유가 다시 떠도 "새로 떴다"가 읽힌다.
    const rise = Math.max(0, 1 - view.noticeProgress * 6) * 6

    const fail = notice.kind === 'fail'
    const icon = fail ? '✕' : '✓'
    ctx.save()
    ctx.globalAlpha = Math.max(0, alpha)
    ctx.textBaseline = 'middle'
    ctx.font = FONT.bodyBold
    const tw = ctx.measureText(notice.text).width
    const w = tw + 46
    const h = 30

    const board = layout.board
    let x: number
    let y: number
    if (notice.at) {
      x = notice.at.x - w / 2
      y = notice.at.y - 44 - rise
    } else {
      x = board.x + board.w / 2 - w / 2
      y = board.y + 70 - rise
    }
    // 판이 아니라 화면 안으로 가둔다 — 패널의 카드를 눌러 난 사유는 그 카드
    // 옆에 떠야 "이것 때문에 안 됐다"가 이어진다.
    x = Math.min(Math.max(x, 6), layout.width - w - 6)
    y = Math.min(Math.max(y, layout.hudHeight + 6), layout.height - h - 6)

    ctx.fillStyle = fail ? 'rgba(56,16,18,0.95)' : 'rgba(18,34,20,0.95)'
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.strokeStyle = fail ? 'rgba(255,92,92,0.85)' : 'rgba(139,212,80,0.85)'
    ctx.lineWidth = 1.4
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = fail ? PALETTE.danger : PALETTE.good
    ctx.fillText(icon, x + 14, y + h / 2)
    ctx.fillStyle = PALETTE.text
    ctx.fillText(notice.text, x + 32, y + h / 2)
    ctx.restore()
    ctx.textAlign = 'left'
  }

  /**
   * 되돌릴 수 없는 조작 앞의 확인창.
   *
   * 화면 전체를 덮는다 — 이 창이 떠 있는 동안 다른 버튼은 전부 죽으므로
   * (`modal`), 죽은 것이 죽은 것처럼 보여야 한다.
   */
  private drawConfirm(prompt: ConfirmPrompt): void {
    const { ctx, layout } = this
    ctx.fillStyle = 'rgba(6,8,12,0.72)'
    ctx.fillRect(0, 0, layout.width, layout.height)

    const w = 420
    const h = 168
    const x = layout.board.x + layout.board.w / 2 - w / 2
    const y = layout.board.y + layout.board.h / 2 - h / 2

    ctx.fillStyle = 'rgba(15,20,29,0.98)'
    roundRect(ctx, x, y, w, h, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,92,92,0.55)'
    ctx.lineWidth = 1.6
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = FONT.big
    ctx.fillStyle = PALETTE.text
    ctx.fillText(prompt.title, x + w / 2, y + 44)
    ctx.font = FONT.body
    ctx.fillStyle = PALETTE.textMuted
    ctx.fillText(prompt.detail, x + w / 2, y + 74)
    ctx.textAlign = 'left'

    const bw = 176
    const gap = 12
    const by = y + h - 54
    this.button({
      id: 'confirm:no',
      x: x + w / 2 - bw - gap / 2,
      y: by,
      w: bw,
      h: 38,
      label: prompt.cancelLabel,
      enabled: true,
      primary: true,
    })
    this.button({
      id: 'confirm:yes',
      x: x + w / 2 + gap / 2,
      y: by,
      w: bw,
      h: 38,
      label: prompt.confirmLabel,
      enabled: true,
      danger: true,
    })
  }

  private divider(y: number): void {
    const { ctx, layout } = this
    const p = layout.panel
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.x + 12, y + 0.5)
    ctx.lineTo(p.x + p.w - 12, y + 0.5)
    ctx.stroke()
  }

  // ────────────────────────────── 공통 버튼 ──────────────────────────────

  /**
   * 확인창이 떠 있으면 그 창의 버튼만 살아 있다.
   *
   * 목록에서 지우지 않고 `enabled: false`로 남기는 것이 핵심이다 — 조작 훅이
   * "지금 왜 안 눌리는가"를 답할 수 있어야 한다(`CONTRIBUTING` 4.2).
   */
  private allow(id: string, enabled: boolean): boolean {
    if (this.modal && !id.startsWith('confirm:')) return false
    return enabled
  }

  private button(opts: {
    id: string
    x: number
    y: number
    w: number
    h: number
    label: string
    enabled: boolean
    active?: boolean
    primary?: boolean
    danger?: boolean
    /** 조작 훅에 내보낼 이름. 버튼 글자만으로는 무엇에 대한 것인지 모를 때만 쓴다. */
    hotspotLabel?: string
  }): void {
    const { ctx } = this
    const { x, y, w, h, label, active, primary, danger } = opts
    const enabled = this.allow(opts.id, opts.enabled)

    let fill = 'rgba(255,255,255,0.06)'
    let edge = 'rgba(255,255,255,0.10)'
    let text: string = PALETTE.text
    if (active) {
      fill = 'rgba(90,169,230,0.28)'
      edge = PALETTE.accent
    } else if (primary) {
      fill = 'rgba(139,212,80,0.20)'
      edge = 'rgba(139,212,80,0.7)'
      text = PALETTE.good
    } else if (danger) {
      fill = 'rgba(255,92,92,0.12)'
      edge = 'rgba(255,92,92,0.45)'
      text = PALETTE.danger
    }
    if (!enabled) {
      fill = 'rgba(255,255,255,0.03)'
      edge = 'rgba(255,255,255,0.06)'
      text = PALETTE.textDim
    }

    ctx.fillStyle = fill
    roundRect(ctx, x, y, w, h, 6)
    ctx.fill()
    ctx.strokeStyle = edge
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = FONT.bodyBold
    ctx.fillStyle = text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
    ctx.textAlign = 'left'

    this.buttons.push({ id: opts.id, x, y, w, h, enabled, label: opts.hotspotLabel ?? label })
  }
}
