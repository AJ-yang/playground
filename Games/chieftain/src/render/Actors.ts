import * as THREE from 'three'
import { COLS, type Land, MAP_H, MAP_W, ROWS } from '../data/land'
import { TUNING } from '../data/tuning'
import { UNITS } from '../data/units'
import type { Game } from '../game/Game'
import { NOBODY, type Side, type Unit } from '../game/types'
import { C } from './palette'
import { castShadows } from './shadows'
import type { Terrain } from './terrain'
import {
  buildRig,
  buildViewArm,
  fallenGeometry,
  poseRig,
  poseViewArm,
  type Rig,
  type ViewArm,
  type WarriorRole,
} from './warrior'

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
  /**
   * 소유권과 안개를 **판 하나씩**으로 그린다.
   *
   * 예전에는 지역마다 네모 판을 하나씩 깔았다. 섬이 아홉 개일 때는 섬이
   * 원래 네모라 티가 안 났는데, 땅이 이어진 지금은 **연속된 벌판 위에 네모난
   * 스티커**가 붙은 꼴이 된다.
   *
   * 지금은 지역 수만 한 작은 텍스처(5×3)를 만들어 맵 전체를 덮는 판 하나에
   * 물린다. 선형 보간이 켜져 있으므로 지역 사이가 저절로 번져서, 정보는
   * 지역 단위 그대로면서 그림은 부드럽다.
   */
  private tintTex!: THREE.DataTexture
  private fogTex!: THREE.DataTexture
  // `ArrayBuffer`를 명시적으로 깔아 준다. 그냥 길이로 만들면 타입이
  // `Uint8Array<ArrayBufferLike>`가 되어 `DataTexture`가 안 받는다.
  private readonly tintData = new Uint8Array(new ArrayBuffer(COLS * ROWS * 4))
  private readonly fogData = new Uint8Array(new ArrayBuffer(COLS * ROWS * 4))
  private readonly avatarNodes: AvatarNode[] = []
  /**
   * 1인칭 카메라에 먹일 걸음 흔들림. `sync`가 채우고 `main`이 카메라에 얹는다.
   *
   * 카메라를 먼저 자리잡고 `sync`를 부르는 순서라(체력바가 카메라를 향해야 한다)
   * 흔들림만 뒤에 한 번 더 얹는다.
   */
  readonly viewerBob = { y: 0, roll: 0 }

  /**
   * 1인칭 시야에 드는 팔. `main`이 카메라에 매달고, 여기서 자세만 먹인다.
   *
   * 몸을 통째로 그려 보려다 접었다 — 자세한 이유는 `warrior.ts`의 `ViewArm`에 있다.
   */
  readonly viewArm: ViewArm
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

  constructor(game: Game, private readonly terrain: Terrain) {
    for (const g of Object.values(this.geo)) this.disposables.push(g)

    this.buildTiles(game)
    this.radiusRing = this.buildRadiusRing()
    this.root.add(this.radiusRing)
    this.rallyMark = this.buildRallyMark()
    this.root.add(this.rallyMark)
    this.focusMark = this.buildFocusMark()
    this.root.add(this.focusMark)
    this.buildAvatars(game)

    this.viewArm = buildViewArm(game.humanSide)
    this.viewArm.root.visible = false
    this.disposables.push(this.viewArm.mat)
  }

  // ─────────────────────────────────────────────────────────── 만들기

  /**
   * 칸을 덮는 판을 지형에 눌러 붙인 지오메트리로 만든다.
   *
   * 평평한 판 한 장으로 두면 언덕에서는 땅속에 박히고 골짜기에서는 공중에
   * 뜬다. 소유권과 안개는 **땅에 칠한 것처럼** 보여야 하는 표식이라 그러면
   * 규칙이 안 읽힌다. 격자로 쪼개 높이를 먹인다 — 칸당 17×17이면 충분하고,
   * 판을 시작할 때 한 번만 만든다.
   */
  /** 맵 전체를 덮는 지형 밀착 판 하나. 소유권과 안개가 각각 하나씩 쓴다. */
  /**
   * 소유·안개를 얹을 판.
   *
   * **바다 위에서는 사라진다.** 예전에는 판 전체를 덮는 사각형 한 장이었는데,
   * 땅이 넓어져 부감이 바다까지 담게 되자 그 한 장이 바다 위에 씌운 회색
   * 비닐처럼 보였다 — 위에서 내려다본 판이 통째로 납작한 사각형으로 읽혔다.
   *
   * 꼭짓점마다 땅인지 물어보고 알파를 0/1로 넣는다. 정점 색의 알파는 재질의
   * 투명도에 곱해지므로, 해안선에서 오버레이가 저절로 흐려지며 끝난다. 지역
   * 해상도(5×3)로는 못 하는 일이라 여기서 하는 것이다.
   */
  private overlayGeo(lift: number, land: Land): THREE.BufferGeometry {
    // 해안선을 알파로 자르므로 격자가 곧 그 선의 해상도다. 110×70에서는
    // 3단위짜리 계단이 눈에 띄었다.
    const geo = new THREE.PlaneGeometry(MAP_W + 40, MAP_H + 40, 220, 140)
    geo.rotateX(-Math.PI / 2)
    this.terrain.displace(geo, lift)

    const pos = geo.getAttribute('position')
    const rgba = new Float32Array(pos.count * 4)
    for (let i = 0; i < pos.count; i++) {
      rgba[i * 4] = 1
      rgba[i * 4 + 1] = 1
      rgba[i * 4 + 2] = 1
      rgba[i * 4 + 3] = land.solidAt(pos.getX(i), pos.getZ(i)) ? 1 : 0
    }
    geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4))

    this.disposables.push(geo)
    return geo
  }

  private buildTiles(game: Game): void {
    const mk = (
      lift: number,
      order: number,
      data: Uint8Array<ArrayBuffer>,
    ): THREE.DataTexture => {
      const tex = new THREE.DataTexture(data, COLS, ROWS, THREE.RGBAFormat)
      // **선형 보간이 이 방식의 전부다.** 5×3짜리 텍스처를 맵 전체로 늘리면
      // 지역 사이가 저절로 번져서 네모난 경계가 사라진다.
      // **색공간을 못 박는다.** `DataTexture`는 기본이 선형이라, sRGB로 담은
      // 바이트를 그대로 읽으면 거의 검은 안개가 흰 안개가 되어 판이 통째로
      // 뿌예진다. 실제로 그렇게 나왔다.
      tex.colorSpace = THREE.SRGBColorSpace
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.needsUpdate = true
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        // 해안에서 오버레이를 끄는 알파가 여기 실려 있다(`overlayGeo`).
        vertexColors: true,
      })
      this.disposables.push(tex, mat)
      const mesh = new THREE.Mesh(this.overlayGeo(lift, game.board.land), mat)
      mesh.renderOrder = order
      this.root.add(mesh)
      return tex
    }
    this.tintTex = mk(0.06, 2, this.tintData)
    this.fogTex = mk(0.5, 6, this.fogData)
  }

  /**
   * 지휘 반경 링. 이 게임에서 가장 중요한 한 줄의 그림이다.
   *
   * 반지름이 21이라 지형의 굴곡을 통째로 가로지른다 — 평평한 고리로 두면
   * 반쯤은 땅에 잠기고 반쯤은 떠서, 하필 **가장 중요한 선**이 제일 지저분해
   * 진다. 그래서 이것만은 매 프레임 지형을 다시 물어 굽힌다. 정점이 144개뿐
   * 이라 값이 싸다.
   */
  private buildRadiusRing(): THREE.Mesh {
    const r = TUNING.commandRadius
    const geo = new THREE.RingGeometry(r - 0.7, r, 72)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: C.radius,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(geo, mat)
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = 4
    // 링은 제자리에 두고 정점만 옮긴다. 그룹을 옮기면 높이를 두 번 더한다.
    m.frustumCulled = false
    return m
  }

  /** 반경 링의 정점을 아바타 자리에 맞춰 지형 위로 다시 얹는다. */
  private bendRing(cx: number, cz: number): void {
    const pos = this.radiusRing.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.terrain.heightAt(pos.getX(i) + cx, pos.getZ(i) + cz) + 0.18)
    }
    pos.needsUpdate = true
    this.radiusRing.position.set(cx, 0, cz)
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
    ring.position.y = 0.16
    ring.renderOrder = 4
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
    m.renderOrder = 4
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
      this.avatarNodes.push({
        group: g,
        rig,
        beam,
        px: p.avatar.pos.x,
        pz: p.avatar.pos.z,
      })
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
    this.syncTiles(game, viewer, firstPerson)
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
      const gx = u.pos.x + Math.sin(u.facing) * lunge
      const gz = u.pos.z + Math.cos(u.facing) * lunge
      node.group.position.set(gx, this.terrain.heightAt(gx, gz), gz)
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

      /**
       * 1인칭에서 내 몸은 안 그린다. 대신 **자세는 계속 굴린다.**
       *
       * 이 구분이 핵심이다. 예전에는 안 보이면 자세 계산까지 건너뛰었는데,
       * 그러면 강림한 동안 걸음 위상이 멈춰서 시야 흔들림도 시야의 팔도 발과
       * 어긋난다. 안 그리는 것과 안 굴리는 것은 다른 일이다.
       *
       * 몸을 그려 보려던 시도는 접었다 — 이유는 `warrior.ts`의 `ViewArm`에 있다.
       */
      const mine = p.side === viewer
      const inBody = firstPerson && mine
      const visible = mine
        ? !inBody
        : game.visible[viewer].has(game.board.tileAt(p.avatar.pos))
      node.group.visible = visible
      node.group.position.set(
        p.avatar.pos.x,
        this.terrain.heightAt(p.avatar.pos.x, p.avatar.pos.z),
        p.avatar.pos.z,
      )
      node.group.rotation.y = p.avatar.yaw
      // 안 보여도 굴린다 — 위의 주석을 볼 것.
      if (!visible && !inBody) continue

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

      /**
       * 걸음에 맞춰 시야를 흔든다.
       *
       * 몸을 그려도 앞만 보고 걸으면 여전히 미끄러지는 느낌이다 — 사람은 걸을 때
       * 눈높이가 오르내리고 몸이 좌우로 기운다. 뼈대가 이미 굴리고 있는 위상을
       * 그대로 빌려 쓰므로 발과 어긋날 수가 없다.
       */
      if (inBody) {
        const g = node.rig.gait
        this.viewerBob.y = Math.abs(Math.sin(node.rig.phase)) * 0.3 * g
        this.viewerBob.roll = Math.sin(node.rig.phase) * 0.016 * g
        poseViewArm(this.viewArm, node.rig.phase, g, game.telemetry.elapsed)
      }
    }

    this.viewArm.root.visible = firstPerson
    if (!firstPerson) {
      this.viewerBob.y = 0
      this.viewerBob.roll = 0
    }

    // 반경 링은 보는 쪽의 것만 그린다. 상대 반경까지 보이면 정보가 과해진다.
    const me = game.players[viewer].avatar
    this.bendRing(me.pos.x, me.pos.z)
  }

  private syncTiles(game: Game, viewer: Side, firstPerson: boolean): void {
    /**
     * 소유권 색은 **부감의 정보**다.
     *
     * 1인칭에서 같은 세기로 깔면 눈앞의 풀밭이 통째로 하늘색 막에 덮여서,
     * 애써 만든 지형과 풀색이 도로 페인트칠한 판때기가 된다. 여기서는 내가
     * 세상 안에 서 있는 것이고, 누구 땅인지는 깃발과 건물이 말해야 한다.
     * 지워 버리지는 않고 흔적만 남긴다.
     */
    const strength = firstPerson ? 0.28 : 1
    for (const t of game.board.tiles) {
      const i = t.def.id * 4
      const side: Side = t.hold >= 0 ? 0 : 1
      _c.setHex(C.side[side], THREE.SRGBColorSpace).convertLinearToSRGB()
      this.tintData[i] = Math.round(_c.r * 255)
      this.tintData[i + 1] = Math.round(_c.g * 255)
      this.tintData[i + 2] = Math.round(_c.b * 255)
      // 점유도가 곧 진하기다. 점령이 차오르는 것이 그대로 보인다.
      this.tintData[i + 3] = Math.round(
        Math.min(0.42, Math.abs(t.hold) * 0.42) * strength * 255,
      )

      const vis = this.revealed || game.visible[viewer].has(t.def.id)
      const a = vis ? 0 : t.seen[viewer] ? 0.5 : 0.9
      this.fogData[i] = FOG_RGB[0]!
      this.fogData[i + 1] = FOG_RGB[1]!
      this.fogData[i + 2] = FOG_RGB[2]!
      this.fogData[i + 3] = Math.round(a * 255)
    }
    this.tintTex.needsUpdate = true
    this.fogTex.needsUpdate = true
  }

  private syncRally(game: Game, viewer: Side): void {
    const p = game.players[viewer]
    this.rallyMark.position.set(p.rally.x, this.terrain.heightAt(p.rally.x, p.rally.z), p.rally.z)
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
      m.position.set(
        h.pos.x,
        this.terrain.heightAt(h.pos.x, h.pos.z) + 2.2 + (1 - h.life) * 1.4,
        h.pos.z,
      )
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
      m.position.set(c.pos.x, this.terrain.heightAt(c.pos.x, c.pos.z) + 0.05, c.pos.z)
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
        node.position.set(b.pos.x, this.terrain.heightAt(b.pos.x, b.pos.z), b.pos.z)
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
    this.focusMark.position.set(
      target.pos.x,
      this.terrain.heightAt(target.pos.x, target.pos.z) + 0.2,
      target.pos.z,
    )
    this.focusMark.rotation.z = game.telemetry.elapsed * 2.2
  }

  /** 승패가 갈리면 안개를 걷는다. 무엇이 있었는지 보여주는 것이 예의다. */
  revealAll(): void {
    this.revealed = true
    for (let i = 3; i < this.fogData.length; i += 4) this.fogData[i] = 0
    this.fogTex.needsUpdate = true
  }

  /** 판이 끝난 뒤에는 안개를 다시 덮지 않는다. */
  private revealed = false

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
  /** 빛기둥. 1인칭에서는 눈앞을 가리므로 끈다. */
  beam: THREE.Mesh
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

const _c = new THREE.Color()

/** 안개 색. 매 프레임 다시 안 구하려고 미리 잡아 둔다. */
const FOG_RGB = (() => {
  const c = new THREE.Color().setHex(C.fog, THREE.SRGBColorSpace).convertLinearToSRGB()
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]
})()
