import * as THREE from 'three'
import { Rng } from '../core/rng'
import { REGION } from '../data/land'
import type { Game } from '../game/Game'
import { bakeGround, bakeGroundNormals, GROUND_EXTENT } from './ground'
import { C } from './palette'
import { castShadows } from './shadows'
import { SUN_DIR } from './sky'
import { Terrain } from './terrain'
import { buildWater, type Water } from './water'

/**
 * 한 판 동안 변하지 않는 것 전부 — 물·땅·다리·롱하우스·나무·바위·중립 캠프.
 *
 * 매 프레임 바뀌는 것(유닛·아바타·안개·소유권)은 `Actors`가 맡는다. 경계를
 * 이렇게 그은 이유는 지형이 **판을 시작할 때 한 번만** 만들어지면 되기
 * 때문이다. 여기까지 매 프레임 훑으면 유닛이 서른 마리 붙는 순간 프레임이
 * 무너진다(GDD 7.3).
 */
/**
 * 그림자 카메라가 덮을 반경. 아홉 칸이 ±48 안에 들어오고 나무·바위가 조금 더
 * 나가므로 여유를 조금만 준다. 넓힐수록 같은 맵에 더 성긴 그림자가 된다.
 */
const SHADOW_HALF = 62

/** 수평선까지 채우는 바깥 바다의 반경. 안개가 끝나는 거리보다 멀면 된다. */
const SEA_EXTENT = 900

/**
 * 지면 격자의 분할 수.
 *
 * 한 칸이 약 0.9 월드 단위가 된다. 더 잘게 쪼개도 눈에 안 보이는데 정점만
 * 늘고, 더 성기면 해안선이 각지게 꺾인다. 잔 요철은 여기서 만들지 않고
 * 법선맵이 맡는다(`bakeGroundNormals`).
 */
const GROUND_SEGMENTS = 128

export class World {
  readonly root = new THREE.Group()
  /**
   * 땅의 높이. 화면 밖에서도 쓰인다 — 유닛도 시신도 반경 링도 전부 이걸
   * 물어서 제 높이를 찾는다. **시뮬레이션은 이걸 모른다**(`terrain.ts`).
   */
  readonly terrain: Terrain

  /** 돌성채를 점령하면 켜지는 전초 탑. 미리 만들고 보이기만 토글한다. */
  private readonly outposts = new Map<number, THREE.Object3D>()
  private readonly campProps = new Map<number, THREE.Object3D>()

  /**
   * 칸마다 그 위에 선 것들을 한 묶음으로 들고 있다.
   *
   * 안개를 **바닥 판 한 장**으로만 그리면 안 밝힌 칸의 성과 나무가 그 위로
   * 삐져나온다. 반투명 상자를 씌워 가리는 방법도 있지만 투명 정렬이
   * 어긋나기 쉬워서, 아예 **칸째로 숨긴다**. 안 본 땅은 그리지 않는 것이
   * 안개의 정직한 구현이기도 하다.
   */
  private readonly tileGroups = new Map<number, THREE.Group>()

  private readonly disposables: { dispose(): void }[] = []
  private water: Water | null = null

  constructor(game: Game, seed: number, sky: THREE.Texture) {
    this.terrain = new Terrain(game.board.land, seed)
    for (const d of game.board.defs) {
      const g = new THREE.Group()
      this.tileGroups.set(d.id, g)
      this.root.add(g)
    }
    this.buildLights()
    this.buildGround(game, seed, sky)
    this.buildKeeps(game)
    this.buildScatter(game, seed)
    this.buildCamps(game)
    // 칸 위에 세운 것들만 훑는다 — 지면은 위에서 따로 받기만 하도록 잡았다.
    for (const g of this.tileGroups.values()) castShadows(g)
  }

  private tileGroup(id: number): THREE.Group {
    return this.tileGroups.get(id)!
  }

  /**
   * 칸 한가운데를 기준으로 한 그 자리의 높이 차.
   *
   * 캠프 표식들은 칸 중심에 놓인 그룹의 자식이라 좌표가 이미 상대값이다.
   * 절대 높이를 넣으면 두 번 더해진다.
   */
  private localRise(cx: number, cz: number, a: number, r: number): number {
    return (
      this.terrain.heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r) -
      this.terrain.heightAt(cx, cz)
    )
  }

  /**
   * 북유럽 해안의 낮은 해.
   *
   * **그림자를 켰다.** 전에는 "아홉 칸짜리 맵에서 그림자맵 비용이 값어치보다
   * 크다"고 보고 껐는데, 그 판단이 틀렸다. 그림자는 장식이 아니라 물체를 땅에
   * 붙이는 유일한 단서다 — 없으면 유닛이 지면 위에 떠 있는 스티커로 보인다.
   * 맵이 ±48 안에 다 들어오므로 그림자 카메라를 딱 그만큼만 덮게 잘라 두면
   * 2048 맵 한 장으로 충분히 선명하다.
   *
   * 반구광을 오히려 **낮췄다.** 반구광은 모든 면을 고르게 밝히는 빛이라,
   * 세면 셀수록 형태가 페인트칠한 판때기처럼 납작해진다. 밝기는 태양이 내고
   * 반구광은 그림자 속을 죽지 않게 받쳐 주는 역할만 맡는다.
   */
  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0x93b6cf, 0x2b3a30, 0.9)
    this.root.add(hemi)

    const sun = new THREE.DirectionalLight(0xffe9c9, 2.9)
    sun.position.copy(SUN_DIR).multiplyScalar(90)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const cam = sun.shadow.camera
    cam.left = -SHADOW_HALF
    cam.right = SHADOW_HALF
    cam.top = SHADOW_HALF
    cam.bottom = -SHADOW_HALF
    cam.near = 10
    cam.far = 200
    cam.updateProjectionMatrix()
    // 넓고 평평한 지면에서는 bias만으로 여드름이 안 잡힌다. 법선 방향으로
    // 밀어내는 normalBias가 이런 지형에 훨씬 잘 듣는다.
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.6
    this.root.add(sun, sun.target)

    const rim = new THREE.DirectionalLight(0x6f97bd, 0.55)
    rim.position.set(50, 20, -40)
    this.root.add(rim)
  }

  private buildGround(game: Game, seed: number, sky: THREE.Texture): void {
    const painted = bakeGround(game.board.defs, seed, this.terrain)
    const tex = new THREE.CanvasTexture(painted)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    // 칠한 그림의 밝기 변화를 잔 요철로 되돌려 받는다. 격자 한 칸(0.9)보다
    // 잘게는 메시로 못 만드는 결이라, 없으면 가까이서 땅이 매끈해진다.
    const nrm = new THREE.CanvasTexture(bakeGroundNormals(painted))
    nrm.colorSpace = THREE.NoColorSpace
    this.disposables.push(tex, nrm)

    // 눕혀 놓고 다룬다. 세워 둔 채로 눌러 붙이면 높이 축이 z가 되어 헷갈린다.
    const geo = new THREE.PlaneGeometry(
      GROUND_EXTENT * 2,
      GROUND_EXTENT * 2,
      GROUND_SEGMENTS,
      GROUND_SEGMENTS,
    )
    geo.rotateX(-Math.PI / 2)
    this.terrain.displace(geo)

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.95,
      metalness: 0,
    })
    this.disposables.push(geo, mat)

    const mesh = new THREE.Mesh(geo, mat)
    /**
     * 지면은 여전히 **받기만** 한다.
     *
     * 굴곡이 생겼으니 스스로에게도 드리우게 해봤는데, 그림자 패스에 정점
     * 만 개짜리 메시가 한 번 더 들어가는 값에 비해 얻는 것이 거의 없었다 —
     * 기복이 완만해서 자기 그림자가 지는 자리가 별로 없다. 굴곡은 그림자가
     * 아니라 **경사에 따라 바위가 드러나는 색**(`bakeGround`)과 법선맵이
     * 읽어 준다.
     */
    mesh.receiveShadow = true
    this.root.add(mesh)

    /**
     * 수평선까지 채우는 바깥 바닥.
     *
     * 지면 텍스처를 키우면 해상도가 낭비되므로, 단색 판 한 장을 훨씬 넓게
     * 깔아 수평선까지 채운다. 수면은 이 위에 따로 깔리고, 안개가 둘 다
     * 지평선 색으로 녹여서 끝을 지운다.
     */
    const seaGeo = new THREE.PlaneGeometry(SEA_EXTENT * 2, SEA_EXTENT * 2)
    seaGeo.rotateX(-Math.PI / 2)
    const seaMat = new THREE.MeshStandardMaterial({ color: C.deepWater, roughness: 1 })
    this.disposables.push(seaGeo, seaMat)
    const sea = new THREE.Mesh(seaGeo, seaMat)
    sea.position.y = -3.6
    this.root.add(sea)

    // 수면. 하늘을 비추는 것이 물을 물로 만든다(`water.ts`).
    this.water = buildWater(SEA_EXTENT, GROUND_EXTENT + 30, sky)
    this.disposables.push(...this.water.disposables)
    this.root.add(this.water.root)
  }

  /** 롱하우스 — 긴 몸통 위에 삼각 지붕. 프리미티브 셋이면 충분히 읽힌다. */
  private buildKeeps(game: Game): void {
    for (const p of game.players) {
      // 지역 중심이 물일 수 있으므로 대표점 위에 세운다(`Board.anchor`).
      const d = game.board.anchor(p.keepTile)
      const g = new THREE.Group()
      g.position.set(d.x, this.terrain.heightAt(d.x, d.z), d.z)
      // 1인칭으로 내려가면 시야를 통째로 막던 크기라 줄여 뒀다.
      g.scale.setScalar(0.62)

      const wallGeo = new THREE.BoxGeometry(15, 5.2, 8)
      const wallMat = new THREE.MeshStandardMaterial({ color: C.keepWood, roughness: 0.85 })
      const wall = new THREE.Mesh(wallGeo, wallMat)
      wall.position.y = 2.6
      g.add(wall)

      // 지붕은 실린더의 반지름 분할을 3으로 두면 삼각 기둥이 된다.
      const roofGeo = new THREE.CylinderGeometry(6.2, 6.2, 15.4, 3, 1)
      const roofMat = new THREE.MeshStandardMaterial({ color: C.keepRoof, roughness: 0.95 })
      const roof = new THREE.Mesh(roofGeo, roofMat)
      roof.rotation.z = Math.PI / 2
      roof.rotation.y = Math.PI / 2
      roof.position.y = 6.4
      g.add(roof)

      // 진영 깃대. 멀리서도 누구 성인지 알아야 한다.
      const poleGeo = new THREE.CylinderGeometry(0.22, 0.22, 12, 6)
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x4b4438 })
      const pole = new THREE.Mesh(poleGeo, poleMat)
      pole.position.set(7.5, 7.5, 4.4)
      g.add(pole)

      // 깃발은 높이 단다. 낮게 달면 아바타가 본진 옆에서 강림했을 때 화면
      // 절반을 파란 판때기가 덮는다.
      const flagGeo = new THREE.PlaneGeometry(3.8, 2.3)
      const flagMat = new THREE.MeshStandardMaterial({
        color: C.side[p.side],
        side: THREE.DoubleSide,
        roughness: 0.8,
      })
      const flag = new THREE.Mesh(flagGeo, flagMat)
      flag.position.set(9.5, 12.4, 4.4)
      g.add(flag)

      this.disposables.push(wallGeo, wallMat, roofGeo, roofMat, poleGeo, poleMat, flagGeo, flagMat)
      this.tileGroup(p.keepTile).add(g)
    }
  }

  /** 나무와 바위. 1인칭으로 내려갔을 때 "장소"가 되게 하는 유일한 장치다. */
  private buildScatter(game: Game, seed: number): void {
    const rng = new Rng(seed ^ 0xa11ce)

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 5)
    const coneGeo = new THREE.ConeGeometry(1.7, 5.4, 6)
    const rockGeo = new THREE.IcosahedronGeometry(1, 0)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2f24, roughness: 1 })
    const treeMat = new THREE.MeshStandardMaterial({ color: C.tree, roughness: 1 })
    const treeMat2 = new THREE.MeshStandardMaterial({ color: C.treeDark, roughness: 1 })
    const rockMat = new THREE.MeshStandardMaterial({ color: C.rock, roughness: 1 })
    this.disposables.push(trunkGeo, coneGeo, rockGeo, trunkMat, treeMat, treeMat2, rockMat)

    const keeps = new Set(game.players.map((p) => p.keepTile))

    for (const d of game.board.defs) {
      const isKeep = keeps.has(d.id)
      // 지역이 넓어졌으므로 나무도 늘린다. 예전 밀도로 두면 벌판이 된다.
      const trees = isKeep ? 8 : 22
      const half = REGION / 2 - 2
      for (let i = 0; i < trees; i++) {
        const x = d.x + rng.range(-half, half)
        const z = d.z + rng.range(-half, half)
        // 물에는 안 심는다. 지역이 물을 걸치고 있을 수 있다.
        if (!game.board.land.walkableAt({ x, z })) continue
        // 지역 한가운데는 비워 둔다 — 부대가 모이고 싸우는 자리다.
        if (Math.hypot(x - d.x, z - d.z) < 8) continue
        const s = rng.range(0.75, 1.25)
        // 나무는 제가 선 자리의 높이 위에 선다. 이걸 빼면 언덕에 심은 나무가
        // 허리까지 땅에 묻힌다.
        const y = this.terrain.heightAt(x, z)
        const trunk = new THREE.Mesh(trunkGeo, trunkMat)
        trunk.position.set(x, y + 1.2 * s, z)
        trunk.scale.setScalar(s)
        this.tileGroup(d.id).add(trunk)

        const cone = new THREE.Mesh(coneGeo, rng.next() < 0.5 ? treeMat : treeMat2)
        cone.position.set(x, y + (2.4 + 2.7) * s, z)
        cone.scale.setScalar(s)
        cone.rotation.y = rng.range(0, Math.PI)
        this.tileGroup(d.id).add(cone)
      }

      for (let i = 0; i < 4; i++) {
        const x = d.x + rng.range(-half, half)
        const z = d.z + rng.range(-half, half)
        if (Math.hypot(x - d.x, z - d.z) < 5) continue
        const rock = new THREE.Mesh(rockGeo, rockMat)
        const s = rng.range(0.5, 1.5)
        rock.position.set(x, this.terrain.heightAt(x, z) + s * 0.4, z)
        rock.scale.set(s, s * 0.6, s)
        rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3))
        this.tileGroup(d.id).add(rock)
      }
    }
  }

  /**
   * 중립 캠프의 표식.
   *
   * 세 갈래가 **생김새만 보고 구분되어야** 한다(GDD 4.3). 규칙 모르는 사람에게
   * 쥐어주고 관찰하는 것이 판정이므로, 툴팁을 읽게 만들면 그 판정이 흐려진다.
   */
  private buildCamps(game: Game): void {
    for (const t of game.board.tiles) {
      const camp = t.neutral
      if (!camp) continue
      const g = new THREE.Group()
      g.position.set(t.def.x, this.terrain.heightAt(t.def.x, t.def.z), t.def.z)

      if (camp.kind === 'mercenary') {
        // 창을 원형으로 꽂아 둔 야영지.
        const spearGeo = new THREE.CylinderGeometry(0.16, 0.16, 7, 5)
        const spearMat = new THREE.MeshStandardMaterial({ color: C.neutralDark, roughness: 0.9 })
        this.disposables.push(spearGeo, spearMat)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const s = new THREE.Mesh(spearGeo, spearMat)
          s.position.set(Math.cos(a) * 4.5, 3.2 + this.localRise(t.def.x, t.def.z, a, 4.5), Math.sin(a) * 4.5)
          s.rotation.z = Math.cos(a) * 0.18
          s.rotation.x = -Math.sin(a) * 0.18
          g.add(s)
        }
        const fireGeo = new THREE.ConeGeometry(1.4, 2.2, 6)
        const fireMat = new THREE.MeshStandardMaterial({
          color: 0xd98b3a,
          emissive: 0x7a3f10,
          roughness: 0.7,
        })
        this.disposables.push(fireGeo, fireMat)
        const fire = new THREE.Mesh(fireGeo, fireMat)
        fire.position.y = 1.1
        g.add(fire)
      } else if (camp.kind === 'creature') {
        // 굴과 뼈.
        const denGeo = new THREE.SphereGeometry(3.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
        const denMat = new THREE.MeshStandardMaterial({ color: C.rockDark, roughness: 1 })
        this.disposables.push(denGeo, denMat)
        const den = new THREE.Mesh(denGeo, denMat)
        g.add(den)

        const boneGeo = new THREE.CylinderGeometry(0.2, 0.2, 3.2, 5)
        const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc9b6, roughness: 0.9 })
        this.disposables.push(boneGeo, boneMat)
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(boneGeo, boneMat)
          const a = (i / 4) * Math.PI * 2 + 0.4
          b.position.set(Math.cos(a) * 5, 0.25 + this.localRise(t.def.x, t.def.z, a, 5), Math.sin(a) * 5)
          b.rotation.z = Math.PI / 2
          b.rotation.y = a
          g.add(b)
        }
      } else {
        // 무너진 돌성채 — 높이가 다른 기둥 넷.
        const colMat = new THREE.MeshStandardMaterial({ color: C.rock, roughness: 1 })
        this.disposables.push(colMat)
        const heights = [7.5, 4.2, 6.1, 2.8]
        for (let i = 0; i < 4; i++) {
          const h = heights[i]!
          const geo = new THREE.BoxGeometry(2.6, h, 2.6)
          this.disposables.push(geo)
          const m = new THREE.Mesh(geo, colMat)
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          m.position.set(Math.cos(a) * 4.6, h / 2 + this.localRise(t.def.x, t.def.z, a, 4.6), Math.sin(a) * 4.6)
          m.rotation.y = a
          g.add(m)
        }
      }

      this.campProps.set(t.def.id, g)
      this.tileGroup(t.def.id).add(g)

      // 전초는 성채 칸에만 생긴다. 미리 세워두고 숨긴다.
      if (camp.kind === 'ruin') {
        const tower = this.buildOutpost()
        tower.position.set(t.def.x, this.terrain.heightAt(t.def.x, t.def.z), t.def.z)
        tower.visible = false
        this.outposts.set(t.def.id, tower)
        this.tileGroup(t.def.id).add(tower)
      }
    }
  }

  private buildOutpost(): THREE.Object3D {
    const g = new THREE.Group()
    const bodyGeo = new THREE.CylinderGeometry(2.2, 2.8, 11, 8)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6e7480, roughness: 0.9 })
    const topGeo = new THREE.ConeGeometry(3.2, 3.4, 8)
    const topMat = new THREE.MeshStandardMaterial({
      color: 0xf0d9a0,
      emissive: 0x4a3a12,
      roughness: 0.6,
    })
    this.disposables.push(bodyGeo, bodyMat, topGeo, topMat)

    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = 5.5
    g.add(body)
    const top = new THREE.Mesh(topGeo, topMat)
    top.position.y = 12.4
    g.add(top)
    return g
  }

  /**
   * 캠프가 뚫리면 표식을 눌러 두고, 성채를 먹으면 탑을 켠다.
   * 그리고 **한 번도 못 본 칸은 통째로 숨긴다** — 안개의 실제 구현이다.
   */
  sync(game: Game, viewer: 0 | 1): void {
    // 물은 시뮬레이션 시각으로 흐른다. 프레임 간격을 쓰면 탭을 잠깐 떠났다
    // 돌아왔을 때 물결이 튄다.
    this.water?.tick(game.telemetry.elapsed)

    for (const t of game.board.tiles) {
      this.tileGroup(t.def.id).visible = t.seen[viewer]
    }
    for (const t of game.board.tiles) {
      const camp = t.neutral
      if (!camp) continue
      const prop = this.campProps.get(t.def.id)
      if (prop) prop.visible = !camp.cleared || camp.kind === 'ruin'
      const tower = this.outposts.get(t.def.id)
      if (tower) tower.visible = t.outpost
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
