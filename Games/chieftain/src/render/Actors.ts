import * as THREE from 'three'
import { TILE_LAND } from '../data/fjord'
import { TUNING } from '../data/tuning'
import { UNITS } from '../data/units'
import type { Game } from '../game/Game'
import { NEUTRAL, NOBODY, type Side, type Unit } from '../game/types'
import { C } from './palette'

/**
 * 매 프레임 바뀌는 것 — 유닛·아바타·지휘 반경·소유권·안개.
 *
 * 화면에서 가장 먼저 읽혀야 하는 것은 **지휘 반경 링**이다(GDD 3.1). 링 안의
 * 유닛은 발밑이 밝고 밖은 어둡다. 규칙을 글로 설명하지 않고 이 대비 하나로
 * 알아채게 만드는 것이 목표다 — 규칙 모르는 사람 3명이 판정자이기 때문이다
 * (GDD 6.5).
 */
export class Actors {
  readonly root = new THREE.Group()

  private readonly unitNodes = new Map<number, UnitNode>()
  private readonly tileTint: THREE.Mesh[] = []
  private readonly tileFog: THREE.Mesh[] = []
  private readonly avatarNodes: THREE.Group[] = []
  /** 타격 불꽃·시신·기지·집중 표식 — 매 프레임 수가 바뀌는 것들. */
  private readonly hitPool: THREE.Mesh[] = []
  private readonly corpsePool: THREE.Mesh[] = []
  private readonly forgeNodes = new Map<number, THREE.Group>()
  private readonly focusMark: THREE.Mesh
  private readonly radiusRing: THREE.Mesh
  private readonly rallyMark: THREE.Group
  private readonly disposables: { dispose(): void }[] = []

  // 유닛 메시는 지오메트리를 공유한다. 색만 인스턴스마다 다르다.
  /**
   * 유닛 몸의 크기.
   *
   * 실제 판정 반지름(`UNITS[].radius`, 1.0~1.15)보다 **눈에 보이는 몸을 크게**
   * 그린다. 칸 한 변이 28인데 반지름 1짜리 캡슐을 그대로 세우면 부감에서
   * 점으로만 보이고, 그러면 "반경 안 유닛의 발밑이 켜진다"는 이 게임의 유일한
   * 시각적 규칙 전달이 통째로 죽는다. 겹침 판정은 여전히 작은 반지름으로 한다 —
   * 보기와 판정이 다른 것을 감수하고 보기를 택한 자리다.
   */
  private static readonly VIEW_SCALE = 1.75

  private readonly geo = {
    body: new THREE.CapsuleGeometry(0.85, 1.6, 4, 8),
    shield: new THREE.BoxGeometry(0.35, 2.3, 1.9),
    haft: new THREE.CylinderGeometry(0.14, 0.14, 2.8, 5),
    axe: new THREE.BoxGeometry(0.32, 1.0, 0.95),
    foot: new THREE.RingGeometry(1.1, 1.62, 20),
    spark: new THREE.IcosahedronGeometry(1, 0),
    bar: new THREE.PlaneGeometry(1, 1),
    cloak: new THREE.ConeGeometry(1.6, 3.6, 8),
    head: new THREE.SphereGeometry(0.66, 10, 8),
  }

  constructor(game: Game) {
    for (const g of Object.values(this.geo)) this.disposables.push(g)

    this.buildTiles(game)
    this.radiusRing = this.buildRadiusRing()
    this.root.add(this.radiusRing)
    this.rallyMark = this.buildRallyMark()
    this.root.add(this.rallyMark)
    this.focusMark = this.buildFocusMark()
    this.root.add(this.focusMark)
    this.buildAvatars(game)
  }

  // ─────────────────────────────────────────────────────────── 만들기

  private buildTiles(game: Game): void {
    const tintGeo = new THREE.PlaneGeometry(TILE_LAND, TILE_LAND)
    const fogGeo = new THREE.PlaneGeometry(TILE_LAND + 6, TILE_LAND + 6)
    this.disposables.push(tintGeo, fogGeo)

    for (const d of game.board.defs) {
      const tintMat = new THREE.MeshBasicMaterial({
        color: C.side[0],
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      this.disposables.push(tintMat)
      const tint = new THREE.Mesh(tintGeo, tintMat)
      tint.rotation.x = -Math.PI / 2
      tint.position.set(d.x, 0.06, d.z)
      tint.renderOrder = 1
      this.tileTint.push(tint)
      this.root.add(tint)

      const fogMat = new THREE.MeshBasicMaterial({
        color: C.fog,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      })
      this.disposables.push(fogMat)
      const fog = new THREE.Mesh(fogGeo, fogMat)
      fog.rotation.x = -Math.PI / 2
      fog.position.set(d.x, 0.5, d.z)
      fog.renderOrder = 6
      this.tileFog.push(fog)
      this.root.add(fog)
    }
  }

  /** 지휘 반경 링. 이 게임에서 가장 중요한 한 줄의 그림이다. */
  private buildRadiusRing(): THREE.Mesh {
    const r = TUNING.commandRadius
    const geo = new THREE.RingGeometry(r - 0.7, r, 72)
    const mat = new THREE.MeshBasicMaterial({
      color: C.radius,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(geo, mat)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.position.y = 0.12
    m.renderOrder = 3
    return m
  }

  private buildRallyMark(): THREE.Group {
    const g = new THREE.Group()
    const geo = new THREE.RingGeometry(1.6, 2.2, 24)
    const mat = new THREE.MeshBasicMaterial({
      color: C.side[0],
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(geo, mat)
    const ring = new THREE.Mesh(geo, mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.14
    ring.renderOrder = 3
    g.add(ring)
    return g
  }

  /**
   * 집중 공격 표식.
   *
   * 지목한 적의 발밑에 붉은 고리가 돈다. 전투에 판단을 넣어 놓고 그 판단이
   * 화면에 안 보이면, 클릭한 사람은 자기가 뭘 했는지 모른다.
   */
  private buildFocusMark(): THREE.Mesh {
    const geo = new THREE.RingGeometry(2.1, 2.9, 26)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff5a4a,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(geo, mat)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.position.y = 0.16
    m.renderOrder = 3
    m.visible = false
    return m
  }

  /**
   * 아바타 — 유닛보다 크고, 망토가 있고, 머리 위로 빛기둥이 선다.
   *
   * 빛기둥을 세운 이유는 **부감에서 내가 어디 있는지 한눈에 보여야** 하기
   * 때문이다. 아바타를 잃어버리면 지휘 반경이 어디 있는지도 모르게 되고,
   * 그러면 규칙 자체가 안 보인다.
   */
  private buildAvatars(game: Game): void {
    for (const p of game.players) {
      const g = new THREE.Group()
      const color = C.side[p.side]

      const cloakMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
      const headMat = new THREE.MeshStandardMaterial({ color: 0xe4d7c2, roughness: 0.8 })
      this.disposables.push(cloakMat, headMat)

      // 아바타는 유닛보다 한 뼘 더 크다. 부감에서 누가 나인지 바로 보여야 한다.
      g.scale.setScalar(Actors.VIEW_SCALE * 1.15)

      const cloak = new THREE.Mesh(this.geo.cloak, cloakMat)
      cloak.position.y = 1.7
      cloak.scale.set(1, 1.35, 1)
      g.add(cloak)

      const head = new THREE.Mesh(this.geo.head, headMat)
      head.position.y = 4.3
      g.add(head)

      // 빛기둥. 반투명 원기둥이라 유닛을 가리지 않는다.
      const beamGeo = new THREE.CylinderGeometry(0.8, 1.5, 17, 10, 1, true)
      const beamMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      this.disposables.push(beamGeo, beamMat)
      const beam = new THREE.Mesh(beamGeo, beamMat)
      beam.position.y = 9.5
      beam.renderOrder = 4
      // 그룹 스케일을 되돌린다 — 몸만 커지고 빛기둥은 가늘게 유지한다.
      beam.scale.setScalar(1 / (Actors.VIEW_SCALE * 1.15))
      beam.scale.y = 1
      g.add(beam)

      this.avatarNodes.push(g)
      this.root.add(g)
    }
  }

  private nodeFor(u: Unit): UnitNode {
    const found = this.unitNodes.get(u.id)
    if (found) return found

    const color =
      u.faction === NEUTRAL ? C.neutral : C.side[u.faction as Side]
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
    const gearMat = new THREE.MeshStandardMaterial({
      color: u.faction === NEUTRAL ? C.neutralDark : C.sideDim[u.faction as Side],
      roughness: 0.8,
    })
    const footMat = new THREE.MeshBasicMaterial({
      color: C.radius,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(bodyMat, gearMat, footMat)

    const group = new THREE.Group()
    const body = new THREE.Mesh(this.geo.body, bodyMat)
    body.position.y = 1.6
    group.add(body)

    // 방패병은 방패를, 도끼병은 도끼를 든다. 실루엣만으로 구분되어야
    // "누구를 반경에 넣을 것인가"가 결정이 된다(GDD 6.2).
    if (u.kind === 'shield') {
      const sh = new THREE.Mesh(this.geo.shield, gearMat)
      sh.position.set(0, 1.7, 1.05)
      group.add(sh)
    } else {
      const haft = new THREE.Mesh(this.geo.haft, gearMat)
      haft.position.set(0.85, 2.2, 0.2)
      haft.rotation.x = 0.35
      group.add(haft)
      const head = new THREE.Mesh(this.geo.axe, gearMat)
      head.position.set(0.85, 3.4, 0.55)
      group.add(head)
    }

    // 발밑 링 — 지휘받는 동안만 켜진다.
    const foot = new THREE.Mesh(this.geo.foot, footMat)
    foot.rotation.x = -Math.PI / 2
    foot.position.y = 0.1
    foot.renderOrder = 2
    group.add(foot)

    // 체력바. 다치기 전에는 숨어 있다가 한 대 맞으면 나타난다 —
    // 멀쩡한 유닛 위에까지 막대가 뜨면 화면이 막대밭이 된다.
    const bar = new THREE.Group()
    const barBg = new THREE.Mesh(
      this.geo.bar,
      new THREE.MeshBasicMaterial({ color: 0x14181d, transparent: true, depthWrite: false }),
    )
    barBg.scale.set(3.0, 0.42, 1)
    const barFill = new THREE.Mesh(
      this.geo.bar,
      new THREE.MeshBasicMaterial({ color: 0x8fd18a, transparent: true, depthWrite: false }),
    )
    barFill.scale.set(2.8, 0.28, 1)
    barFill.position.z = 0.01
    this.disposables.push(
      barBg.material as THREE.Material,
      barFill.material as THREE.Material,
    )
    bar.add(barBg, barFill)
    bar.position.y = 4.6
    bar.renderOrder = 5
    bar.visible = false
    group.add(bar)

    const node: UnitNode = { group, body, foot, bodyMat, footMat, bar, barFill }
    this.unitNodes.set(u.id, node)
    this.root.add(group)
    return node
  }

  // ─────────────────────────────────────────────────────────── 갱신

  sync(game: Game, viewer: Side, firstPerson: boolean, camera: THREE.Camera): void {
    this.syncUnits(game, viewer, camera)
    this.syncAvatars(game, viewer, firstPerson)
    this.syncTiles(game, viewer)
    this.syncRally(game, viewer)
    this.syncForges(game, viewer)
    this.syncHits(game, viewer)
    this.syncCorpses(game, viewer)
    this.syncFocus(game, viewer)
  }

  private syncUnits(game: Game, viewer: Side, camera: THREE.Camera): void {
    const alive = new Set<number>()
    for (const u of game.units) {
      alive.add(u.id)
      const node = this.nodeFor(u)
      // 안개 밖의 남은 보이지 않는다. 부감을 켜 두었다고 다 아는 것은 아니다.
      const visible = u.faction === viewer || game.canSee(viewer, u)
      node.group.visible = visible
      if (!visible) continue

      // 휘두를 때 앞으로 내지른다. 한 대 한 대가 눈에 보이는 유일한 이유다.
      const lunge = u.lunge * u.lunge * 1.1
      node.group.position.set(
        u.pos.x + Math.sin(u.facing) * lunge,
        0,
        u.pos.z + Math.cos(u.facing) * lunge,
      )
      node.group.rotation.y = u.facing

      const hpRatio = Math.max(0.15, u.hp / u.maxHp)
      node.body.scale.y = 0.85 + hpRatio * 0.15

      // 맞으면 하얗게, **방패벽이 막아내면 반경과 같은 금색으로** 번쩍인다.
      // 색을 나눈 것이 이 게임에서 가장 중요한 한 줄의 연출이다 — 지휘 반경
      // 안에 있다는 것이 전투에서 무엇을 바꾸는지, 글자 없이 이걸로만 말한다.
      if (u.guard > 0) {
        node.bodyMat.emissive.setHex(C.radius)
        node.bodyMat.emissiveIntensity = u.guard * 1.5
      } else if (u.flash > 0) {
        node.bodyMat.emissive.setHex(0xffffff)
        node.bodyMat.emissiveIntensity = u.flash * 0.9
      } else {
        node.bodyMat.emissiveIntensity = 0
      }

      // 발밑 링 = 지휘받는 중. 링이 지나갈 때 발밑이 켜지는 것을 보아야
      // 지휘 반경 규칙이 설명 없이 전달된다.
      node.footMat.opacity = u.commanded ? 0.6 : 0
      node.group.scale.setScalar(UNITS[u.kind].radius * Actors.VIEW_SCALE)

      // 체력바 — 다친 놈에게만. 카메라를 향해 돌려 세운다.
      const hurt = u.hp < u.maxHp - 0.5
      node.bar.visible = hurt
      if (hurt) {
        node.bar.quaternion.copy(camera.quaternion)
        const r = Math.max(0, u.hp / u.maxHp)
        node.barFill.scale.x = 2.8 * r
        node.barFill.position.x = -1.4 * (1 - r)
        ;(node.barFill.material as THREE.MeshBasicMaterial).color.setHex(
          r > 0.55 ? 0x8fd18a : r > 0.28 ? 0xe0c46a : 0xe07a6a,
        )
      }
    }

    for (const [id, node] of this.unitNodes) {
      if (alive.has(id)) continue
      this.root.remove(node.group)
      node.bodyMat.dispose()
      node.footMat.dispose()
      this.unitNodes.delete(id)
    }
  }

  private syncAvatars(game: Game, viewer: Side, firstPerson: boolean): void {
    for (const p of game.players) {
      const node = this.avatarNodes[p.side]!
      const visible =
        p.side === viewer
          ? !(firstPerson && p.side === viewer) // 내 몸 안에 있으면 내 몸은 안 그린다
          : game.visible[viewer].has(game.board.tileAt(p.avatar.pos))
      node.visible = visible
      node.position.set(p.avatar.pos.x, 0, p.avatar.pos.z)
      node.rotation.y = p.avatar.yaw
    }

    // 반경 링은 보는 쪽의 것만 그린다. 상대 반경까지 보이면 정보가 과해진다.
    const me = game.players[viewer].avatar
    this.radiusRing.position.set(me.pos.x, 0.12, me.pos.z)
  }

  private syncTiles(game: Game, viewer: Side): void {
    for (const t of game.board.tiles) {
      const tint = this.tileTint[t.def.id]!
      const mat = tint.material as THREE.MeshBasicMaterial
      const hold = t.hold
      const side: Side = hold >= 0 ? 0 : 1
      mat.color.setHex(C.side[side])
      // 점유도가 곧 진하기다. 점령이 차오르는 것이 그대로 보인다.
      mat.opacity = Math.min(0.42, Math.abs(hold) * 0.42)

      const fog = this.tileFog[t.def.id]!
      const fogMat = fog.material as THREE.MeshBasicMaterial
      const seen = t.seen[viewer]
      const vis = game.visible[viewer].has(t.def.id)
      fogMat.opacity = vis ? 0 : seen ? 0.5 : 0.93
      fog.visible = fogMat.opacity > 0.01
    }
  }

  private syncRally(game: Game, viewer: Side): void {
    const p = game.players[viewer]
    this.rallyMark.position.set(p.rally.x, 0, p.rally.z)
    const ring = this.rallyMark.children[0] as THREE.Mesh
    ;(ring.material as THREE.MeshBasicMaterial).color.setHex(C.side[viewer])
  }

  /**
   * 타격 불꽃. 풀에서 꺼내 쓰고 남는 것은 숨긴다.
   *
   * 막아낸 타격은 **금색**(지휘 반경과 같은 색), 그냥 맞은 것은 주황이다.
   * 화면 어디서 방패벽이 일하고 있는지 멀리서도 보인다.
   */
  private syncHits(game: Game, viewer: Side): void {
    for (let i = 0; i < game.hits.length; i++) {
      const h = game.hits[i]!
      let m = this.hitPool[i]
      if (!m) {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
        this.disposables.push(mat)
        m = new THREE.Mesh(this.geo.spark, mat)
        m.renderOrder = 5
        this.hitPool.push(m)
        this.root.add(m)
      }
      const visible = game.visible[viewer].has(game.board.tileAt(h.pos))
      m.visible = visible
      if (!visible) continue
      const mat = m.material as THREE.MeshBasicMaterial
      mat.color.setHex(h.guarded ? C.radius : 0xffb066)
      mat.opacity = h.life * 0.9
      const s0 = (h.big ? 2.4 : 1.6) * (1.5 - h.life * 0.5)
      m.scale.setScalar(s0)
      m.position.set(h.pos.x, 2.2 + (1 - h.life) * 1.4, h.pos.z)
      m.rotation.y = h.life * 5
    }
    for (let i = game.hits.length; i < this.hitPool.length; i++) {
      this.hitPool[i]!.visible = false
    }
  }

  /** 시신. 쓰러져 가라앉는다 — 조용히 사라지면 이겼는지 졌는지 모른다. */
  private syncCorpses(game: Game, viewer: Side): void {
    for (let i = 0; i < game.corpses.length; i++) {
      const c = game.corpses[i]!
      let m = this.corpsePool[i]
      if (!m) {
        // 조명을 받지 않는 재질을 쓴다. 누워 버린 몸은 빛을 거의 못 받아
        // 조명 재질로 그리면 **검은 막대**가 되고, 그러면 누가 죽었는지
        // 진영조차 안 읽힌다. 시신은 정보이지 사물이 아니다.
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
        this.disposables.push(mat)
        m = new THREE.Mesh(this.geo.body, mat)
        m.renderOrder = 2
        this.corpsePool.push(m)
        this.root.add(m)
      }
      const visible = game.visible[viewer].has(game.board.tileAt(c.pos))
      m.visible = visible
      if (!visible) continue
      const mat = m.material as THREE.MeshBasicMaterial
      const base = c.faction === NEUTRAL ? C.neutral : C.side[c.faction as Side]
      // 산 유닛보다 어둡게 — 죽은 것과 산 것이 같은 색이면 전황을 잘못 읽는다.
      mat.color.setHex(base)
      mat.color.multiplyScalar(0.45)
      mat.opacity = Math.min(0.85, c.life * 1.6)
      const fall = Math.min(1, (1 - c.life) * 6)
      // 눕히면서 납작하게 눌러 둔다. 통나무처럼 길게 누우면 지형지물로 보인다.
      const k = UNITS[c.kind].radius * Actors.VIEW_SCALE
      m.scale.set(k, k * (1 - fall * 0.45), k)
      m.position.set(c.pos.x, 1.0 - fall * 0.55, c.pos.z)
      m.rotation.set(fall * Math.PI * 0.5, c.facing, 0)
    }
    for (let i = game.corpses.length; i < this.corpsePool.length; i++) {
      this.corpsePool[i]!.visible = false
    }
  }

  /**
   * 전진 기지 (GDD 4.3 확장).
   *
   * 짓는 중에는 **바닥에서 자라난다** — 완성까지 8초가 그냥 기다림이 아니라
   * 눈에 보이는 진행이어야, 앞에 나가서 박아둔 것이 지금 어떤 상태인지 안다.
   */
  private syncForges(game: Game, viewer: Side): void {
    const alive = new Set<number>()
    for (const b of game.buildings) {
      alive.add(b.id)
      let node = this.forgeNodes.get(b.id)
      if (!node) {
        node = this.buildForge(b.side)
        node.position.set(b.pos.x, 0, b.pos.z)
        this.forgeNodes.set(b.id, node)
        this.root.add(node)
      }
      const visible = game.visible[viewer].has(b.tile)
      node.visible = visible
      if (!visible) continue
      const raised = b.raising > 0 ? 1 - b.raising / 8 : 1
      node.scale.set(1, Math.max(0.12, raised), 1)
      // 다치면 기울어진다. 기지에 체력바를 또 띄우지 않기 위한 값싼 신호다.
      node.rotation.z = (1 - b.hp / b.maxHp) * 0.16
    }
    for (const [id, node] of this.forgeNodes) {
      if (alive.has(id)) continue
      this.root.remove(node)
      this.forgeNodes.delete(id)
    }
  }

  private buildForge(side: Side): THREE.Group {
    const g = new THREE.Group()
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4f34, roughness: 0.9 })
    const bannerMat = new THREE.MeshStandardMaterial({
      color: C.side[side],
      side: THREE.DoubleSide,
      roughness: 0.75,
    })
    this.disposables.push(woodMat, bannerMat)

    const baseGeo = new THREE.BoxGeometry(9, 1.2, 9)
    const postGeo = new THREE.CylinderGeometry(0.5, 0.6, 7, 6)
    const roofGeo = new THREE.ConeGeometry(6.4, 3.4, 4)
    const bannerGeo = new THREE.PlaneGeometry(3.2, 2)
    this.disposables.push(baseGeo, postGeo, roofGeo, bannerGeo)

    const base = new THREE.Mesh(baseGeo, woodMat)
    base.position.y = 0.6
    g.add(base)
    for (const [dx, dz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) {
      const post = new THREE.Mesh(postGeo, woodMat)
      post.position.set(dx, 4.2, dz)
      g.add(post)
    }
    const roof = new THREE.Mesh(roofGeo, woodMat)
    roof.position.y = 9.2
    roof.rotation.y = Math.PI / 4
    g.add(roof)

    const banner = new THREE.Mesh(bannerGeo, bannerMat)
    banner.position.set(0, 6, 4.6)
    g.add(banner)
    return g
  }

  /** 지목한 적의 발밑에 도는 붉은 고리. */
  private syncFocus(game: Game, viewer: Side): void {
    const id = game.players[viewer].focusId
    const target = id >= 0 ? game.units.find((u) => u.id === id) : undefined
    const show = !!target && game.visible[viewer].has(target.tile)
    this.focusMark.visible = show
    if (!show || !target) return
    this.focusMark.position.set(target.pos.x, 0.16, target.pos.z)
    this.focusMark.rotation.z = game.telemetry.elapsed * 2.2
  }

  /** 승패가 갈리면 안개를 걷는다. 무엇이 있었는지 보여주는 것이 예의다. */
  revealAll(): void {
    for (const fog of this.tileFog) {
      ;(fog.material as THREE.MeshBasicMaterial).opacity = 0
      fog.visible = false
    }
  }

  ownerOf(tileOwner: number): number {
    return tileOwner === NOBODY ? -1 : tileOwner
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}

interface UnitNode {
  group: THREE.Group
  body: THREE.Mesh
  foot: THREE.Mesh
  bodyMat: THREE.MeshStandardMaterial
  footMat: THREE.MeshBasicMaterial
  bar: THREE.Group
  barFill: THREE.Mesh
}
