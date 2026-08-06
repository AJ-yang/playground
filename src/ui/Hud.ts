import type { Game } from '../game/Game'
import { TOWER_ORDER, getTowerDef } from '../data/towers'
import { getEnemyDef } from '../data/enemies'
import { TARGET_PRIORITY_LABEL } from '../game/types'
import { FONT, PALETTE, roundRect } from '../render/palette'
import { enemySilhouettePath } from '../render/shapes'
import { ENEMY_ART, TOWER_ART, drawArt } from '../render/art'
import type { Layout, UiButton } from './layout'

const SPEEDS = [1, 2, 3] as const

/**
 * 상단 HUD와 우측 패널.
 *
 * 그리기와 히트 영역 계산을 한 곳에서 한다. 버튼을 그리면서 좌표를 배열에
 * 쌓아 반환하고, 입력 처리는 그 배열만 보고 판정한다 — 그림과 클릭 영역이
 * 어긋날 수 없는 구조다.
 */
export class Hud {
  private buttons: UiButton[] = []

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly layout: Layout,
  ) {}

  /** 이번 프레임의 클릭 가능 영역. draw() 직후에 유효하다. */
  get hitAreas(): readonly UiButton[] {
    return this.buttons
  }

  draw(game: Game, timeScale: number, paused: boolean): void {
    this.buttons = []
    this.drawTopBar(game, timeScale, paused)
    this.drawPanel(game)
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

    let y = p.y + 14
    y = this.drawBuildMenu(game, y)
    y += 6
    this.divider(y)
    y += 12

    if (game.selectedTower) this.drawTowerInfo(game, y)
    else this.drawWavePreview(game, y)

    if (game.isOver) {
      this.button({
        id: 'restart',
        x: p.x + 12,
        y: p.y + p.h - 44,
        w: p.w - 24,
        h: 32,
        label: '다시 시작 (R)',
        enabled: true,
        primary: true,
      })
    }
  }

  private drawBuildMenu(game: Game, startY: number): number {
    const { ctx, layout } = this
    const p = layout.panel

    ctx.font = FONT.label
    ctx.fillStyle = PALETTE.textMuted
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('건설', p.x + 14, startY)
    ctx.textBaseline = 'middle'

    let y = startY + 20
    const cardH = 52

    // 게임이 끝나면 메뉴 전체를 죽인다. 예전에는 패배 화면에서도 초록색
    // 업그레이드 버튼이 그대로 살아 있어 눌릴 것처럼 보였다.
    ctx.globalAlpha = game.isOver ? 0.4 : 1

    // 해금된 타워만 노출한다. 잠긴 타워를 흐리게 남겨두면 "언젠가 열린다"는
    // 정보는 주지만 준비 단계의 판단을 방해한다 — 스테이지 선택 화면이
    // 이미 해금 현황을 보여주므로 여기서는 쓸 수 있는 것만 보여준다.
    const menu = TOWER_ORDER.filter((id) => game.canUse(id))

    menu.forEach((towerId, i) => {
      const def = getTowerDef(towerId)
      const cost = def.levels[0].cost
      const affordable = game.gold >= cost
      const selected = game.selectedBuildId === towerId
      const x = p.x + 12
      const w = p.w - 24

      ctx.fillStyle = selected ? 'rgba(90,169,230,0.18)' : 'rgba(255,255,255,0.035)'
      roundRect(ctx, x, y, w, cardH, 6)
      ctx.fill()
      ctx.strokeStyle = selected ? PALETTE.accent : 'rgba(255,255,255,0.07)'
      ctx.lineWidth = selected ? 1.6 : 1
      ctx.stroke()

      // 타워 배지 — 보드에 서는 건물 그림을 그대로 축소해 넣는다.
      // 색 사각형만 있던 시절에는 메뉴와 보드가 별개의 언어였다.
      //
      // 배경에 타워 색을 옅게 깐다. 대포탑·얼음탑은 몸체가 회색 석재라
      // 그림만으로는 작은 크기에서 서로 비슷해 보였다.
      ctx.fillStyle = `${def.color}22`
      roundRect(ctx, x + 8, y + 10, 32, 32, 6)
      ctx.fill()
      const towerArt = TOWER_ART[def.id]
      // 배지 안에 정확히 들어가도록 바닥 기준선을 상자 안쪽에 둔다.
      if (towerArt) drawArt(ctx, towerArt, x + 24, y + 39, 30, { color: def.color, accent: def.accent })

      ctx.globalAlpha = affordable ? 1 : 0.45
      ctx.font = FONT.bodyBold
      ctx.fillStyle = PALETTE.text
      ctx.textAlign = 'left'
      ctx.fillText(`${i + 1}. ${def.name}`, x + 48, y + 17)
      ctx.font = FONT.tiny
      ctx.fillStyle = PALETTE.textDim
      ctx.fillText(def.tagline, x + 48, y + 33)

      ctx.font = FONT.bodyBold
      ctx.fillStyle = affordable ? PALETTE.gold : PALETTE.danger
      ctx.textAlign = 'right'
      ctx.fillText(`${cost}G`, x + w - 10, y + 17)
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'

      this.buttons.push({
        id: `build:${towerId}`,
        x,
        y,
        w,
        h: cardH,
        enabled: !game.isOver,
        payload: towerId,
      })
      y += cardH + 6
    })

    ctx.globalAlpha = 1
    return y
  }

  private drawTowerInfo(game: Game, startY: number): void {
    const { ctx, layout } = this
    const p = layout.panel
    const tower = game.selectedTower!
    const stats = tower.stats
    const next = tower.nextStats

    let y = startY
    ctx.textAlign = 'left'
    ctx.font = FONT.title
    ctx.fillStyle = PALETTE.text
    ctx.fillText(`${tower.def.name} Lv.${tower.level}`, p.x + 14, y + 8)
    y += 26

    const typeLabel =
      tower.def.damageType === 'physical' ? '물리' : tower.def.damageType === 'magic' ? '마법' : '순수'
    ctx.font = FONT.small
    ctx.fillStyle = PALETTE.textDim
    ctx.fillText(`${typeLabel} · ${tower.def.targetsAir ? '지상/공중' : '지상 전용'}`, p.x + 14, y + 6)
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
      label: upgradeCost === null ? '최대 레벨' : `업그레이드  ${upgradeCost}G`,
      enabled: !game.isOver && upgradeCost !== null && game.gold >= upgradeCost,
      primary: !game.isOver && upgradeCost !== null && game.gold >= upgradeCost,
    })
    y += 40

    // 판매
    this.button({
      id: 'sell',
      x: p.x + 12,
      y,
      w: p.w - 24,
      h: 28,
      label: `판매  +${tower.sellValue()}G`,
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
        drawArt(ctx, art, p.x + 22, y + 8, 17, { color: def.color, accent: def.color }, false)
      } else {
        ctx.fillStyle = def.color
        enemySilhouettePath(ctx, def.silhouette, p.x + 22, y + 8, 6.5)
        ctx.fill()
      }
      if (def.flying) {
        // 공중은 형태가 아니라 부가 표식이므로 작은 날개 힌트만 붙인다.
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
      const sil = def.silhouette
      const tags: string[] = []
      if (def.flying) tags.push('공중')
      if (def.armor > 0 && (sil === 'armored' || sil === 'bulwark' || sil === 'boss')) {
        tags.push(`장갑 ${def.armor}`)
      }
      if (def.magicResist > 0 && (sil === 'warded' || sil === 'bulwark' || sil === 'boss')) {
        tags.push(`마저 ${Math.round(def.magicResist * 100)}%`)
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
      ? '빈 땅을 클릭해 건설 · Esc 로 취소'
      : '타워를 클릭하면 업그레이드·판매'
    ctx.fillStyle = PALETTE.textDim
    ctx.font = FONT.tiny
    ctx.fillText(hint, p.x + 14, y + 8)

    return y + 24
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
  }): void {
    const { ctx } = this
    const { x, y, w, h, label, enabled, active, primary, danger } = opts

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

    this.buttons.push({ id: opts.id, x, y, w, h, enabled })
  }
}
