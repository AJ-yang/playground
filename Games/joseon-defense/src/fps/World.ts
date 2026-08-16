import * as THREE from 'three'
import { Rng } from '../core/rng'
import type { Game } from '../game/Game'
import { C } from './palette3d'
import { BoardFrame, TILE_M } from './coords'

/**
 * 전장의 고정 지형 — 한 판 동안 변하지 않는 것 전부.
 *
 * 땅·길·바위·나무·성벽·성문·하늘·달·먼 산이 여기 속한다. 매 프레임 갱신되는
 * 것(적·기물·투사체)은 `Actors`가 따로 맡는다. 경계를 이렇게 그은 이유는
 * 지형이 **스테이지를 시작할 때 한 번만** 만들어지면 되기 때문이다. 지형까지
 * 매 프레임 훑으면 적이 마흔 마리 몰려오는 순간 프레임이 무너진다.
 *
 * 땅은 폴리곤이 아니라 **한 장의 구운 텍스처**다. 24×15 타일을 낱개 메시로
 * 깔면 드로우콜이 360이 되는데, 캔버스에 한 번 그려 붙이면 1이다. 대신
 * 눈에 띄는 입체물(바위·나무·성벽)만 실제 메시로 세운다.
 */
export class World {
  readonly root = new THREE.Group()
  readonly frame: BoardFrame

  /** 지면 레이캐스트용 평면. 조준한 타일을 찾을 때 이 하나만 때린다. */
  readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  private readonly disposables: Array<{ dispose(): void }> = []
  private readonly torches: Array<{ light: THREE.PointLight; base: number; seed: number }> = []

  constructor(game: Game) {
    const level = game.stage.level
    this.frame = new BoardFrame(level.cols, level.rows)

    this.root.add(this.buildSky())
    this.root.add(this.buildGround(game))
    this.root.add(this.buildOuterField())
    this.root.add(this.buildMountains())
    this.buildProps(game)
    this.buildWalls(game)
    this.buildGates(game)
    this.buildLights()
  }

  /** 횃불이 흔들린다. 고정 지형이지만 불빛만은 살아 있어야 밤이 밤처럼 보인다. */
  update(elapsed: number): void {
    for (const torch of this.torches) {
      const t = elapsed * 7 + torch.seed
      torch.light.intensity = torch.base * (0.82 + 0.18 * Math.sin(t) * Math.sin(t * 1.7))
    }
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose()
    this.disposables.length = 0
    this.root.clear()
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item)
    return item
  }

  // ────────────────────────────── 하늘 ──────────────────────────────

  /**
   * 하늘 — 안쪽을 칠한 큰 구.
   *
   * `scene.background`에 단색을 넣는 쪽이 싸지만, 그러면 지평선이 사라져
   * 사방이 똑같은 벽처럼 보인다. 위(짙은 남색)에서 아래(옅은 회청)로 가는
   * 그라디언트가 있어야 어느 쪽이 하늘이고 어느 쪽이 땅인지 읽힌다.
   */
  private buildSky(): THREE.Object3D {
    // 가로를 넉넉히 잡는다. 폭이 좁으면 별 하나가 구를 한 바퀴 도는 띠가 되어
    // 하늘에 흰 줄이 그어진다.
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, '#050912')
    grad.addColorStop(0.55, '#0d1626')
    grad.addColorStop(0.82, '#1d2a3e')
    grad.addColorStop(1, '#2b3a4f')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 별. 위쪽에만 촘촘하게 — 지평선 근처는 안개에 묻힌다.
    const rng = new Rng(0x5eed)
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 700; i++) {
      const y = rng.range(0, 330)
      ctx.globalAlpha = 0.12 + rng.next() * 0.6 * (1 - y / 380)
      const s = rng.next() > 0.9 ? 2 : 1
      ctx.fillRect(rng.range(0, canvas.width), y, s, s)
    }
    ctx.globalAlpha = 1

    const texture = this.track(new THREE.CanvasTexture(canvas))
    texture.colorSpace = THREE.SRGBColorSpace
    const geometry = this.track(new THREE.SphereGeometry(320, 24, 16))
    const material = this.track(
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false }),
    )
    const sky = new THREE.Mesh(geometry, material)

    // 달. 방향광이 오는 쪽에 걸어야 그림자의 방향과 어긋나지 않는다.
    const moonGeo = this.track(new THREE.CircleGeometry(9, 24))
    const moonMat = this.track(new THREE.MeshBasicMaterial({ color: C.moon, fog: false }))
    const moon = new THREE.Mesh(moonGeo, moonMat)
    moon.position.set(-150, 120, -220)
    moon.lookAt(0, 0, 0)
    sky.add(moon)

    const haloGeo = this.track(new THREE.CircleGeometry(20, 24))
    const haloMat = this.track(
      new THREE.MeshBasicMaterial({ color: C.moon, transparent: true, opacity: 0.12, fog: false }),
    )
    const halo = new THREE.Mesh(haloGeo, haloMat)
    halo.position.copy(moon.position).multiplyScalar(0.99)
    halo.lookAt(0, 0, 0)
    sky.add(halo)

    return sky
  }

  // ────────────────────────────── 땅 ──────────────────────────────

  /**
   * 격자를 한 장의 텍스처로 굽는다.
   *
   * 타일당 32픽셀. 길은 흙, 나머지는 들풀이고, 지을 수 있는 칸에만 아주 옅은
   * 격자선을 남긴다 — 1인칭에서는 "여기 지을 수 있나"를 발밑에서 읽어야 하는데,
   * 눈높이가 낮아 2D처럼 격자 전체를 한눈에 볼 수 없기 때문이다.
   */
  private bakeTerrain(game: Game): THREE.CanvasTexture {
    const { cols, rows } = game.grid
    const px = 32
    const canvas = document.createElement('canvas')
    canvas.width = cols * px
    canvas.height = rows * px
    const ctx = canvas.getContext('2d')!
    const rng = new Rng(0xa11ce)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const kind = game.grid.kindAt(col, row)
        const x = col * px
        const y = row * px

        if (kind === 'path') {
          ctx.fillStyle = '#7d6a4b'
          ctx.fillRect(x, y, px, px)
          // 수레바퀴 자국과 자갈. 길이 평평한 갈색 띠로 보이지 않게 한다.
          for (let i = 0; i < 26; i++) {
            const shade = rng.next()
            ctx.fillStyle =
              shade > 0.72 ? 'rgba(0,0,0,0.20)' : shade > 0.4 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)'
            const s = rng.range(1, 4)
            ctx.fillRect(x + rng.range(0, px - s), y + rng.range(0, px - s), s, s)
          }
        } else {
          const base = kind === 'blocked' ? '#39422f' : rng.next() > 0.5 ? '#46523c' : '#3f4a36'
          ctx.fillStyle = base
          ctx.fillRect(x, y, px, px)
          for (let i = 0; i < 18; i++) {
            ctx.fillStyle = rng.next() > 0.5 ? 'rgba(190,200,150,0.07)' : 'rgba(0,0,0,0.10)'
            const w = rng.range(1, 3)
            ctx.fillRect(x + rng.range(0, px - w), y + rng.range(0, px - 2), w, rng.range(1, 3))
          }
          if (kind === 'buildable') {
            ctx.strokeStyle = 'rgba(220,232,255,0.055)'
            ctx.lineWidth = 1
            ctx.strokeRect(x + 0.5, y + 0.5, px - 1, px - 1)
          }
        }
      }
    }

    // 길 가장자리 어둡게 — 흙이 들판보다 낮게 패여 보인다.
    ctx.strokeStyle = 'rgba(30,24,14,0.55)'
    ctx.lineWidth = 3
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (game.grid.kindAt(col, row) !== 'path') continue
        const x = col * px
        const y = row * px
        if (game.grid.kindAt(col, row - 1) !== 'path') line(ctx, x, y, x + px, y)
        if (game.grid.kindAt(col, row + 1) !== 'path') line(ctx, x, y + px, x + px, y + px)
        if (game.grid.kindAt(col - 1, row) !== 'path') line(ctx, x, y, x, y + px)
        if (game.grid.kindAt(col + 1, row) !== 'path') line(ctx, x + px, y, x + px, y + px)
      }
    }

    const texture = this.track(new THREE.CanvasTexture(canvas))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }

  private buildGround(game: Game): THREE.Object3D {
    const geometry = this.track(
      new THREE.PlaneGeometry(this.frame.widthM, this.frame.depthM, 1, 1),
    )
    const material = this.track(
      new THREE.MeshLambertMaterial({ map: this.bakeTerrain(game) }),
    )
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.receiveShadow = true
    mesh.name = 'ground'
    return mesh
  }

  /** 맵 밖으로 이어지는 들판. 성벽 너머가 허공이면 세계가 접시처럼 보인다. */
  private buildOuterField(): THREE.Object3D {
    const geometry = this.track(new THREE.PlaneGeometry(600, 600))
    const material = this.track(new THREE.MeshLambertMaterial({ color: C.grassDark }))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -0.06
    return mesh
  }

  /**
   * 먼 산줄기.
   *
   * 안개에 반쯤 묻힌 실루엣만 있으면 된다 — 조선의 전장은 산이 둘러싼 분지이고,
   * 무엇보다 1인칭에서 방향 감각을 잡아 주는 것이 지평선의 굴곡이다.
   */
  private buildMountains(): THREE.Object3D {
    const group = new THREE.Group()
    const rng = new Rng(0xbeef)
    const geometry = this.track(new THREE.ConeGeometry(1, 1, 5, 1))
    const material = this.track(
      new THREE.MeshLambertMaterial({ color: 0x1c2635, flatShading: true, fog: true }),
    )

    for (let i = 0; i < 34; i++) {
      const angle = (i / 34) * Math.PI * 2 + rng.range(-0.06, 0.06)
      const radius = rng.range(120, 210)
      const height = rng.range(26, 62)
      const peak = new THREE.Mesh(geometry, material)
      peak.position.set(Math.cos(angle) * radius, height / 2 - 4, Math.sin(angle) * radius)
      peak.scale.set(rng.range(28, 55), height, rng.range(28, 55))
      peak.rotation.y = rng.range(0, Math.PI)
      group.add(peak)
    }
    return group
  }

  // ────────────────────────────── 지물 ──────────────────────────────

  /** 막힌 타일에 바위 무더기나 소나무를 세운다. 못 짓는 칸이 눈으로 읽혀야 한다. */
  private buildProps(game: Game): void {
    const rng = new Rng(0x7a17)
    const rockGeo = this.track(new THREE.IcosahedronGeometry(1, 0))
    const rockMat = this.track(new THREE.MeshLambertMaterial({ color: C.rock, flatShading: true }))
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.14, 0.2, 1, 6))
    const trunkMat = this.track(new THREE.MeshLambertMaterial({ color: C.trunk }))
    const canopyGeo = this.track(new THREE.ConeGeometry(1, 1, 7))
    const canopyMat = this.track(
      new THREE.MeshLambertMaterial({ color: C.canopy, flatShading: true }),
    )

    for (const tile of game.stage.level.blocked) {
      if (game.grid.kindAt(tile.x, tile.y) !== 'blocked') continue
      const center = this.frame.tileCenter(tile.x, tile.y)

      if (rng.next() < 0.45) {
        // 소나무 — 조선 산야의 기본 나무.
        const tree = new THREE.Group()
        const h = rng.range(2.6, 4.2)
        const trunk = new THREE.Mesh(trunkGeo, trunkMat)
        trunk.scale.set(1, h * 0.5, 1)
        trunk.position.y = h * 0.25
        trunk.castShadow = true
        tree.add(trunk)
        for (let i = 0; i < 3; i++) {
          const cone = new THREE.Mesh(canopyGeo, canopyMat)
          const r = (1.05 - i * 0.24) * rng.range(0.9, 1.1)
          cone.scale.set(r, 1.1 - i * 0.2, r)
          cone.position.y = h * 0.42 + i * h * 0.24
          cone.rotation.y = rng.range(0, Math.PI)
          cone.castShadow = true
          tree.add(cone)
        }
        tree.position.copy(center)
        tree.position.x += rng.range(-0.3, 0.3)
        tree.position.z += rng.range(-0.3, 0.3)
        this.root.add(tree)
      } else {
        // 바위 무더기 — 큰 것 하나에 작은 것 둘.
        const cluster = new THREE.Group()
        for (let i = 0; i < 3; i++) {
          const rock = new THREE.Mesh(rockGeo, rockMat)
          const s = i === 0 ? rng.range(0.75, 1.05) : rng.range(0.3, 0.55)
          rock.scale.set(s * rng.range(0.8, 1.3), s * rng.range(0.6, 1.0), s * rng.range(0.8, 1.3))
          rock.position.set(rng.range(-0.7, 0.7), s * 0.4, rng.range(-0.7, 0.7))
          rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3))
          rock.castShadow = true
          rock.receiveShadow = true
          cluster.add(rock)
        }
        cluster.position.copy(center)
        this.root.add(cluster)
      }
    }
  }

  /**
   * 맵 경계의 성벽(石城).
   *
   * 1인칭에서 보이지 않는 벽에 부딪히는 것만큼 나쁜 것이 없다. 걸어서 나갈 수
   * 없는 곳에는 반드시 눈에 보이는 물건이 서 있어야 한다. 길이 드나드는
   * 칸만 비워 두면 그 구멍이 곧 성문이 된다.
   *
   * **조선 성곽의 세 겹을 그대로 쌓는다.**
   *   체성(體城)  아래가 넓고 위가 좁은 사다리꼴 몸통. 돌을 쌓아 올린 성벽은
   *               수직이 아니라 안쪽으로 기울어 있다(規式). 반듯한 상자로 세우면
   *               콘크리트 옹벽이 되고, 그 순간 전장이 공사장이 된다.
   *   미석(眉石)  몸통 위에 한 겹 내밀어 두른 갓돌. 이 그림자 선 하나가
   *               "쌓아 올린 것"과 "깎아 세운 것"을 가른다.
   *   여장(女牆)  꼭대기의 담. 낱개로 끊어 세우면 그 틈이 곧 총안(銃眼)이다.
   *               지평선에 톱니가 생겨 멀리서도 성이 성으로 읽힌다.
   *
   * 여기에 일정 간격으로 **치(雉)** 를 바깥으로 내민다. 성벽에 붙은 적을 옆에서
   * 치려고 튀어나온 네모 돌출부인데, 밋밋하게 이어지던 벽면에 리듬이 생긴다.
   *
   * 조각이 넷으로 늘었지만 드로우콜은 여전히 넷이다 — 전부 인스턴스로 찍는다.
   */
  private buildWalls(game: Game): void {
    const { cols, rows } = game.grid
    const spots: Array<{ col: number; row: number }> = []
    for (let col = 0; col < cols; col++) {
      spots.push({ col, row: -1 }, { col, row: rows })
    }
    for (let row = -1; row <= rows; row++) {
      spots.push({ col: -1, row }, { col: cols, row })
    }

    // 길이 맵 밖으로 이어지는 칸은 비운다 — 거기가 적이 드나드는 문이다.
    const open = new Set<string>()
    for (const route of game.stage.level.routes) {
      for (const p of route) {
        if (p.x < 0 || p.x >= cols || p.y < 0 || p.y >= rows) open.add(`${p.x},${p.y}`)
      }
      // 경로의 첫/끝 구간이 지나는 경계 밖 칸도 함께 연다.
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!
        const b = route[i]!
        if (a.x === b.x) {
          for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) open.add(`${a.x},${y}`)
        } else {
          for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) open.add(`${x},${a.y}`)
        }
      }
    }

    const blocks = spots.filter((s) => !open.has(`${s.col},${s.row}`))

    const BODY_H = 3.6
    const CAP_H = 0.22
    const MERLON_H = 0.9

    // 사각기둥은 CylinderGeometry(radialSegments=4)로 만든다 — 위아래 굵기를
    // 다르게 줄 수 있는 것이 BoxGeometry에는 없는 성질이고, 그 기울기가
    // 성벽을 성벽으로 보이게 하는 전부다. 45도 돌려 면이 축과 나란해지게 한다.
    const half = TILE_M / 2
    const bodyGeo = this.track(
      new THREE.CylinderGeometry(half * 0.92 * Math.SQRT2, half * 1.06 * Math.SQRT2, BODY_H, 4)
        .rotateY(Math.PI / 4),
    )
    const capGeo = this.track(new THREE.BoxGeometry(TILE_M * 0.94, CAP_H, TILE_M * 0.94))
    // 지대석(地臺石) — 성벽이 딛는 받침돌. 벽면이 땅에서 곧바로 솟으면 세워 둔
    // 판때기로 보이고, 한 겹 내밀어 두면 그 위에 쌓아 올린 것으로 읽힌다.
    const plinthGeo = this.track(new THREE.BoxGeometry(TILE_M * 1.08, 0.34, TILE_M * 1.08))
    const merlonGeo = this.track(new THREE.BoxGeometry(TILE_M * 0.42, MERLON_H, TILE_M * 0.5))
    const spurGeo = this.track(
      new THREE.CylinderGeometry(half * 0.72 * Math.SQRT2, half * 0.88 * Math.SQRT2, BODY_H + CAP_H, 4)
        .rotateY(Math.PI / 4),
    )

    const stone = this.track(new THREE.MeshLambertMaterial({ color: C.wall, flatShading: true }))
    const capStone = this.track(
      new THREE.MeshLambertMaterial({ color: C.wallDark, flatShading: true }),
    )

    // 치는 일곱 칸마다 하나. 촘촘하면 벽이 톱니처럼 보이고, 드물면 리듬이 안 생긴다.
    const spurAt = blocks.map((b, i) => i % 7 === 3 && !this.isCorner(b, cols, rows))
    const spurCount = spurAt.filter(Boolean).length

    const body = new THREE.InstancedMesh(bodyGeo, stone, blocks.length)
    const plinth = new THREE.InstancedMesh(plinthGeo, capStone, blocks.length)
    const cap = new THREE.InstancedMesh(capGeo, capStone, blocks.length)
    const merlons = new THREE.InstancedMesh(merlonGeo, stone, blocks.length * 2)
    const spurs = new THREE.InstancedMesh(spurGeo, stone, Math.max(1, spurCount))
    for (const m of [body, plinth, cap, merlons, spurs]) {
      m.castShadow = true
      m.receiveShadow = true
    }

    const rng = new Rng(0xc0ffee)
    const matrix = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const tint = new THREE.Color()
    let merlonIndex = 0
    let spurIndex = 0

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!
      const yaw = this.wallYaw(b, cols, rows)
      quat.setFromEuler(new THREE.Euler(0, yaw + rng.range(-0.02, 0.02), 0))
      // 손으로 쌓은 것이라 높이가 조금씩 다르다. 반듯하면 압출한 물건이 된다.
      const h = rng.range(0.94, 1.06)
      const top = BODY_H * h - 0.3

      this.frame.tileCenter(b.col, b.row, 0, pos)
      const baseX = pos.x
      const baseZ = pos.z

      pos.y = top - (BODY_H * h) / 2
      scale.set(1, h, 1)
      body.setMatrixAt(i, matrix.compose(pos, quat, scale))
      // 돌 색을 개체마다 살짝 흔든다. 한 색이면 벽 전체가 한 장의 판으로 보인다.
      // 인스턴스 색은 **재질색에 곱해진다.** 여기에 벽 색을 한 번 더 넣으면
      // 두 번 곱해져 벽이 통째로 시커메진다. 밝기만 흔든다.
      const shade = rng.range(0.86, 1.12)
      body.setColorAt(i, tint.setScalar(shade))

      pos.y = top + CAP_H / 2
      scale.set(1, 1, 1)
      cap.setMatrixAt(i, matrix.compose(pos, quat, scale))

      pos.y = 0.1
      plinth.setMatrixAt(i, matrix.compose(pos, quat, scale))

      // 여장 둘 — 그 사이가 총안이다. 바깥쪽 가장자리에 세운다.
      for (const side of [-1, 1]) {
        // 성벽 진행 방향(로컬 +X)으로 벌리고, 바깥(로컬 −Z)으로 붙인다.
        const ox = Math.cos(yaw) * side * TILE_M * 0.26 + Math.sin(yaw) * -TILE_M * 0.22
        const oz = -Math.sin(yaw) * side * TILE_M * 0.26 + Math.cos(yaw) * -TILE_M * 0.22
        pos.set(baseX + ox, top + CAP_H + MERLON_H / 2, baseZ + oz)
        merlons.setMatrixAt(merlonIndex, matrix.compose(pos, quat, scale))
        merlons.setColorAt(merlonIndex, tint.setScalar(rng.range(0.9, 1.1)))
        merlonIndex++
      }

      if (spurAt[i]) {
        // 치 — 바깥으로 반 칸 내민다.
        const ox = Math.sin(yaw) * -TILE_M * 0.62
        const oz = Math.cos(yaw) * -TILE_M * 0.62
        pos.set(baseX + ox, top - (BODY_H * h) / 2 + 0.1, baseZ + oz)
        scale.set(1, h * 0.96, 1)
        spurs.setMatrixAt(spurIndex, matrix.compose(pos, quat, scale))
        spurs.setColorAt(spurIndex, tint.setScalar(rng.range(0.88, 1.08)))
        spurIndex++
      }
    }

    merlons.count = merlonIndex
    spurs.count = spurIndex
    for (const m of [body, plinth, cap, merlons, spurs]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    this.root.add(body, plinth, cap, merlons, spurs)
  }

  /**
   * 성벽 한 칸이 놓인 방향 — 로컬 +X가 벽을 따라가고 로컬 −Z가 성 바깥을 본다.
   *
   * 여장과 치를 어느 쪽에 붙일지가 전부 이 값에서 나온다. 안팎을 뒤집으면
   * 총안이 성 안쪽을 겨누게 되어, 공성 쪽이 유리한 이상한 성이 된다.
   */
  private wallYaw(b: { col: number; row: number }, cols: number, rows: number): number {
    if (b.row < 0) return 0
    if (b.row >= rows) return Math.PI
    if (b.col < 0) return Math.PI / 2
    if (b.col >= cols) return -Math.PI / 2
    return 0
  }

  /** 네 귀퉁이 — 두 방향을 동시에 면해 치를 내밀 자리가 아니다. */
  private isCorner(b: { col: number; row: number }, cols: number, rows: number): boolean {
    return (b.col < 0 || b.col >= cols) && (b.row < 0 || b.row >= rows)
  }

  /**
   * 성문 둘 — 적이 나오는 문과 지켜야 하는 마을 문.
   *
   * 화면 어디를 봐도 "어디서 와서 어디로 가는가"가 읽혀야 한다. 2D에서는
   * 경로 전체가 한눈에 보여 저절로 알 수 있었지만, 눈높이가 사람 키로
   * 내려오면 그 정보가 통째로 사라진다. 그래서 양 끝에 못 놓칠 물건을 세운다.
   */
  private buildGates(game: Game): void {
    const timber = this.track(new THREE.MeshLambertMaterial({ color: C.timber }))
    const roof = this.track(new THREE.MeshLambertMaterial({ color: C.roofTile, flatShading: true }))
    const pillarGeo = this.track(new THREE.CylinderGeometry(0.34, 0.4, 5, 8))
    const beamGeo = this.track(new THREE.BoxGeometry(TILE_M * 2.4, 0.5, 0.6))
    const roofGeo = this.track(new THREE.BoxGeometry(TILE_M * 3.0, 0.36, 2.2))

    const seen = new Set<string>()
    for (const path of game.paths) {
      for (const [end, at] of [
        [false, 0],
        [true, path.totalLength],
      ] as const) {
        const p = path.positionAt(at)
        const key = `${Math.round(p.x)},${Math.round(p.y)}`
        if (seen.has(key)) continue
        seen.add(key)

        const dir = path.directionAt(end ? path.totalLength : 0)
        const gate = new THREE.Group()
        gate.position.copy(this.frame.toWorld(p))
        // 문은 길을 가로질러 선다. 진행 방향의 수직이 문의 폭이다.
        gate.rotation.y = -Math.atan2(dir.y, dir.x)

        for (const side of [-1, 1]) {
          const pillar = new THREE.Mesh(pillarGeo, timber)
          pillar.position.set(0, 2.5, side * TILE_M * 1.1)
          pillar.castShadow = true
          gate.add(pillar)
        }
        const beam = new THREE.Mesh(beamGeo, timber)
        beam.position.y = 4.7
        beam.rotation.y = Math.PI / 2
        beam.castShadow = true
        gate.add(beam)

        const eave = new THREE.Mesh(roofGeo, roof)
        eave.position.y = 5.15
        eave.rotation.y = Math.PI / 2
        eave.castShadow = true
        gate.add(eave)

        // 마을 쪽 문에만 청사초롱을 단다 — 따뜻한 불빛이 곧 지켜야 하는 것이다.
        if (end) {
          for (const side of [-1, 1]) {
            gate.add(this.makeLantern(new THREE.Vector3(0, 3.9, side * TILE_M * 1.1), 26))
          }
        }
        this.root.add(gate)
      }
    }
  }

  /** 청사초롱 하나. 발광체 + 흔들리는 점광원. */
  private makeLantern(at: THREE.Vector3, intensity: number): THREE.Object3D {
    const group = new THREE.Group()
    const geo = this.track(new THREE.SphereGeometry(0.22, 8, 6))
    const mat = this.track(new THREE.MeshBasicMaterial({ color: C.lantern }))
    const bulb = new THREE.Mesh(geo, mat)
    group.add(bulb)

    const light = new THREE.PointLight(C.lantern, intensity, 16, 2)
    group.add(light)
    this.torches.push({ light, base: intensity, seed: at.x * 3.1 + at.z })

    group.position.copy(at)
    return group
  }

  /**
   * 조명.
   *
   * **세기가 커 보이는 것은 three가 물리 단위를 쓰기 때문이다.** r155부터
   * 조명은 물리적으로 계산되어 확산 반사에 1/π가 곱해진다. 눈으로 "달빛 한
   * 개 분량"이라고 생각한 값을 그대로 넣으면 화면이 3분의 1로 어두워진다 —
   * 처음 넣은 1.85가 딱 그 함정이었고, 들판이 거의 검게 나왔다.
   */
  private buildLights(): void {
    const moon = new THREE.DirectionalLight(0xc2d2ee, 5.2)
    moon.position.set(-60, 70, -80)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    // **맵의 대각선 절반보다 넓게 잡는다.** 좁게 잡으면 그림자 카메라 밖의
    // 땅이 가장자리 텍셀을 물어 통째로 검게 깔린다 — 화면 절반이 이유 없이
    // 어두워지는 증상의 정체가 이것이었다.
    const span = Math.hypot(this.frame.widthM, this.frame.depthM) / 2 + TILE_M * 5
    const cam = moon.shadow.camera
    cam.left = -span
    cam.right = span
    cam.top = span
    cam.bottom = -span
    cam.near = 1
    cam.far = 260
    // 자기 그림자 얼룩(shadow acne)을 막는다. 지면이 넓고 평평해 특히 잘 생긴다.
    moon.shadow.bias = -0.0012
    moon.shadow.normalBias = 0.04
    this.root.add(moon)
    this.root.add(moon.target)

    // 하늘/땅 반사광. 이게 없으면 달빛이 닿지 않는 면이 완전한 검정이 된다.
    this.root.add(new THREE.HemisphereLight(0x3d5273, 0x232619, 3.4))

    // 채움광 — 달의 **반대편**에서 아주 약하게. 그림자를 만들지 않는다.
    //
    // 반구광만으로는 수직면이 살아나지 않는다. 하늘빛은 위에서 내려오므로
    // 성벽의 안쪽 면이나 적의 등처럼 서 있는 면에는 거의 닿지 않아서, 달을
    // 등진 쪽이 통째로 검은 판이 됐다. 방향이 반대인 약한 빛 하나가 그 면에
    // 형태를 돌려준다 — 밝히는 것이 목적이 아니라 **면을 구분시키는** 것이다.
    const fill = new THREE.DirectionalLight(0x8fa6c8, 1.5)
    fill.position.set(70, 40, 90)
    this.root.add(fill)
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}
