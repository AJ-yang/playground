import * as THREE from 'three'
import type { Vec2 } from '../core/vec2'
import type { Game } from '../game/Game'
import type { Enemy } from '../game/Enemy'
import type { Tower } from '../game/Tower'
import { TILE_SIZE } from '../game/Game'
import { C, hex } from './palette3d'
import type { BoardFrame } from './coords'
import { PX_TO_M } from './coords'
import { buildTowerModel, type TowerModel } from './models/towers3d'
import { enemyHeight, enemyTemplate } from './models/enemies3d'

/**
 * 시뮬레이션 상태를 3D 장면에 비추는 층.
 *
 * **한 방향으로만 흐른다.** Game이 진실이고 여기서는 읽기만 한다 — 위치를
 * 3D 쪽에서 보정하거나 애니메이션이 끝날 때까지 죽음을 미루는 일을 하지
 * 않는다. 그렇게 해야 2D 지휘관 시점과 3D 1인칭이 **완전히 같은 판**을 보고,
 * 헤드리스 밸런스 시뮬레이터가 검증한 수치가 화면에서도 그대로 성립한다.
 *
 * 매 프레임 하는 일은 세 가지뿐이다.
 *   1. 새로 생긴 개체에 모형을 붙이고, 사라진 개체의 모형을 거둔다
 *   2. 살아 있는 개체의 위치·각도·연출 상태를 갱신한다
 *   3. 이펙트 풀에서 필요한 만큼 꺼내 쓰고 나머지는 숨긴다
 */

interface EnemyView {
  group: THREE.Group
  enemy: Enemy
  /** 피격 번쩍임을 위해 원래 재질을 기억해 둔다 */
  skins: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }>
  /** 걸음에 맞춰 흔들 관절 — 모형이 `userData.swing`으로 표시해 둔 것들 */
  limbs: Array<{ node: THREE.Object3D; phase: number; amount: number }>
  flashing: boolean
  bar: THREE.Group
  barFill: THREE.Mesh
  ring: THREE.Mesh
  height: number
}

interface TowerView {
  group: THREE.Group
  model: TowerModel
  tower: Tower
  level: number
  flash?: THREE.Mesh
}

const FLASH_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffffff })

const BAR_COLORS = [
  new THREE.MeshBasicMaterial({ color: 0x8bd450, depthTest: false, transparent: true }),
  new THREE.MeshBasicMaterial({ color: 0xe0b341, depthTest: false, transparent: true }),
  new THREE.MeshBasicMaterial({ color: 0xff5c5c, depthTest: false, transparent: true }),
]
const BAR_BACK = new THREE.MeshBasicMaterial({
  color: 0x0b0d10,
  depthTest: false,
  transparent: true,
  opacity: 0.7,
})

const SLOW_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x9fd8ff,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
})
const POISON_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x8bd450,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
})

/** HP 바가 보이는 거리(미터). 이보다 멀면 글자만한 크기라 소음만 된다. */
const BAR_VISIBLE_RANGE = 55

export class Actors {
  readonly root = new THREE.Group()

  private readonly enemies = new Map<number, EnemyView>()
  private readonly towers = new Map<number, TowerView>()
  private readonly projectiles: THREE.Mesh[] = []
  private readonly blasts: THREE.Mesh[] = []
  private sparks: THREE.InstancedMesh

  private readonly barGeoBack = new THREE.PlaneGeometry(1, 0.14)
  private readonly barGeoFill = new THREE.PlaneGeometry(1, 0.1).translate(0.5, 0, 0)
  private readonly ringGeo = new THREE.RingGeometry(0.42, 0.56, 16).rotateX(-Math.PI / 2)
  private readonly projGeo = new THREE.SphereGeometry(1, 6, 5)
  private readonly blastGeo = new THREE.SphereGeometry(1, 12, 8)
  private readonly sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)

  private readonly tmp = new THREE.Vector3()
  private readonly tmpMatrix = new THREE.Matrix4()
  private readonly tmpQuat = new THREE.Quaternion()
  private readonly tmpScale = new THREE.Vector3(1, 1, 1)
  private readonly tmpColor = new THREE.Color()

  constructor(private readonly frame: BoardFrame) {
    this.sparks = new THREE.InstancedMesh(
      this.sparkGeo,
      new THREE.MeshBasicMaterial({ transparent: true }),
      400,
    )
    this.sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3)
    this.sparks.count = 0
    this.sparks.frustumCulled = false
    this.root.add(this.sparks)
  }

  sync(game: Game, camera: THREE.Camera, elapsed: number): void {
    this.syncTowers(game, elapsed)
    this.syncEnemies(game, camera, elapsed)
    this.syncProjectiles(game)
    this.syncEffects(game)
  }

  /** 어떤 기물의 모형인지 되찾는다. 사거리 원을 띄울 자리를 잡을 때 쓴다. */
  towerObject(tower: Tower): THREE.Object3D | undefined {
    return this.towers.get(tower.id)?.group
  }

  /** 조준선이 때릴 대상들 — 기물 모형의 루트만. 적은 겨눌 필요가 없다. */
  pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = []
    for (const view of this.towers.values()) list.push(view.group)
    return list
  }

  dispose(): void {
    this.root.clear()
    this.enemies.clear()
    this.towers.clear()
    this.projectiles.length = 0
    this.blasts.length = 0
    this.barGeoBack.dispose()
    this.barGeoFill.dispose()
    this.ringGeo.dispose()
    this.projGeo.dispose()
    this.blastGeo.dispose()
    this.sparkGeo.dispose()
    this.sparks.dispose()
  }

  // ────────────────────────────── 기물 ──────────────────────────────

  private syncTowers(game: Game, elapsed: number): void {
    const live = new Set<number>()

    for (const tower of game.towers) {
      live.add(tower.id)
      let view = this.towers.get(tower.id)

      // 레벨이 오르면 모형을 다시 세운다 — 병력 수가 곧 레벨이라 갈아 끼우는
      // 것 말고는 방법이 없다. 강화는 판당 몇 번뿐이라 비용도 문제되지 않는다.
      if (view && view.level !== tower.level) {
        view.group.remove(view.model)
        view = undefined
        this.towers.delete(tower.id)
      }

      if (!view) {
        const group = new THREE.Group()
        // 조준선이 기물을 맞혔을 때 어느 기물인지 되짚을 수 있도록 표를 붙인다.
        group.userData['towerId'] = tower.id
        this.frame.toWorld(tower.pos, 0, this.tmp)
        group.position.copy(this.tmp)
        const model = buildTowerModel(tower.def, tower.level)
        group.add(model)
        this.root.add(group)

        let flash: THREE.Mesh | undefined
        if (model.userData.muzzle) {
          flash = new THREE.Mesh(
            this.projGeo,
            new THREE.MeshBasicMaterial({
              color: hex(tower.def.accent),
              transparent: true,
              depthWrite: false,
            }),
          )
          flash.visible = false
          model.userData.muzzle.add(flash)
        }
        view = { group, model, tower, level: tower.level, flash }
        this.towers.set(tower.id, view)
      }

      const turret = view.model.userData.turret
      if (turret) {
        // 보드의 조준각은 atan2(dy, dx)이고 모형의 정면은 +X다.
        turret.rotation.y = -tower.turretAngle
        // 반동 — 쏜 직후 잠깐 뒤로 물러난다. 1인칭에서 발사를 느끼게 하는 것은
        // 투사체가 아니라 이 움직임이다.
        turret.position.x = -tower.recoil * 0.12
      }
      if (view.flash) {
        view.flash.visible = tower.recoil > 0.08
        const s = tower.recoil * 0.34
        view.flash.scale.setScalar(s)
        ;(view.flash.material as THREE.MeshBasicMaterial).opacity = tower.recoil * 0.9
      }
      const flag = view.model.userData.flag
      if (flag) {
        // 깃발이 바람에 흔들린다. 기고는 쏘지 않으므로 이것이 유일한 생기다.
        flag.rotation.y = Math.sin(elapsed * 1.7) * 0.22
        flag.rotation.z = Math.sin(elapsed * 2.3 + 1) * 0.08
      }
    }

    for (const [id, view] of this.towers) {
      if (live.has(id)) continue
      this.root.remove(view.group)
      this.towers.delete(id)
    }
  }

  // ────────────────────────────── 적 ──────────────────────────────

  private syncEnemies(game: Game, camera: THREE.Camera, elapsed: number): void {
    const live = new Set<number>()
    const camPos = camera.getWorldPosition(new THREE.Vector3())

    for (const enemy of game.enemies) {
      // 아직 경로에 들어서지 않은(스폰 대기) 적은 문 밖에 있어야 한다.
      if (enemy.distance < 0) continue
      live.add(enemy.id)

      let view = this.enemies.get(enemy.id)
      if (!view) view = this.spawnEnemyView(enemy)

      // 위치 — 길 폭 안의 좌우 흩뿌림(lateral)은 렌더링 전용이라 여기서만 더한다.
      const dir = enemy.path.directionAt(enemy.distance)
      const px: Vec2 = {
        x: enemy.pos.x - dir.y * enemy.lateral,
        y: enemy.pos.y + dir.x * enemy.lateral,
      }
      this.frame.toWorld(px, 0, this.tmp)
      view.group.position.copy(this.tmp)
      view.group.rotation.y = -Math.atan2(dir.y, dir.x)

      // 걸음. 실제 속도에 맞춰 흔들려야 감속이 눈에 보인다 — 거마작에 묶인
      // 적이 같은 박자로 걸으면 느려진 것이 화면에서 읽히지 않는다.
      //
      // **박자를 시간이 아니라 이동 거리에서 뽑는 이유가 여기 있다.** 감속에
      // 걸린 적은 저절로 발도 천천히 놀리게 되고, 배속을 올리면 행군도 같이
      // 빨라진다. 시간으로 재면 그 둘이 전부 어긋난다.
      const gait = (enemy.distance / TILE_SIZE) * 3.4
      const bob = enemy.def.flying ? 0.09 : 0.045
      view.group.position.y = Math.abs(Math.sin(gait)) * bob
      view.group.rotation.z = Math.sin(gait) * 0.03
      for (const limb of view.limbs) {
        limb.node.rotation.z = Math.sin(gait + limb.phase) * 0.5 * limb.amount
      }

      // 피격 번쩍임 — 재질을 통째로 흰색으로 바꿨다가 되돌린다.
      const shouldFlash = enemy.flashTimer > 0
      if (shouldFlash !== view.flashing) {
        for (const skin of view.skins) {
          skin.mesh.material = shouldFlash ? FLASH_MATERIAL : skin.material
        }
        view.flashing = shouldFlash
      }

      // 상태 이상 고리 — 감속(푸름)이 중독(초록)보다 판단에 더 중요하므로 우선한다.
      if (enemy.isSlowed || enemy.isPoisoned) {
        view.ring.visible = true
        view.ring.material = enemy.isSlowed ? SLOW_MATERIAL : POISON_MATERIAL
        view.ring.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.06)
      } else {
        view.ring.visible = false
      }

      // 체력 바. 카메라를 향해 세우고, 멀면 숨긴다.
      const distance = camPos.distanceTo(view.group.position)
      const ratio = enemy.hpRatio
      const show = distance < BAR_VISIBLE_RANGE && (ratio < 1 || enemy.def.boss)
      view.bar.visible = show
      if (show) {
        view.bar.quaternion.copy(camera.quaternion)
        view.barFill.scale.x = Math.max(0.001, ratio)
        view.barFill.material = ratio > 0.55 ? BAR_COLORS[0]! : ratio > 0.25 ? BAR_COLORS[1]! : BAR_COLORS[2]!
        // 멀수록 크게 그려 화면에서 차지하는 크기를 일정하게 유지한다.
        const s = 1 + distance * 0.03
        view.bar.scale.setScalar(s)
      }
    }

    for (const [id, view] of this.enemies) {
      if (live.has(id)) continue
      this.root.remove(view.group)
      this.enemies.delete(id)
    }
  }

  private spawnEnemyView(enemy: Enemy): EnemyView {
    const group = enemyTemplate(enemy.def).clone(true)
    const skins: EnemyView['skins'] = []
    const limbs: EnemyView['limbs'] = []
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        skins.push({ mesh: object, material: object.material })
      }
      const swing = object.userData['swing']
      if (typeof swing === 'number') {
        const amount = object.userData['swingAmount']
        limbs.push({ node: object, phase: swing, amount: typeof amount === 'number' ? amount : 1 })
      }
    })

    const height = enemyHeight(enemy.def)
    const width = enemy.def.boss ? 1.6 : 0.9

    const bar = new THREE.Group()
    const back = new THREE.Mesh(this.barGeoBack, BAR_BACK)
    back.scale.x = width
    back.renderOrder = 900
    bar.add(back)

    // 채움은 **왼쪽 끝을 축으로** 줄어야 한다. 지오메트리를 미리 오른쪽으로
    // 밀어 두었으므로 `scale.x`가 곧 남은 체력 비율이 된다. 바의 폭은 바깥
    // 홀더가 맡아, 폭과 비율이 같은 값을 두고 다투지 않는다.
    const holder = new THREE.Group()
    holder.position.x = -width / 2
    holder.scale.x = width
    const fill = new THREE.Mesh(this.barGeoFill, BAR_COLORS[0]!)
    fill.renderOrder = 901
    holder.add(fill)
    bar.add(holder)
    bar.position.y = height + 0.45
    group.add(bar)

    const ring = new THREE.Mesh(this.ringGeo, SLOW_MATERIAL)
    ring.position.y = 0.04
    ring.visible = false
    if (enemy.def.boss) ring.scale.setScalar(1.8)
    group.add(ring)

    this.root.add(group)
    const view: EnemyView = {
      group,
      enemy,
      skins,
      limbs,
      flashing: false,
      bar,
      barFill: fill,
      ring,
      height,
    }
    this.enemies.set(enemy.id, view)
    return view
  }

  // ────────────────────────────── 투사체 ──────────────────────────────

  private syncProjectiles(game: Game): void {
    let used = 0
    for (const projectile of game.projectiles) {
      if (projectile.dead) continue
      const view = this.projectileSlot(used++)
      const spec = projectile.spec

      // 포물선. 광역탄은 하늘로 쏘아 올리는 물건이라 직선으로 날면 총알로 보인다.
      const total = Math.hypot(
        spec.destination.x - spec.origin.x,
        spec.destination.y - spec.origin.y,
      )
      const flown = Math.hypot(projectile.pos.x - spec.origin.x, projectile.pos.y - spec.origin.y)
      const t = total > 0 ? Math.min(1, flown / total) : 1
      const arc = spec.splashRadius > 0 ? Math.min(6, total * PX_TO_M * 0.35) : 0
      const y = 1.25 + Math.sin(t * Math.PI) * arc

      this.frame.toWorld(projectile.pos, y, this.tmp)
      view.position.copy(this.tmp)
      // **눈앞을 스쳐 가는 물건이라 실제 크기로 잡는다.** 2D의 탄 반지름(픽셀)을
      // 그대로 미터로 환산하면 화살 한 대가 사람만 해져, 화면이 통째로 가려진다.
      if (spec.splashRadius > 0) {
        view.scale.setScalar(0.2)
      } else {
        // 화살·탄환 — 길이 0.9m, 굵기 10cm. 진행 방향으로 늘려 잔상처럼 보이게 한다.
        view.scale.set(0.45, 0.05, 0.05)
      }
      view.rotation.y = -Math.atan2(projectile.heading.y, projectile.heading.x)
      ;(view.material as THREE.MeshBasicMaterial).color.set(hex(spec.color))
      view.visible = true
    }
    for (let i = used; i < this.projectiles.length; i++) this.projectiles[i]!.visible = false
  }

  private projectileSlot(index: number): THREE.Mesh {
    let view = this.projectiles[index]
    if (!view) {
      view = new THREE.Mesh(
        this.projGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
      )
      view.frustumCulled = false
      this.projectiles.push(view)
      this.root.add(view)
    }
    return view
  }

  // ────────────────────────────── 이펙트 ──────────────────────────────

  private syncEffects(game: Game): void {
    // 폭발 — 부풀며 사라지는 구.
    let used = 0
    for (const blast of game.effects.blasts) {
      const view = this.blastSlot(used++)
      const t = blast.age / blast.life
      this.frame.toWorld(blast.pos, 0.9, this.tmp)
      view.position.copy(this.tmp)
      view.scale.setScalar(this.frame.len(blast.radius) * (0.35 + t * 0.9))
      const material = view.material as THREE.MeshBasicMaterial
      material.color.set(hex(blast.color))
      material.opacity = (1 - t) * 0.5
      view.visible = true
    }
    for (let i = used; i < this.blasts.length; i++) this.blasts[i]!.visible = false

    // 파편 — 죽은 적에서 흩어지는 조각. 인스턴스 하나로 전부 그린다.
    const particles = game.effects.particles
    const count = Math.min(particles.length, this.sparks.instanceMatrix.count)
    for (let i = 0; i < count; i++) {
      const p = particles[i]!
      const t = p.age / p.life
      // 2D는 평면에서 흩어지지만 3D는 위로 튀었다가 떨어져야 자연스럽다.
      const y = 0.9 + Math.sin(Math.min(1, t) * Math.PI) * 1.1
      this.frame.toWorld(p.pos, y, this.tmp)
      this.tmpScale.setScalar((1 - t) * (p.size / 2.5))
      this.tmpMatrix.compose(this.tmp, this.tmpQuat, this.tmpScale)
      this.sparks.setMatrixAt(i, this.tmpMatrix)
      this.sparks.setColorAt(i, this.tmpColor.set(hex(p.color)))
    }
    this.sparks.count = count
    this.sparks.instanceMatrix.needsUpdate = true
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true
  }

  private blastSlot(index: number): THREE.Mesh {
    let view = this.blasts[index]
    if (!view) {
      view = new THREE.Mesh(
        this.blastGeo,
        new THREE.MeshBasicMaterial({
          color: C.ember,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      )
      view.frustumCulled = false
      this.blasts.push(view)
      this.root.add(view)
    }
    return view
  }
}
