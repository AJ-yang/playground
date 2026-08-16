import * as THREE from 'three'
import type { EnemyDef } from '../../data/enemies'
import { hex } from '../palette3d'
import { box, cone, cyl, mat, mesh, sph } from './kit'

/**
 * 적의 3D 모형.
 *
 * **실루엣 규칙을 3D로 옮긴 것이 이 파일의 전부다.** 2D에서 적의 방어 유형은
 * 색이 아니라 형태(원·쐐기·육각·마름모·방패·뿔)로 읽혔다. 눈높이가 사람 키로
 * 내려와도 그 약속이 깨지면 안 된다 — 3배속으로 스무 마리가 몰려올 때 무엇을
 * 지어야 하는지는 여전히 형태로 판단하게 되기 때문이다. 그래서 각 실루엣을
 * **몸의 윤곽**으로 번역했다.
 *
 *   basic    맨몸 — 아무 장구도 없다
 *   swift    몸을 낮추고 달린다. 짐이 없고 어깨가 좁다
 *   armored  찰갑 — 어깨와 가슴이 각지게 부풀고 투구가 얹힌다
 *   warded   장옷·부적 — 헐렁한 겉옷이 몸을 덮어 윤곽이 흐려진다
 *   bulwark  방패 — 몸보다 큰 방패를 앞세운다
 *   boss     거대하고 뿔 달린 투구에 등에는 기(旗)를 꽂는다
 *
 * 기마(`flying`)는 실루엣과 직교하는 축이라 형태가 아니라 **말**로 나타난다.
 * 2D에서 흙먼지가 하던 일과 같다.
 *
 * 모형은 종류마다 한 번만 세우고 개체는 `clone()`으로 찍는다. 클론은 재질과
 * 지오메트리를 공유하므로 마흔 마리가 나와도 자원은 한 벌이다.
 */

const templates = new Map<string, THREE.Group>()

/** 적 종류의 모형 한 벌. 개체는 이걸 `clone()` 해서 쓴다. */
export function enemyTemplate(def: EnemyDef): THREE.Group {
  let template = templates.get(def.id)
  if (!template) {
    template = buildEnemy(def)
    templates.set(def.id, template)
  }
  return template
}

/** 모형의 대략적인 키(미터). HP 바를 머리 위에 띄울 높이를 정하는 데 쓴다. */
export function enemyHeight(def: EnemyDef): number {
  const base = def.boss ? 3.0 : def.silhouette === 'swift' ? 1.5 : 1.8
  return def.flying ? base + 0.9 : base
}

function buildEnemy(def: EnemyDef): THREE.Group {
  const group = new THREE.Group()
  const body = hex(def.color)
  const accent = hex(def.accent)
  // 보스와 큰 적은 정의된 반지름을 그대로 몸집에 반영한다 — 2D에서 커 보이던
  // 것이 3D에서 작으면 같은 적으로 안 읽힌다.
  const scale = def.boss ? 1.7 : def.radius / 11

  const figure = new THREE.Group()
  figure.add(torso(def, body, accent))
  figure.add(head(def, body, accent))
  figure.add(gear(def, body, accent))
  figure.scale.setScalar(scale)

  if (def.flying) {
    // 기마 — 말 위에 사람을 얹는다. 발이 땅에 닿지 않아야 기병으로 읽힌다.
    const mount = horse(body, accent)
    mount.scale.setScalar(scale)
    group.add(mount)
    figure.position.y = 1.15 * scale
    figure.scale.multiplyScalar(0.92)
  }
  group.add(figure)
  return group
}

/** 몸통 — 실루엣이 가장 크게 갈리는 부분. */
function torso(def: EnemyDef, body: number, accent: number): THREE.Group {
  const group = new THREE.Group()
  const cloth = mat(body)
  const trim = mat(accent)
  const dark = mat(0x2a2a2e)

  for (const side of [-1, 1]) {
    const leg = mesh(cyl(0.08, 0.09, 0.7, 5), dark)
    leg.position.set(0, 0.35, side * 0.11)
    group.add(leg)
  }

  switch (def.silhouette) {
    case 'swift': {
      // 몸을 낮춘 자세. 상체를 앞으로 기울이고 어깨를 좁힌다.
      const chest = mesh(cyl(0.16, 0.2, 0.55, 6), cloth)
      chest.position.set(0.06, 0.96, 0)
      chest.rotation.z = 0.26
      group.add(chest)
      const sash = mesh(box(0.36, 0.06, 0.3), trim)
      sash.position.set(0.06, 0.86, 0)
      group.add(sash)
      break
    }
    case 'armored': {
      // 찰갑 — 각진 판이 겹쳐 어깨가 넓어진다.
      const chest = mesh(box(0.34, 0.6, 0.5), cloth)
      chest.position.y = 1.0
      group.add(chest)
      for (let i = 0; i < 3; i++) {
        const plate = mesh(box(0.38, 0.09, 0.54), trim)
        plate.position.y = 0.82 + i * 0.18
        group.add(plate)
      }
      for (const side of [-1, 1]) {
        const pauldron = mesh(box(0.3, 0.16, 0.22), mat(accent, { flat: true }))
        pauldron.position.set(0, 1.26, side * 0.32)
        group.add(pauldron)
      }
      break
    }
    case 'warded': {
      // 장옷 — 아래로 퍼지는 겉옷이 다리를 덮어 윤곽이 흐려진다.
      const robe = mesh(cyl(0.2, 0.42, 1.1, 8), cloth)
      robe.position.y = 0.6
      group.add(robe)
      const collar = mesh(cyl(0.22, 0.26, 0.14, 8), trim)
      collar.position.y = 1.2
      group.add(collar)
      // 부적 — 붉은 종잇조각이 매달려 흔들린다.
      const talisman = mesh(box(0.02, 0.22, 0.14), mat(0xc23b2e))
      talisman.position.set(0.2, 1.0, 0.16)
      group.add(talisman)
      break
    }
    case 'bulwark': {
      const chest = mesh(box(0.4, 0.66, 0.56), cloth)
      chest.position.y = 1.0
      group.add(chest)
      const belt = mesh(box(0.44, 0.1, 0.6), trim)
      belt.position.y = 0.72
      group.add(belt)
      break
    }
    case 'boss': {
      const chest = mesh(cyl(0.3, 0.42, 0.85, 8), cloth)
      chest.position.y = 1.05
      group.add(chest)
      for (let i = 0; i < 4; i++) {
        const plate = mesh(box(0.5, 0.1, 0.72), trim)
        plate.position.y = 0.76 + i * 0.2
        group.add(plate)
      }
      for (const side of [-1, 1]) {
        const pauldron = mesh(sph(0.22, 6), mat(accent, { flat: true }))
        pauldron.position.set(0, 1.4, side * 0.4)
        group.add(pauldron)
      }
      break
    }
    default: {
      const chest = mesh(cyl(0.18, 0.24, 0.58, 7), cloth)
      chest.position.y = 1.0
      group.add(chest)
      const belt = mesh(cyl(0.22, 0.22, 0.07, 7), trim)
      belt.position.y = 0.76
      group.add(belt)
    }
  }
  return group
}

function head(def: EnemyDef, body: number, accent: number): THREE.Group {
  const group = new THREE.Group()
  const y = def.silhouette === 'boss' ? 1.62 : def.silhouette === 'swift' ? 1.34 : 1.45
  const skull = mesh(sph(def.boss ? 0.16 : 0.13), mat(0xb08c6e))
  skull.position.set(def.silhouette === 'swift' ? 0.12 : 0, y, 0)
  group.add(skull)

  switch (def.silhouette) {
    case 'armored': {
      // 투구 + 목가리개
      const helm = mesh(cone(0.17, 0.28, 8), mat(accent, { flat: true }))
      helm.position.y = y + 0.16
      group.add(helm)
      const spike = mesh(cone(0.03, 0.16, 5), mat(0xd6dce4))
      spike.position.y = y + 0.36
      group.add(spike)
      const neck = mesh(cyl(0.2, 0.24, 0.14, 8), mat(body))
      neck.position.y = y - 0.06
      group.add(neck)
      break
    }
    case 'warded': {
      // 삿갓 — 얼굴을 가린다. 누구인지 모르는 것이 이 적의 성격이다.
      const hat = mesh(cone(0.34, 0.2, 10), mat(0x6a5f45))
      hat.position.y = y + 0.14
      group.add(hat)
      break
    }
    case 'boss': {
      const helm = mesh(cyl(0.19, 0.21, 0.24, 8), mat(accent, { flat: true }))
      helm.position.y = y + 0.16
      group.add(helm)
      for (const side of [-1, 1]) {
        const horn = mesh(cone(0.05, 0.42, 5), mat(0xe8ddc0))
        horn.position.set(0, y + 0.3, side * 0.16)
        horn.rotation.x = side * 0.7
        group.add(horn)
      }
      break
    }
    case 'swift': {
      const band = mesh(box(0.2, 0.06, 0.24), mat(accent))
      band.position.set(0.12, y + 0.08, 0)
      group.add(band)
      break
    }
    default: {
      // 머릿수건. 머리보다 작아야 얼굴이 남는다 — 크게 잡으면 머리가 통째로
      // 삼켜져 목 위에 덩어리 하나만 얹힌 꼴이 된다.
      const cap = mesh(sph(0.128, 7), mat(accent))
      cap.position.y = y + 0.07
      cap.scale.y = 0.62
      group.add(cap)
    }
  }
  return group
}

/** 손에 든 것과 등에 진 것 — 방패·창·기(旗). */
function gear(def: EnemyDef, body: number, accent: number): THREE.Group {
  const group = new THREE.Group()

  if (def.silhouette === 'bulwark') {
    // 몸보다 큰 방패. 정면(+X)을 막는다.
    const shield = mesh(box(0.1, 1.15, 0.8), mat(accent, { flat: true }))
    shield.position.set(0.34, 0.95, 0)
    group.add(shield)
    const boss = mesh(sph(0.13, 7), mat(0xd6c48a))
    boss.position.set(0.42, 0.98, 0)
    group.add(boss)
  }

  if (def.silhouette !== 'warded' && def.silhouette !== 'bulwark') {
    // 창 — 대부분의 적이 든다. 길이가 실루엣의 세로선을 만든다.
    const shaft = mesh(cyl(0.03, 0.03, def.boss ? 2.4 : 1.7, 5), mat(0x6b4a30))
    shaft.position.set(0.18, def.boss ? 1.3 : 1.0, -0.2)
    shaft.rotation.z = 0.12
    group.add(shaft)
    const tip = mesh(cone(0.06, 0.28, 5), mat(0xc9d1da))
    tip.position.set(0.32, def.boss ? 2.6 : 1.95, -0.2)
    group.add(tip)
  }

  if (def.boss) {
    // 등에 꽂은 기(旗). 보스가 오는 것을 벽 너머에서도 보게 한다.
    const pole = mesh(cyl(0.035, 0.035, 2.6, 5), mat(0x4a3220))
    pole.position.set(-0.3, 2.0, 0.25)
    group.add(pole)
    const flag = mesh(box(0.03, 0.9, 0.7), mat(body, { side: THREE.DoubleSide }))
    flag.position.set(-0.3, 2.75, 0.6)
    group.add(flag)
  }
  return group
}

/** 말. 기마 적의 발밑. */
function horse(body: number, accent: number): THREE.Group {
  const group = new THREE.Group()
  const hide = mat(0x4a3a2c)
  const mane = mat(accent)

  const barrel = mesh(cyl(0.32, 0.3, 1.5, 8), hide)
  barrel.position.y = 1.1
  barrel.rotation.z = Math.PI / 2
  group.add(barrel)

  for (const fx of [0.55, -0.5]) {
    for (const side of [-1, 1]) {
      const leg = mesh(cyl(0.09, 0.07, 1.05, 5), hide)
      leg.position.set(fx, 0.52, side * 0.26)
      group.add(leg)
    }
  }

  const neck = mesh(cyl(0.16, 0.22, 0.75, 6), hide)
  neck.position.set(0.78, 1.5, 0)
  neck.rotation.z = -0.7
  group.add(neck)
  const skull = mesh(box(0.46, 0.2, 0.2), hide)
  skull.position.set(1.06, 1.72, 0)
  skull.rotation.z = -0.25
  group.add(skull)
  const crest = mesh(box(0.5, 0.16, 0.06), mane)
  crest.position.set(0.8, 1.72, 0)
  crest.rotation.z = -0.6
  group.add(crest)

  const tail = mesh(cone(0.12, 0.6, 6), mane)
  tail.position.set(-0.78, 1.15, 0)
  tail.rotation.z = 1.9
  group.add(tail)

  // 다래(장니)와 안장 — 사람이 앉는 자리.
  const saddle = mesh(box(0.5, 0.12, 0.72), mat(body))
  saddle.position.set(0.02, 1.34, 0)
  group.add(saddle)
  return group
}
