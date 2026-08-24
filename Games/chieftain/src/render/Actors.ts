import * as THREE from 'three'
import { TILE_LAND } from '../data/fjord'
import { TUNING } from '../data/tuning'
import { UNITS } from '../data/units'
import type { Game } from '../game/Game'
import { NOBODY, type Side, type Unit } from '../game/types'
import { C } from './palette'
import { castShadows } from './shadows'
import { buildRig, fallenGeometry, poseRig, type Rig, type WarriorRole } from './warrior'

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
  private readonly avatarNodes: AvatarNode[] = []
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

  /**
   * 몸은 더 이상 여기 없다. 팔다리가 있는 뼈대는 `warrior.ts`가 굽고, 그
   * 지오메트리는 (역할 × 진영)마다 한 벌씩 캐시되어 모든 개체가 공유한다.
   * 여기 남은 것은 **규칙을 그리는 표식**뿐이다.
   */
  private readonly geo = {
    foot: new THREE.RingGeometry(1.1, 1.62, 20),
    spark: new THREE.IcosahedronGeometry(1, 0),
    bar: new THREE.PlaneGeometry(1, 1),
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

      // 아바타는 유닛보다 한 뼘 더 크다. 부감에서 누가 나인지 바로 보여야 한다.
      const scale = Actors.VIEW_SCALE * 1.15
      g.scale.setScalar(scale)

      // 뿔 달린 투구와 망토를 두른 족장. 부하와 같은 뼈대에 장식만 다르다.
      const rig = buildRig('chief', p.side, p.side * 0.5 + 0.17)
      g.add(rig.root)

      // 빛기둥. 반투명 원기둥이라 유닛을 가리지 않는다.
      const beamGeo = new THREE.CylinderGeometry(0.8, 1.5, 17, 10, 1, true)
      const beamMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      this.disposables.push(beamGeo, beamMat, rig.mat)
      const beam = new THREE.Mesh(beamGeo, beamMat)
      beam.position.y = 9.5
      beam.renderOrder = 4
      // 그룹 스케일을 되돌린다 — 몸만 커지고 빛기둥은 가늘게 유지한다.
      beam.scale.setScalar(1 / scale)
      beam.scale.y = 1
      g.add(beam)

      castShadows(g)
      this.avatarNodes.push({ group: g, rig, px: p.avatar.pos.x, pz: p.avatar.pos.z })
      this.root.add(g)
    }
  }

  private nodeFor(u: Unit): UnitNode {
    const found = this.unitNodes.get(u.id)
    if (found) return found

    const footMat = new THREE.MeshBasicMaterial({
      color: C.radius,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(footMat)

    const group = new THREE.Group()

    // 방패병은 창과 둥근 방패를, 도끼병은 양손도끼를 든다. 실루엣만으로
    // 구분되어야 "누구를 반경에 넣을 것인가"가 결정이 된다(GDD 6.2).
    // 자세까지 다르다 — 방패병은 막고 도끼병은 내려찍는다.
    //
    // 씨앗은 id에서 뽑는다. 같은 자리에 선 부대가 한 몸처럼 숨쉬면
    // 사람이 아니라 인형으로 보이기 때문에, 숨쉬기 위상만 조금씩 어긋낸다.
    const rig = buildRig(u.kind as WarriorRole, u.faction, (u.id % 17) / 17)
    group.add(rig.root)

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

    // 몸과 장비만 그림자를 진다. 발밑 링과 체력바는 규칙을 그리는 표식이라
    // `MeshBasicMaterial`이고, `castShadows`가 재질을 보고 알아서 거른다.
    castShadows(group)

    const node: UnitNode = {
      group,
      rig,
      foot,
      footMat,
      bar,
      barFill,
      px: u.pos.x,
      pz: u.pos.z,
    }
    this.unitNodes.set(u.id, node)
    this.root.add(group)
    return node
  }

  // ─────────────────────────────────────────────────────────── 갱신

  /**
   * `dt`는 **렌더 프레임 간격**이지 시뮬레이션 스텝이 아니다. 애니메이션은
   * 판정에 관여하지 않으므로 가변 dt를 써도 되고, 오히려 써야 한다 — 고정
   * 스텝에 묶으면 프레임이 밀릴 때 동작이 같이 끊긴다.
   */
  sync(
    game: Game,
    viewer: Side,
    firstPerson: boolean,
    camera: THREE.Camera,
    dt: number,
  ): void {
    this.syncUnits(game, viewer, camera, dt)
    this.syncAvatars(game, viewer, firstPerson, dt)
    this.syncTiles(game, viewer)
    this.syncRally(game, viewer)
    this.syncForges(game, viewer)
    this.syncHits(game, viewer)
    this.syncCorpses(game, viewer)
    this.syncFocus(game, viewer)
  }

  private syncUnits(game: Game, viewer: Side, camera: THREE.Camera, dt: number): void {
    const alive = new Set<number>()
    for (const u of game.units) {
      alive.add(u.id)
      const node = this.nodeFor(u)

      // 걸음 위상은 **지나온 거리**에 묶는다. 그래서 매 프레임 실제로 얼마나
      // 움직였는지를 여기서 잰다 — 지휘 반경 보너스로 속도가 바뀌는 게임이라
      // 명목 속도를 쓰면 반경에 들어간 순간부터 발이 미끄러진다.
      const dx = u.pos.x - node.px
      const dz = u.pos.z - node.pz
      node.px = u.pos.x
      node.pz = u.pos.z

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

      poseRig(node.rig, {
        dt,
        speed: Math.hypot(dx, dz) / dt,
        lunge: u.lunge,
        windup: windupOf(u),
        guard: u.guard,
        flash: u.flash,
        fighting: u.fighting,
        time: game.telemetry.elapsed,
      })

      // 맞으면 하얗게, **방패벽이 막아내면 반경과 같은 금색으로** 번쩍인다.
      // 색을 나눈 것이 이 게임에서 가장 중요한 한 줄의 연출이다 — 지휘 반경
      // 안에 있다는 것이 전투에서 무엇을 바꾸는지, 글자 없이 이걸로만 말한다.
      const mat = node.rig.mat
      if (u.guard > 0) {
        mat.emissive.setHex(C.radius)
        mat.emissiveIntensity = u.guard * 1.5
      } else if (u.flash > 0) {
        mat.emissive.setHex(0xffffff)
        mat.emissiveIntensity = u.flash * 0.9
      } else {
        mat.emissiveIntensity = 0
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
      node.rig.mat.dispose()
      node.footMat.dispose()
      this.unitNodes.delete(id)
    }
  }

  private syncAvatars(game: Game, viewer: Side, firstPerson: boolean, dt: number): void {
    for (const p of game.players) {
      const node = this.avatarNodes[p.side]!
      const dx = p.avatar.pos.x - node.px
      const dz = p.avatar.pos.z - node.pz
      node.px = p.avatar.pos.x
      node.pz = p.avatar.pos.z

      const visible =
        p.side === viewer
          ? !(firstPerson && p.side === viewer) // 내 몸 안에 있으면 내 몸은 안 그린다
          : game.visible[viewer].has(game.board.tileAt(p.avatar.pos))
      node.group.visible = visible
      node.group.position.set(p.avatar.pos.x, 0, p.avatar.pos.z)
      node.group.rotation.y = p.avatar.yaw
      if (!visible) continue

      // 아바타는 싸우지 않는다(무적이고 공격도 없다). 걷기와 숨쉬기뿐이다.
      poseRig(node.rig, {
        dt,
        speed: Math.hypot(dx, dz) / dt,
        lunge: 0,
        windup: 0,
        guard: 0,
        flash: 0,
        fighting: false,
        time: game.telemetry.elapsed,
      })
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
        //
        // 정점색을 쓰므로 재질 색은 **곱해지는 값**이다. 어둡게 눌러 두면
        // 투구도 옷도 같은 비율로 어두워지고 진영색은 남는다.
        const mat = new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
        })
        this.disposables.push(mat)
        m = new THREE.Mesh(fallenGeometry('axe', 0), mat)
        // 진영(y)을 먼저 먹이고 쓰러짐(x)을 나중에 먹인다. 기본 순서로 두면
        // 넘어진 몸이 방향에 따라 옆으로 돈다.
        m.rotation.order = 'YXZ'
        m.renderOrder = 2
        this.corpsePool.push(m)
        this.root.add(m)
      }
      const visible = game.visible[viewer].has(game.board.tileAt(c.pos))
      m.visible = visible
      if (!visible) continue
      const mat = m.material as THREE.MeshBasicMaterial
      // 산 유닛보다 어둡게 — 죽은 것과 산 것이 같은 색이면 전황을 잘못 읽는다.
      mat.color.setScalar(0.5)
      mat.opacity = Math.min(0.85, c.life * 1.6)

      // 지오메트리는 이미 **누운 자세**로 구워져 있다(팔다리가 벌어져 있다).
      // 서 있는 몸을 통째로 눕히면 각목이 넘어지는 것처럼 보이기 때문이다.
      // 쓰러지는 동작은 그 누운 몸을 세웠다가 도로 눕히는 것으로 만든다.
      m.geometry = fallenGeometry(c.kind as WarriorRole, c.faction)
      const fall = Math.min(1, (1 - c.life) * 6)
      const k = UNITS[c.kind].radius * Actors.VIEW_SCALE
      m.scale.setScalar(k)
      m.position.set(c.pos.x, 0.05, c.pos.z)
      m.rotation.set(-(1 - fall) * Math.PI * 0.5, c.facing, 0)
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

    castShadows(g)
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
    // 살아 있는 채로 판이 끝난 유닛의 재질은 죽음 처리를 못 거쳤다.
    // 지오메트리는 (역할 × 진영) 캐시에 있어 다음 판이 그대로 쓰므로 놔둔다.
    for (const node of this.unitNodes.values()) node.rig.mat.dispose()
    this.unitNodes.clear()
  }
}

interface UnitNode {
  group: THREE.Group
  rig: Rig
  foot: THREE.Mesh
  footMat: THREE.MeshBasicMaterial
  bar: THREE.Group
  barFill: THREE.Mesh
  /** 지난 프레임의 자리. 걸음 속도를 재는 데만 쓴다. */
  px: number
  pz: number
}

interface AvatarNode {
  group: THREE.Group
  rig: Rig
  px: number
  pz: number
}

/**
 * 예비 동작의 진행도 0~1.
 *
 * `swingIn`은 **교전 중에만** 줄어들기 때문에(`Game.engage`), 그냥 읽으면
 * 걷는 중인 유닛도 "곧 때릴 참"으로 보인다. `fighting` 깃발과 같이 봐야
 * 예비 동작이 제자리에서 터지지 않는다.
 */
function windupOf(u: Unit): number {
  if (!u.fighting) return 0
  const lead = Math.min(0.3, UNITS[u.kind].swing * 0.5)
  return Math.max(0, Math.min(1, (lead - u.swingIn) / lead))
}
