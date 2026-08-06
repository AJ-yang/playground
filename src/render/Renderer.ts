import { Rng } from '../core/rng'
import { TILE_SIZE } from '../game/Game'
import type { Game } from '../game/Game'
import type { Enemy } from '../game/Enemy'
import type { Tower } from '../game/Tower'
import { getTowerDef } from '../data/towers'
import type { Layout } from '../ui/layout'
import { FONT, PALETTE, roundRect } from './palette'
import { enemySilhouettePath, enemyWingsPath } from './shapes'
import { CASTLE_ART, ENEMY_ART, GATE_ART, ROCK_ART, TOWER_ART, TREE_ART, WEAPON_ART, drawArt } from './art'

/**
 * 아트가 화면에서 실제로 차지하는 범위.
 *
 * `size`는 32 좌표계를 몇 픽셀로 펼칠지, 나머지는 32 좌표계 기준 원본 치수다.
 * `up`/`down`은 바닥 기준선(y=29)에서 위아래로 뻗는 양.
 */
interface ArtFootprint {
  size: number
  halfWidth: number
  up: number
  down: number
}

/** 왕성 — 깃발이 위로 튀어나와 있어 up이 크다. */
const CASTLE_FOOTPRINT: ArtFootprint = { size: 54, halfWidth: 15.5, up: 30, down: 1 }
/** 무너진 성문 — 찢긴 깃발이 위로 뻗는다. */
const GATE_FOOTPRINT: ArtFootprint = { size: 46, halfWidth: 14, up: 30, down: 1 }

/** 라벨과 그림 꼭대기 사이 간격(px). */
const LABEL_GAP = 13

/** 그림이 보드 밖으로 잘리지 않도록 앵커를 안쪽으로 민다. */
function fitArt(
  at: { x: number; y: number },
  fp: ArtFootprint,
  board: { w: number; h: number },
): { x: number; baseline: number; labelY: number } {
  const s = fp.size / 32
  const halfW = fp.halfWidth * s
  const up = fp.up * s
  const down = fp.down * s
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi))

  const x = clamp(at.x, halfW + 3, board.w - halfW - 3)
  // 라벨까지 포함해 위쪽 여유를 잡는다. 아래쪽은 그림 바닥만 들어가면 된다.
  const baseline = clamp(at.y + up * 0.55, up + LABEL_GAP + 9, board.h - down - 4)
  return { x, baseline, labelY: baseline - up - LABEL_GAP }
}

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
    this.drawDangerOverlay(game, time)

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

  /**
   * 지형을 한 번만 그려 캐시한다.
   *
   * 디테일(풀 뭉치·자갈·바위 결)은 전부 **시드 난수**로 흩뿌린다. Math.random을
   * 쓰면 다시 시작할 때마다 지형이 달라져 같은 맵이 다른 곳처럼 보이고,
   * 스크린샷 비교도 불가능해진다. 맵 ID에서 시드를 뽑아 항상 같은 그림이 나온다.
   */
  private buildTerrain(game: Game): HTMLCanvasElement {
    const { board } = this.layout
    const canvas = document.createElement('canvas')
    canvas.width = board.w
    canvas.height = board.h
    const ctx = canvas.getContext('2d')!
    const { grid, paths } = game
    const level = game.stage.level

    // 맵 ID를 숫자로 접어 시드를 만든다 — 맵마다 다르고, 같은 맵은 항상 같다.
    let seed = 2166136261
    for (const ch of level.id) seed = (Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0)
    const rng = new Rng(seed)

    this.paintGrass(ctx, grid, rng)
    this.paintPaths(ctx, paths)
    this.paintObstacles(ctx, grid, rng)
    this.paintEndpoints(ctx, paths, board)

    return canvas
  }

  /**
   * 잔디.
   *
   * 처음에는 타일마다 색을 바꿨는데, 그러면 지형이 아니라 **격자**로 읽힌다.
   * 그래서 순서를 바꿨다 — 바탕을 한 번에 깔고, 타일과 무관한 유기적 얼룩을
   * 얹은 뒤, 마지막에 풀 뭉치를 흩뿌린다. 체크무늬는 건설 칸을 알려주는
   * 최소한의 힌트로만 아주 옅게 남긴다.
   */
  private paintGrass(ctx: CanvasRenderingContext2D, grid: Game['grid'], rng: Rng): void {
    const w = grid.widthPx
    const h = grid.heightPx

    // 1. 바탕
    ctx.fillStyle = PALETTE.grassB
    ctx.fillRect(0, 0, w, h)

    // 2. 유기적 얼룩 — 타일 경계를 무시하고 퍼져야 격자가 안 보인다.
    const blobs = Math.round((w * h) / 5200)
    for (let i = 0; i < blobs; i++) {
      const bx = rng.range(0, w)
      const by = rng.range(0, h)
      const br = rng.range(28, 82)
      const light = rng.next() < 0.5
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br)
      grad.addColorStop(0, light ? 'rgba(58,80,50,0.34)' : 'rgba(18,26,17,0.34)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(bx - br, by - br, br * 2, br * 2)
    }

    // 3. 건설 칸 힌트 — 아주 옅은 체크무늬. 없으면 어디에 지을 수 있는지
    //    가늠이 안 되고, 진하면 지형이 아니라 표가 된다.
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if ((col + row) % 2 !== 0) continue
        ctx.fillStyle = 'rgba(255,255,255,0.016)'
        ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      }
    }

    // 4. 풀 뭉치 — 가닥 수·각도·길이를 전부 흩어야 반복되는 기호처럼 보이지 않는다.
    ctx.lineCap = 'round'
    const tufts = Math.round((w * h) / 900)
    for (let i = 0; i < tufts; i++) {
      const gx = rng.range(4, w - 4)
      const gy = rng.range(8, h - 4)
      const blades = rng.int(2, 4)
      ctx.strokeStyle = `rgba(150,200,120,${rng.range(0.05, 0.13).toFixed(3)})`
      ctx.lineWidth = rng.range(0.9, 1.5)
      ctx.beginPath()
      for (let b = 0; b < blades; b++) {
        const lean = rng.range(-0.55, 0.55)
        const len = rng.range(3.5, 7)
        const ox = rng.range(-3.5, 3.5)
        ctx.moveTo(gx + ox, gy)
        ctx.lineTo(gx + ox + lean * len, gy - len)
      }
      ctx.stroke()
    }

    // 5. 격자선은 거의 보이지 않을 만큼만 — 배치 정렬용 최소 안내
    ctx.strokeStyle = PALETTE.grassLine
    ctx.lineWidth = 1
    for (let col = 0; col <= grid.cols; col++) {
      ctx.beginPath()
      ctx.moveTo(col * TILE_SIZE + 0.5, 0)
      ctx.lineTo(col * TILE_SIZE + 0.5, h)
      ctx.stroke()
    }
    for (let row = 0; row <= grid.rows; row++) {
      ctx.beginPath()
      ctx.moveTo(0, row * TILE_SIZE + 0.5)
      ctx.lineTo(w, row * TILE_SIZE + 0.5)
      ctx.stroke()
    }
  }

  /**
   * 흙길 — 둑 → 흙 → 밝은 바퀴자국 순으로 겹쳐 깊이를 만든다.
   *
   * 경로가 여러 개면 겹치는 구간이 생기므로, 층마다 모든 경로를 한 번씩 그린 뒤
   * 다음 층으로 넘어간다. 경로별로 세 층을 다 그리면 합류 지점에서 나중 경로의
   * 어두운 둑이 앞 경로의 밝은 흙을 덮어 이음매가 드러난다.
   */
  private paintPaths(ctx: CanvasRenderingContext2D, paths: Game['paths']): void {
    const strokeAll = (width: number, color: string, dash?: number[]) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      if (dash) ctx.setLineDash(dash)
      for (const p of paths) {
        ctx.beginPath()
        p.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)))
        ctx.stroke()
      }
      if (dash) ctx.setLineDash([])
    }

    strokeAll(TILE_SIZE + 6, PALETTE.pathBank)
    strokeAll(TILE_SIZE, PALETTE.pathOuter)
    strokeAll(TILE_SIZE - 8, PALETTE.pathInner)

    // 자갈 — 어두운 짧은 파선을 길 안쪽에 흩어 놓는다.
    strokeAll(TILE_SIZE - 14, PALETTE.pathGravel, [2, 9])

    // 바퀴자국 두 줄. 가운데 점선 하나보다 길이 다져진 느낌이 난다.
    ctx.save()
    for (const offset of [-7, 7]) {
      ctx.strokeStyle = PALETTE.pathRut
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (const p of paths) {
        ctx.beginPath()
        p.points.forEach((pt, i) => {
          // 진행 방향의 수직으로 밀어 두 줄을 만든다.
          const prev = p.points[Math.max(0, i - 1)]!
          const next = p.points[Math.min(p.points.length - 1, i + 1)]!
          const dx = next.x - prev.x
          const dy = next.y - prev.y
          const len = Math.hypot(dx, dy) || 1
          const nx = (-dy / len) * offset
          const ny = (dx / len) * offset
          i === 0 ? ctx.moveTo(pt.x + nx, pt.y + ny) : ctx.lineTo(pt.x + nx, pt.y + ny)
        })
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /** 장애물 — 바위와 나무 두 종류를 섞어 지형에 리듬을 준다. */
  private paintObstacles(ctx: CanvasRenderingContext2D, grid: Game['grid'], rng: Rng): void {
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.kindAt(col, row) !== 'blocked') continue
        const cx = (col + 0.5) * TILE_SIZE
        const cy = (col + row) % 3 === 0 ? (row + 0.5) * TILE_SIZE - 2 : (row + 0.5) * TILE_SIZE

        // 바닥 그림자 — 이것만으로도 지형에 붙어 있다는 느낌이 크게 산다.
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.beginPath()
        ctx.ellipse(cx, cy + 11, 13, 5, 0, 0, Math.PI * 2)
        ctx.fill()

        if ((col * 7 + row * 3) % 5 < 2) this.paintTree(ctx, cx, cy, rng)
        else this.paintRock(ctx, cx, cy, rng)
      }
    }
  }

  private paintRock(ctx: CanvasRenderingContext2D, cx: number, cy: number, rng: Rng): void {
    drawArt(ctx, ROCK_ART, cx, cy + 12, rng.range(28, 34))
  }

  private paintTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, rng: Rng): void {
    drawArt(ctx, TREE_ART, cx, cy + 12, rng.range(30, 37))
  }

  /**
   * 출발지·왕성 표식.
   *
   * 경로는 보드 가장자리에서 시작하고 끝나므로, 좌표를 그대로 쓰면 건물이
   * 절반쯤 잘려 나간다. 그래서 그림이 실제로 차지하는 폭·높이를 계산해
   * 그만큼 안쪽으로 밀어 넣는다 — 위치가 조금 어긋나도 잘리는 것보다 낫다.
   */
  private paintEndpoints(
    ctx: CanvasRenderingContext2D,
    paths: Game['paths'],
    board: { w: number; h: number },
  ): void {
    ctx.font = FONT.label
    ctx.textBaseline = 'middle'

    // 출발지 — 무너진 성문. 그림이 있으면 "여기서 나온다"가 글자보다 빨리 읽힌다.
    paths.forEach((p, i) => {
      const start = p.positionAt(0)
      const spot = fitArt(start, GATE_FOOTPRINT, board)
      drawArt(ctx, GATE_ART, spot.x, spot.baseline, GATE_FOOTPRINT.size)

      ctx.fillStyle = 'rgba(255,120,120,0.95)'
      ctx.textAlign = 'center'
      ctx.fillText(paths.length > 1 ? `출현 ${i + 1}` : '적 출현', spot.x, spot.labelY)
    })

    // 왕성 — 지켜야 하는 곳
    const end = paths[0]!.positionAt(paths[0]!.totalLength)
    const spot = fitArt(end, CASTLE_FOOTPRINT, board)
    drawArt(ctx, CASTLE_ART, spot.x, spot.baseline, CASTLE_FOOTPRINT.size)
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(120,180,240,0.95)'
    ctx.fillText('왕성', spot.x, spot.labelY)
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

  /**
   * 타워 1기.
   *
   * 예전에는 둥근 사각형 하나에 작은 포신이 전부라 "판 위에 놓인 색칠한 칩"처럼
   * 보였다. 지금은 세 겹으로 쌓는다 — **바닥 그림자 → 석재 받침 → 타워 몸체 →
   * 포신**. 받침은 타워 종류와 무관하게 같은 재질이라 다섯 종류가 한 세계의
   * 물건으로 읽히고, 그림자가 지형에 붙여 준다.
   *
   * 레벨은 좌상단 점 대신 **받침 모서리의 기둥 수**로 보여준다. 판을 훑을 때
   * 실루엣 자체가 달라지는 편이 훨씬 빨리 읽힌다.
   */
  /**
   * 타워 1기.
   *
   * 몸체는 `render/art.ts`의 중세 건물 벡터 아트다. 무기 부분만 따로 그려
   * 목표를 향해 회전시킨다 — 건물이 통째로 도는 것은 어색하고, 지금 어느
   * 타워가 무엇을 겨누는지는 여전히 보여야 하기 때문이다.
   */
  private drawTower(tower: Tower, selected: boolean, time: number): void {
    const { ctx } = this
    const { pos, def, level } = tower

    ctx.save()
    ctx.translate(pos.x, pos.y)

    // 바닥 그림자 — 이것 하나로 지형에 붙어 있다는 느낌이 크게 산다.
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.ellipse(0, TILE_SIZE * 0.3, TILE_SIZE * 0.4, TILE_SIZE * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()

    if (selected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.ellipse(0, TILE_SIZE * 0.3, TILE_SIZE * 0.44, TILE_SIZE * 0.2, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 건물 — 레벨이 오를수록 조금씩 커진다. 판을 훑을 때 성장이 보인다.
    const art = TOWER_ART[def.id]
    const size = TILE_SIZE * (0.92 + level * 0.06)
    if (art) drawArt(ctx, art, 0, TILE_SIZE * 0.32, size, { color: def.color, accent: def.accent })

    // 레벨 깃발 — 건물 왼쪽에 level개
    ctx.fillStyle = def.accent
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 0.8
    for (let i = 0; i < level; i++) {
      const fx = -TILE_SIZE * 0.42 + i * 5
      const fy = TILE_SIZE * 0.24
      ctx.beginPath()
      ctx.arc(fx, fy, 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // 무기 — 목표를 향해 회전. 건물 상단에 얹는다.
    ctx.translate(0, -TILE_SIZE * 0.12)
    ctx.rotate(tower.turretAngle)
    ctx.translate(-tower.recoil * 3, 0)

    // 머즐 플래시 — 지금 일하는 타워가 한눈에 보인다.
    if (tower.recoil > 0.35) {
      const f = (tower.recoil - 0.35) / 0.65
      ctx.globalAlpha = f * 0.85
      ctx.fillStyle = def.accent
      ctx.beginPath()
      ctx.arc(15, 0, 4 + f * 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    this.drawTurret(def.shape, def.accent, time)

    ctx.restore()
  }

  /**
   * 무기.
   *
   * 예전에는 삼각형·사각형 같은 도형이었다. 지금은 활·봄바드·플라스크 같은
   * 실제 물건이라 무엇을 하는 타워인지가 아이콘 없이도 읽힌다. 시간 기반
   * 움직임(맥동·회전·흔들림)은 아트가 아니라 여기서 준다 — 같은 그림을
   * 패널에서 정지 상태로도 써야 하기 때문이다.
   */
  private drawTurret(shape: string, accent: string, time: number): void {
    const { ctx } = this
    const art = WEAPON_ART[shape]
    if (!art) return

    let size = 30
    if (shape === 'orb') size = 26 * (1 + Math.sin(time * 3) * 0.08)
    if (shape === 'crystal') ctx.rotate(time * 1.2)
    if (shape === 'flask') ctx.rotate(Math.sin(time * 4) * 0.25)

    drawArt(ctx, art, 0, 0, size, { color: accent, accent }, false)
  }

  private drawEnemies(game: Game, time: number): void {
    for (const enemy of game.enemies) {
      if (enemy.distance < 0) continue
      // 쐐기 실루엣과 날개는 진행 방향을 따라야 한다.
      const dir = enemy.path.directionAt(enemy.distance)
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

    // 실루엣 배경.
    //
    // 그림이 도형을 대체했지만 **형태로 방어 유형을 읽는 규칙은 유지해야 한다**.
    // 그래서 원래의 도형을 어두운 한 겹으로 뒤에 깔았다. 어두운 지형 위에서
    // 적을 떠오르게 하는 아웃라인 역할도 겸한다.
    const sil = def.silhouette
    const facing = Math.cos(angle) < 0
    ctx.fillStyle = 'rgba(8,10,14,0.55)'
    enemySilhouettePath(ctx, sil, pos.x, bodyY, r * 1.04, facing ? Math.PI : 0)
    ctx.fill()

    // 본체 — 손으로 그린 벡터 아트. 진행 방향을 보도록 좌우를 뒤집는다.
    const art = ENEMY_ART[def.id]
    if (art) {
      drawArt(ctx, art, pos.x, bodyY, r * 2.45, { color: def.color, accent: def.color }, false, facing)
    } else {
      ctx.fillStyle = def.color
      enemySilhouettePath(ctx, sil, pos.x, bodyY, r, angle)
      ctx.fill()
    }

    // 피격 섬광 — 그림 위에 실루엣을 흰색으로 덮는다. 아트의 디테일이
    // 그대로 보이면 "맞았다"가 안 읽힌다.
    if (hit) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)'
      enemySilhouettePath(ctx, sil, pos.x, bodyY, r * 0.94, facing ? Math.PI : 0)
      ctx.fill()
    }

    // 방어 표식은 실루엣에서 파생시킨다 — 임계값을 따로 두면 실루엣과
    // 어긋난다 (예전에는 마저 45%인 보스에 마법 표식이 안 떴다).
    const showArmor = def.armor > 0 && (sil === 'armored' || sil === 'bulwark' || sil === 'boss')
    const showWard =
      def.magicResist > 0 && (sil === 'warded' || sil === 'bulwark' || sil === 'boss')

    // 장갑 — 같은 실루엣을 바깥에 한 겹 더. 예전에는 안쪽에 그렸는데
    // 그림으로 바뀐 뒤로는 본체를 덮어 버려서 테두리로 옮겼다.
    if (showArmor) {
      ctx.strokeStyle = 'rgba(226,236,255,0.6)'
      ctx.lineWidth = 1.8
      enemySilhouettePath(ctx, sil, pos.x, bodyY, r * 1.12, facing ? Math.PI : 0)
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
    // 중독 표식 — 방어를 무시하고 계속 깎이는 중이라는 신호
    if (enemy.isPoisoned) {
      ctx.strokeStyle = 'rgba(182,240,106,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.arc(pos.x, bodyY, r * 1.75, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
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

  /**
   * 생명 위기 표시 — 붉은 비네트와 피격 번쩍임.
   *
   * 유출은 이 게임에서 가장 중요한 사건인데, 화면 구석의 숫자가 조용히 1 줄어드는
   * 것만으로는 전혀 눈에 띄지 않았다. 그래서 두 겹으로 알린다.
   *   1. 새는 순간   — 보드 전체가 붉게 번쩍인다 (놓칠 수 없는 즉각 신호)
   *   2. 생명이 적을 때 — 가장자리가 상시 붉게 물든다 (지금 위험하다는 지속 신호)
   * 비네트는 시야 가장자리에 두어 판 위의 정보를 가리지 않게 했다.
   */
  private drawDangerOverlay(game: Game, time: number): void {
    const { ctx } = this
    const { board } = this.layout
    const danger = game.dangerLevel

    if (danger > 0) {
      // 위험할수록 빠르고 깊게 맥동한다.
      const pulse = 0.78 + 0.22 * Math.sin(time * (2.4 + danger * 3.4))
      const strength = danger * pulse

      const cx = board.w / 2
      const cy = board.h / 2
      const inner = Math.min(board.w, board.h) * (0.62 - danger * 0.22)
      const outer = Math.hypot(cx, cy)
      const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer)
      grad.addColorStop(0, 'rgba(200,20,20,0)')
      grad.addColorStop(1, `rgba(190,16,16,${(0.5 * strength).toFixed(3)})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, board.w, board.h)

      // 가장자리에 붉은 테두리를 한 겹 더 — 비네트만으로는 경계가 흐려 보인다.
      ctx.strokeStyle = `rgba(255,70,70,${(0.5 * strength).toFixed(3)})`
      ctx.lineWidth = 2 + danger * 6
      ctx.strokeRect(1, 1, board.w - 2, board.h - 2)
    }

    if (game.damageFlash > 0) {
      const f = Math.min(1, game.damageFlash)
      ctx.fillStyle = `rgba(255,48,48,${(0.34 * f).toFixed(3)})`
      ctx.fillRect(0, 0, board.w, board.h)
    }
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
      `도달 웨이브 ${Math.min(game.waves.waveNumber, game.waves.totalWaves)} / ${game.waves.totalWaves}`,
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
