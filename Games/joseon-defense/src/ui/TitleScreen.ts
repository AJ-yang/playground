import { DIFFICULTIES } from '../data/difficulty'
import { TOTAL_STAGES } from '../data/stages'
import type { Progress } from '../game/Progress'
import { FONT, PALETTE, roundRect } from '../render/palette'
import { CASTLE_ART, ENEMY_ART, GATE_ART, TOWER_ART, drawArt } from '../render/art'
import { enemySilhouettePath } from '../render/shapes'
import { INVASIONS, JEJU, PENINSULA, RIDGE, RIDGE_BRANCH, RIVERS, WAR_SITES } from '../render/mapArt'
import {
  backdropMapImage,
  backdropPlateImages,
  hasBackdropMap,
  hasBackdropPhotos,
  initBackdropImages,
  type LoadedPlate,
} from '../render/backdropImages'
import { PLATE_SLOTS } from '../render/backdropLayout'
import { getEnemyDef } from '../data/enemies'
import { getTowerDef, TOWER_ORDER } from '../data/towers'
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
  /** 지도 표식이 진행도를 읽어야 해서 draw에서 받은 값을 잠깐 들고 있는다. */
  private progressCleared = 0

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly layout: Layout,
  ) {
    initBackdropImages()
  }

  get hitAreas(): readonly UiButton[] {
    return this.buttons
  }

  draw(progress: Progress, time: number): void {
    this.buttons = []
    this.progressCleared = progress.clearedCount
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
    ctx.fillText('적의 체력만 달라집니다 — 웨이브 구성과 기물 수치는 동일', cx, 246)

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

      this.buttons.push({
        id: `difficulty:${diff.id}`,
        x,
        y,
        w: cardW,
        h: cardH,
        enabled: true,
        label: `${diff.name} — ${diff.desc}`,
      })
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
   * 배경 — 조선 고지도 위에 여섯 전쟁이 찍히고, 남과 북에서 침입이 들어온다.
   *
   * 예전에는 밤길과 그 위를 지나는 적을 그렸다. 그림은 "막는다"를 말했지만
   * **어디를 왜 막는지**는 말하지 못했다. 이 게임의 스테이지가 실제 전쟁을
   * 순서대로 따라가므로, 지도 한 장이 그 셋(장소·상대·순서)을 동시에 말한다.
   *
   * 글자와 버튼이 화면 가운데를 쓰므로 지도는 낮은 불투명도로 깔고, 표식만
   * 또렷하게 남긴다.
   *
   * 지도는 두 가지로 그려진다. `assets/backdrop/` 에 실제 고지도 스캔을 넣고
   * 구웠으면 **그 사진**이 화면 높이를 가득 채우고, 유물 사진들이 좌우 여백에
   * 흐리게 얹힌다. 원본이 없으면 벡터로 그린 기호 지도로 되돌아간다 —
   * 대체품이지 목표가 아니다. `assets/backdrop/README.md` 를 보라.
   */
  private drawBackdrop(time: number): void {
    const { ctx, layout } = this
    const w = layout.width
    const h = layout.height

    // 등불 아래 펼친 종이 — 가운데가 살짝 밝고 가장자리로 어두워진다.
    const lamp = ctx.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.42, h * 0.95)
    lamp.addColorStop(0, 'rgba(94,78,52,0.30)')
    lamp.addColorStop(0.55, 'rgba(60,50,34,0.16)')
    lamp.addColorStop(1, 'rgba(10,12,16,0)')
    ctx.fillStyle = lamp
    ctx.fillRect(0, 0, w, h)

    if (hasBackdropMap()) {
      // 디코드가 끝나기 전 한두 프레임은 지도 없이 지나간다. 그동안 벡터
      // 지도를 대신 그리면 곧바로 사진으로 튀어서 깜빡임이 된다.
      const scan = backdropMapImage()
      if (scan) this.drawPhotoMap(scan, time)
    } else {
      this.drawOldMap(time)
    }

    const plates = backdropPlateImages()
    if (plates.length > 0) this.drawPhotoPlates(plates, time)
    else if (!hasBackdropPhotos()) this.drawFormationPlate(time)

    const roadY = h - 44

    ctx.save()
    ctx.globalAlpha = 0.34
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
    ctx.globalAlpha = 0.6
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

  /**
   * 실제 고지도 스캔 한 장을 배경 전체에 깐다.
   *
   * 반도는 원래 세로로 길다. 그래서 화면 **높이**에 맞춰 키우면 가운데에
   * 기둥처럼 서고, 좌우로는 여백이 남아 거기에 유물 사진이 들어간다. 가로에
   * 맞추면 위아래가 잘려 나가 지도가 지도로 안 읽힌다.
   *
   * 사진은 구울 때 이미 먹빛-종이빛 2색조로 통일해 두었으므로 여기서 할 일은
   * 불투명도를 낮춰 글자 뒤로 물리는 것뿐이다.
   */
  private drawPhotoMap(scan: HTMLImageElement, time: number): void {
    const { ctx, layout } = this
    const dh = layout.height * 1.04
    const dw = dh * (scan.naturalWidth / scan.naturalHeight)
    const dx = (layout.width - dw) / 2
    const dy = (layout.height - dh) / 2

    ctx.save()
    ctx.globalAlpha = 0.26
    ctx.drawImage(scan, dx, dy, dw, dh)
    ctx.restore()

    // 표식은 사진 위에 또렷하게 남긴다 — 배경이 무엇으로 바뀌든 "여섯 전쟁이
    // 어디서 벌어졌는가"는 이 화면이 말해야 하는 내용이다. 정규 좌표
    // (100×140)를 그려진 사진 영역에 그대로 얹으므로, 지도는 반도가 화면을
    // 채우는 전도(全圖)여야 표식이 제자리에 앉는다.
    const px = (x: number) => dx + (x / 100) * dw
    const py = (y: number) => dy + (y / 140) * dh

    ctx.save()
    this.drawInvasions(px, py, time)
    // 지도가 화면 전체를 쓰게 되면서 표식 몇 개가 가운데 카드 위로 올라온다.
    // 지워 버리면 진행도를 지도 위에서 읽는다는 점이 사라지므로, 지도에
    // 적어 넣은 주(註)처럼 보이도록 낮춘다 — 읽히되 글자와 다투지 않는다.
    ctx.globalAlpha = 0.5
    this.drawWarSites(px, py, time)
    ctx.restore()
  }

  /**
   * 방어 기물의 모티브가 된 실물 사진들을 좌우 여백에 흩는다.
   *
   * 게임 안의 그림이 아니라 **원래의 물건**이다 — 각궁과 조총과 비격진천뢰가
   * 실제로 어떻게 생겼는지가 배경에 깔려 있어야, 화면의 기물들이 창작물이
   * 아니라 실물에서 나왔다는 게 설명 없이 전해진다.
   *
   * 구울 때 흐리게 하고 가장자리를 녹여 두었으므로 여기서는 자리와 각도만
   * 잡는다.
   */
  private drawPhotoPlates(plates: readonly LoadedPlate[], time: number): void {
    const { ctx, layout } = this

    plates.forEach((plate, i) => {
      const slot = PLATE_SLOTS[i % PLATE_SLOTS.length]
      // 완전히 멈춰 있으면 배경이 아니라 얼룩으로 보인다. 알아채기 직전까지만
      // 아주 느리게 숨 쉬게 한다.
      const breathe = 1 + Math.sin(time * 0.25 + i * 1.3) * 0.02
      const pw = slot.width * breathe
      const ph = pw * (plate.img.naturalHeight / plate.img.naturalWidth)

      ctx.save()
      ctx.translate(slot.nx * layout.width, slot.ny * layout.height)
      ctx.rotate(slot.rotation)
      ctx.globalAlpha = slot.alpha
      ctx.drawImage(plate.img, -pw / 2, -ph / 2, pw, ph)
      ctx.restore()
    })
  }

  /**
   * 조선 고지도 한 장 — **원본 스캔이 없을 때의 대체품**.
   *
   * 실측이 아니라 **형태의 기호**다. 서해안이 들쭉날쭉하고 동해안이 곧은 것,
   * 산줄기가 북동에서 남서로 흐르는 것, 물줄기가 두 줄로 그려지는 것 —
   * 조선 지도를 조선 지도로 읽히게 하는 최소한만 지킨다.
   */
  private drawOldMap(time: number): void {
    const { ctx, layout } = this
    // 난이도 카드가 가운데 704px을 쓰므로 좌우로 각 260px쯤이 빈다.
    // 지도는 그 왼쪽 여백에 세로로 세운다 — 반도가 원래 세로로 긴 형태라
    // 여백 모양과 맞고, 가운데 글자를 덮지 않는다.
    const mh = layout.height * 0.5
    const ox = 30
    const oy = 196
    const s = mh / 140

    // 정규 좌표(100×140) → 화면 좌표
    const px = (x: number) => ox + x * s
    const py = (y: number) => oy + y * s

    ctx.save()

    // ── 방안(方眼). 축척을 재려고 그은 눈금이라 지도보다 먼저 깔린다.
    ctx.strokeStyle = 'rgba(214,190,140,0.055)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let gx = 0; gx <= 100; gx += 10) {
      ctx.moveTo(px(gx), py(0))
      ctx.lineTo(px(gx), py(140))
    }
    for (let gy = 0; gy <= 140; gy += 10) {
      ctx.moveTo(px(0), py(gy))
      ctx.lineTo(px(100), py(gy))
    }
    ctx.stroke()

    // ── 바다 물결. 조선 지도는 바다를 빈칸이 아니라 결로 채웠다.
    ctx.strokeStyle = 'rgba(150,180,205,0.05)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let wy = 4; wy < 140; wy += 6) {
      for (let wx = 0; wx < 100; wx += 8) {
        const off = (wy / 6) % 2 === 0 ? 0 : 4
        ctx.moveTo(px(wx + off), py(wy))
        ctx.quadraticCurveTo(px(wx + off + 2), py(wy - 1.2), px(wx + off + 4), py(wy))
      }
    }
    ctx.stroke()

    // ── 반도
    const land = new Path2D()
    PENINSULA.forEach(([x, y], i) => {
      if (i === 0) land.moveTo(px(x), py(y))
      else land.lineTo(px(x), py(y))
    })
    land.closePath()

    ctx.fillStyle = 'rgba(58,50,34,0.5)'
    ctx.fill(land)
    ctx.strokeStyle = 'rgba(226,203,150,0.34)'
    ctx.lineWidth = 1.6
    ctx.stroke(land)

    // 제주
    ctx.beginPath()
    ctx.ellipse(px(JEJU[0]), py(JEJU[1]), JEJU[2] * s * 1.3, JEJU[2] * s * 0.72, -0.12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(58,50,34,0.5)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(226,203,150,0.28)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // ── 산줄기. 등고선이 아니라 이어 붙인 봉우리 기호로 그린다.
    const peaks = (line: ReadonlyArray<readonly [number, number]>, scale: number) => {
      ctx.strokeStyle = 'rgba(206,182,132,0.26)'
      ctx.lineWidth = 1.2
      ctx.lineJoin = 'round'
      for (const [x, y] of line) {
        const half = 2.6 * scale * s
        const tall = 3.4 * scale * s
        ctx.beginPath()
        ctx.moveTo(px(x) - half, py(y) + tall * 0.5)
        ctx.lineTo(px(x), py(y) - tall * 0.5)
        ctx.lineTo(px(x) + half, py(y) + tall * 0.5)
        ctx.stroke()
      }
    }
    peaks(RIDGE, 1)
    peaks(RIDGE_BRANCH, 0.75)

    // ── 물줄기. 두 줄 평행선이 조선 지도의 강 표기다.
    ctx.strokeStyle = 'rgba(150,180,205,0.22)'
    ctx.lineWidth = 1
    for (const river of RIVERS) {
      for (const shift of [-0.7, 0.7]) {
        ctx.beginPath()
        river.forEach(([x, y], i) => {
          const sx = px(x)
          const sy = py(y + shift)
          if (i === 0) ctx.moveTo(sx, sy)
          else ctx.lineTo(sx, sy)
        })
        ctx.stroke()
      }
    }

    this.drawInvasions(px, py, time)
    this.drawWarSites(px, py, time)

    ctx.restore()
  }

  /**
   * 오른쪽 여백의 진법도(陣法圖).
   *
   * 지도가 "어디서"를 말한다면 이쪽은 **"어떻게 싸웠는가"** 를 말한다.
   * 조선의 병서(『병학지남』·『진법』)는 부대를 네모 칸으로 그리고 그 사이에
   * 기(旗)와 고(鼓)를 배치한 도해를 실었다 — 이 게임의 기고(旗鼓)가 그
   * 형명(形名) 체계에서 나온 기물이라, 첫 화면에 그 그림이 있는 것이
   * 설명 문장보다 빠르다.
   *
   * 앞줄은 사수(활), 가운데는 살수(창검), 뒤는 포수(총) — 훈련도감의
   * 삼수병 편제 그대로다.
   */
  private drawFormationPlate(time: number): void {
    const { ctx, layout } = this
    const w = 200
    const h = 250
    const ox = layout.width - w - 34
    const oy = 214

    ctx.save()

    // 도해를 감싸는 테두리 — 병서의 판면을 흉내낸다.
    ctx.strokeStyle = 'rgba(226,203,150,0.16)'
    ctx.lineWidth = 1
    ctx.strokeRect(ox, oy, w, h)
    ctx.strokeRect(ox + 5, oy + 5, w - 10, h - 10)

    ctx.textAlign = 'center'
    ctx.font = FONT.tiny
    ctx.fillStyle = 'rgba(214,203,178,0.42)'
    ctx.fillText('진법도 陣法圖', ox + w / 2, oy + 20)

    // 삼수병 3열. 각 열의 이름과 병졸 칸.
    const rows: Array<{ label: string; marks: number; y: number }> = [
      { label: '사수 射手', marks: 7, y: oy + 60 },
      { label: '살수 殺手', marks: 7, y: oy + 116 },
      { label: '포수 砲手', marks: 7, y: oy + 172 },
    ]

    for (const row of rows) {
      ctx.textAlign = 'left'
      ctx.font = '9px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(214,203,178,0.34)'
      ctx.fillText(row.label, ox + 16, row.y - 14)

      const step = (w - 44) / (row.marks - 1)
      for (let i = 0; i < row.marks; i++) {
        const mx = ox + 22 + i * step
        ctx.strokeStyle = 'rgba(226,203,150,0.30)'
        ctx.lineWidth = 1
        ctx.strokeRect(mx - 5, row.y - 6, 10, 13)
        // 칸 안의 점 하나가 사람 하나를 뜻한다. 세로획으로 그렸더니
        // 숫자 1처럼 읽혀서 점으로 바꿨다.
        ctx.beginPath()
        ctx.arc(mx, row.y + 0.5, 1.6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(226,203,150,0.42)'
        ctx.fill()
      }
    }

    // 가운데 기고 — 깃발이 천천히 흔들린다. 이 도해에서 유일하게 움직이는 것이
    // 지휘 신호라야, 형명이 무엇인지가 그림만으로 읽힌다.
    const fx = ox + w / 2
    const fy = oy + h - 34
    ctx.strokeStyle = 'rgba(240,198,116,0.5)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx, fy - 30)
    ctx.stroke()

    const wave = Math.sin(time * 1.6) * 2.4
    ctx.fillStyle = 'rgba(200,86,70,0.5)'
    ctx.beginPath()
    ctx.moveTo(fx, fy - 30)
    ctx.lineTo(fx + 20 + wave, fy - 26)
    ctx.lineTo(fx + 18 + wave, fy - 18)
    ctx.lineTo(fx, fy - 20)
    ctx.closePath()
    ctx.fill()

    ctx.textAlign = 'center'
    ctx.font = FONT.tiny
    ctx.fillStyle = 'rgba(214,203,178,0.4)'
    ctx.fillText('기고 — 북과 깃발로 움직인다', ox + w / 2, oy + h - 12)

    ctx.restore()
  }

  /**
   * 침입 경로. 왜는 남동 바다에서, 후금·청은 북서 압록강에서 들어온다.
   *
   * 점선이 흘러야 "쳐들어오는 중"으로 읽힌다. 정지한 화살표는 지명 표기처럼
   * 보여서 방향만 알려줄 뿐 압박을 말하지 못한다.
   */
  private drawInvasions(px: (x: number) => number, py: (y: number) => number, time: number): void {
    const { ctx } = this
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const route of INVASIONS) {
      const pts = route.points
      ctx.strokeStyle = route.from === 'south' ? 'rgba(200,86,70,0.42)' : 'rgba(122,138,196,0.42)'
      ctx.lineWidth = 2
      ctx.setLineDash([7, 6])
      ctx.lineDashOffset = -time * 22
      ctx.beginPath()
      pts.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(px(x), py(y))
        else ctx.lineTo(px(x), py(y))
      })
      ctx.stroke()
      ctx.setLineDash([])

      // 화살촉 — 마지막 두 점의 방향을 따른다.
      const [ax, ay] = pts[pts.length - 2]!
      const [bx, by] = pts[pts.length - 1]!
      const ang = Math.atan2(py(by) - py(ay), px(bx) - px(ax))
      const tip = 9
      ctx.beginPath()
      ctx.moveTo(px(bx), py(by))
      ctx.lineTo(px(bx) - Math.cos(ang - 0.42) * tip, py(by) - Math.sin(ang - 0.42) * tip)
      ctx.moveTo(px(bx), py(by))
      ctx.lineTo(px(bx) - Math.cos(ang + 0.42) * tip, py(by) - Math.sin(ang + 0.42) * tip)
      ctx.stroke()
    }
    ctx.restore()
  }

  /**
   * 여섯 전장 표식.
   *
   * 읍호(邑號)를 본떠 지명을 테두리로 감싼다. 깬 곳은 채워지고 아직인 곳은
   * 비어 있어, 진행도가 목록이 아니라 **지도 위에서** 읽힌다.
   */
  private drawWarSites(px: (x: number) => number, py: (y: number) => number, time: number): void {
    const { ctx } = this
    const cleared = this.progressCleared

    ctx.save()
    ctx.textBaseline = 'middle'
    ctx.font = FONT.tiny

    for (const site of WAR_SITES) {
      const x = px(site.x)
      const y = py(site.y)
      const done = site.stage <= cleared
      const next = site.stage === cleared + 1

      if (next) {
        // 다음에 갈 곳만 맥동시킨다 — 시선이 갈 곳은 하나여야 한다.
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.4)
        ctx.beginPath()
        ctx.arc(x, y, 9 + pulse * 5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(240,198,116,${0.12 + pulse * 0.12})`
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(x, y, 6.4, 0, Math.PI * 2)
      ctx.fillStyle = done ? 'rgba(240,198,116,0.85)' : 'rgba(18,20,26,0.75)'
      ctx.fill()
      ctx.strokeStyle = done || next ? 'rgba(240,198,116,0.85)' : 'rgba(226,203,150,0.42)'
      ctx.lineWidth = 1.4
      ctx.stroke()

      // 지명을 그대로 쓰면 좁은 여백에서 서로 겹친다. 스테이지 번호만 찍고
      // 이름은 다음에 갈 곳 하나에만 붙인다 — 시선이 갈 곳은 하나여야 한다.
      ctx.textAlign = 'center'
      ctx.font = '700 9px system-ui, sans-serif'
      ctx.fillStyle = done ? 'rgba(20,22,28,0.9)' : 'rgba(226,203,150,0.7)'
      ctx.fillText(String(site.stage), x, y + 0.5)

      if (next) {
        ctx.font = FONT.tiny
        ctx.textAlign = site.side === 'left' ? 'right' : 'left'
        ctx.fillStyle = 'rgba(240,198,116,0.85)'
        ctx.fillText(site.name, x + (site.side === 'left' ? -10 : 10), y)
      }
    }
    ctx.restore()
  }

  /** 하단의 기물 목록 — 무엇을 모으게 되는지 미리 보여준다. */
  private drawRoster(cx: number, y: number): void {
    const { ctx } = this
    const ids = TOWER_ORDER
    const step = 60
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

    this.buttons.push({ id: opts.id, x, y, w, h, enabled: true, label })
  }
}
