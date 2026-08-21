import * as THREE from 'three'
import { Rng } from '../core/rng'
import { TILE_LAND } from '../data/fjord'
import type { Game } from '../game/Game'
import { bakeGround, GROUND_EXTENT } from './ground'
import { C } from './palette'

/**
 * 한 판 동안 변하지 않는 것 전부 — 물·땅·다리·롱하우스·나무·바위·중립 캠프.
 *
 * 매 프레임 바뀌는 것(유닛·아바타·안개·소유권)은 `Actors`가 맡는다. 경계를
 * 이렇게 그은 이유는 지형이 **판을 시작할 때 한 번만** 만들어지면 되기
 * 때문이다. 여기까지 매 프레임 훑으면 유닛이 서른 마리 붙는 순간 프레임이
 * 무너진다(GDD 7.3).
 */
export class World {
  readonly root = new THREE.Group()
  /** 지면 레이캐스트용 평면. 마우스가 가리키는 칸을 찾을 때 이것만 때린다. */
  readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

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

  constructor(game: Game, seed: number) {
    for (const d of game.board.defs) {
      const g = new THREE.Group()
      this.tileGroups.set(d.id, g)
      this.root.add(g)
    }
    this.buildLights()
    this.buildGround(game, seed)
    this.buildKeeps(game)
    this.buildScatter(game, seed)
    this.buildCamps(game)
  }

  private tileGroup(id: number): THREE.Group {
    return this.tileGroups.get(id)!
  }

  private buildLights(): void {
    // 북유럽 해안의 낮은 해. 그림자를 켜지 않은 것은 아홉 칸짜리 맵에서
    // 그림자맵 비용이 화면에 주는 값어치보다 크기 때문이다.
    const hemi = new THREE.HemisphereLight(0xa8c8de, 0x24352c, 1.35)
    this.root.add(hemi)

    const sun = new THREE.DirectionalLight(0xdfe9f0, 1.3)
    sun.position.set(-40, 70, 30)
    this.root.add(sun)

    const rim = new THREE.DirectionalLight(0x5f86a8, 0.4)
    rim.position.set(50, 20, -40)
    this.root.add(rim)
  }

  private buildGround(game: Game, seed: number): void {
    const tex = new THREE.CanvasTexture(bakeGround(game.board.defs, seed))
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    this.disposables.push(tex)

    const geo = new THREE.PlaneGeometry(GROUND_EXTENT * 2, GROUND_EXTENT * 2)
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 })
    this.disposables.push(geo, mat)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    this.root.add(mesh)

    // 물 아래로 한 겹 더. 카메라가 낮게 깔릴 때 지면이 종이처럼 보이지 않게 한다.
    const underGeo = new THREE.BoxGeometry(GROUND_EXTENT * 2, 6, GROUND_EXTENT * 2)
    const underMat = new THREE.MeshStandardMaterial({ color: C.deepWater, roughness: 1 })
    this.disposables.push(underGeo, underMat)
    const under = new THREE.Mesh(underGeo, underMat)
    under.position.y = -3.2
    this.root.add(under)
  }

  /** 롱하우스 — 긴 몸통 위에 삼각 지붕. 프리미티브 셋이면 충분히 읽힌다. */
  private buildKeeps(game: Game): void {
    for (const p of game.players) {
      const d = game.board.defs[p.keepTile]!
      const g = new THREE.Group()
      g.position.set(d.x, 0, d.z)
      // 칸 한 변이 28인데 예전에는 롱하우스가 15×12였다 — 1인칭으로 내려가면
      // 시야를 통째로 막았다. 칸의 3분의 1을 넘지 않게 줄인다.
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
      pole.position.set(7.5, 6, 4.4)
      g.add(pole)

      const flagGeo = new THREE.PlaneGeometry(4.4, 2.6)
      const flagMat = new THREE.MeshStandardMaterial({
        color: C.side[p.side],
        side: THREE.DoubleSide,
        roughness: 0.8,
      })
      const flag = new THREE.Mesh(flagGeo, flagMat)
      flag.position.set(9.8, 10.2, 4.4)
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
      const trees = isKeep ? 3 : 7
      const half = TILE_LAND / 2 - 2
      for (let i = 0; i < trees; i++) {
        const x = d.x + rng.range(-half, half)
        const z = d.z + rng.range(-half, half)
        // 칸 한가운데는 비워 둔다 — 부대가 모이고 싸우는 자리다.
        if (Math.hypot(x - d.x, z - d.z) < 6) continue
        const s = rng.range(0.75, 1.25)
        const trunk = new THREE.Mesh(trunkGeo, trunkMat)
        trunk.position.set(x, 1.2 * s, z)
        trunk.scale.setScalar(s)
        this.tileGroup(d.id).add(trunk)

        const cone = new THREE.Mesh(coneGeo, rng.next() < 0.5 ? treeMat : treeMat2)
        cone.position.set(x, (2.4 + 2.7) * s, z)
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
        rock.position.set(x, s * 0.4, z)
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
      g.position.set(t.def.x, 0, t.def.z)

      if (camp.kind === 'mercenary') {
        // 창을 원형으로 꽂아 둔 야영지.
        const spearGeo = new THREE.CylinderGeometry(0.16, 0.16, 7, 5)
        const spearMat = new THREE.MeshStandardMaterial({ color: C.neutralDark, roughness: 0.9 })
        this.disposables.push(spearGeo, spearMat)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const s = new THREE.Mesh(spearGeo, spearMat)
          s.position.set(Math.cos(a) * 4.5, 3.2, Math.sin(a) * 4.5)
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
          b.position.set(Math.cos(a) * 5, 0.25, Math.sin(a) * 5)
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
          m.position.set(Math.cos(a) * 4.6, h / 2, Math.sin(a) * 4.6)
          m.rotation.y = a
          g.add(m)
        }
      }

      this.campProps.set(t.def.id, g)
      this.tileGroup(t.def.id).add(g)

      // 전초는 성채 칸에만 생긴다. 미리 세워두고 숨긴다.
      if (camp.kind === 'ruin') {
        const tower = this.buildOutpost()
        tower.position.set(t.def.x, 0, t.def.z)
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
