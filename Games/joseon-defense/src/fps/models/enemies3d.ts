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
 *   warded   장옷 — 헐렁한 겉옷과 삿갓이 몸의 윤곽을 지운다
 *   bulwark  방패 — 몸보다 큰 방패를 앞세운다
 *   boss     거대하고 뿔 달린 투구에 등에는 기(旗)를 꽂는다
 *
 * 기마(`flying`)는 실루엣과 직교하는 축이라 형태가 아니라 **말**로 나타난다.
 * 2D에서 흙먼지가 하던 일과 같다.
 *
 * **팔다리는 관절에 매단다.** 다리를 몸통에 그대로 박아 두면 스무 마리가 미끄러지듯
 * 다가오는데, 그건 행군이 아니라 유령이다. 그래서 넓적다리·팔·말다리를 각각
 * 축(피벗) 그룹에 매달고 `userData.swing`에 위상을 적어 둔다 — `Actors`가 그
 * 값을 읽어 걸음 박자에 맞춰 흔든다. 흔드는 쪽은 모형이 아니라 렌더링 층이라,
 * 여기서는 **어디가 움직이는 부분인지만** 표시하면 된다.
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

/**
 * 관절에 매단 팔다리.
 *
 * 축을 어깨·엉덩이에 두고 살은 그 아래로 늘어뜨린다. 메시를 그대로 돌리면
 * 한가운데를 축으로 도는 프로펠러가 된다.
 *
 * @param swing 걸음 위상(라디안). 왼발과 오른발이 반 박자 어긋나야 걷는 것으로 보인다.
 * @param amount 흔들림의 크기. 0이면 고정 — 방패 든 팔처럼 움직이면 안 되는 부분에 쓴다.
 */
function joint(
  limb: THREE.Object3D,
  at: [number, number, number],
  swing: number,
  amount = 1,
): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(at[0], at[1], at[2])
  pivot.add(limb)
  if (amount > 0) pivot.userData['swing'] = swing
  if (amount !== 1) pivot.userData['swingAmount'] = amount
  return pivot
}

function buildEnemy(def: EnemyDef): THREE.Group {
  const group = new THREE.Group()
  const body = hex(def.color)
  const accent = hex(def.accent)
  // 보스와 큰 적은 정의된 반지름을 그대로 몸집에 반영한다 — 2D에서 커 보이던
  // 것이 3D에서 작으면 같은 적으로 안 읽힌다.
  const scale = def.boss ? 1.7 : def.radius / 11

  const figure = new THREE.Group()
  figure.add(legs(def))
  figure.add(torso(def, body, accent))
  figure.add(arms(def, body, accent))
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
    // 안장에 앉으면 다리가 걷지 않는다 — 등자를 밟고 벌린 채다.
    for (const child of figure.children) {
      if (child.userData['legs']) {
        child.rotation.x = 0
        for (const pivot of child.children) {
          delete pivot.userData['swing']
          pivot.rotation.z = -0.5
        }
      }
    }
  }
  group.add(figure)
  return group
}

/** 두 다리. 반 박자 어긋나게 흔들린다. */
function legs(def: EnemyDef): THREE.Group {
  const group = new THREE.Group()
  group.userData['legs'] = true
  const dark = mat(0x2a2a2e)
  const long = def.boss ? 0.92 : 0.72
  const hip = def.silhouette === 'swift' ? 0.62 : long

  for (const side of [-1, 1]) {
    const thigh = mesh(cyl(0.085, 0.075, long, 5), dark)
    thigh.position.y = -long / 2
    const foot = mesh(box(0.2, 0.07, 0.13), mat(0x1e1e22))
    foot.position.set(0.04, -long + 0.03, 0)
    const limb = new THREE.Group()
    limb.add(thigh, foot)
    // 왼발이 나갈 때 오른발은 들어온다.
    group.add(joint(limb, [0, hip, side * 0.12], side > 0 ? 0 : Math.PI))
  }
  return group
}

/** 몸통 — 실루엣이 가장 크게 갈리는 부분. */
function torso(def: EnemyDef, body: number, accent: number): THREE.Group {
  const group = new THREE.Group()
  const cloth = mat(body)
  const trim = mat(accent)

  switch (def.silhouette) {
    case 'swift': {
      // 몸을 낮춘 자세. 상체를 앞으로 기울이고 어깨를 좁힌다.
      const chest = mesh(cyl(0.15, 0.19, 0.52, 6), cloth)
      chest.position.set(0.07, 0.88, 0)
      chest.rotation.z = 0.3
      group.add(chest)
      const sash = mesh(box(0.34, 0.06, 0.28), trim)
      sash.position.set(0.08, 0.72, 0)
      group.add(sash)
      break
    }
    case 'armored': {
      // 찰갑 — 각진 판이 겹쳐 어깨가 넓어진다.
      const chest = mesh(box(0.34, 0.58, 0.5), cloth)
      chest.position.y = 1.0
      group.add(chest)
      for (let i = 0; i < 3; i++) {
        const plate = mesh(box(0.38, 0.09, 0.54), trim)
        plate.position.y = 0.84 + i * 0.18
        group.add(plate)
      }
      // 갑주 치마(草摺) — 허리 아래를 덮어 다리가 짧아 보이게 한다. 중보병의 무게.
      const skirt = mesh(cyl(0.26, 0.34, 0.3, 8), mat(body, { flat: true }))
      skirt.position.y = 0.62
      group.add(skirt)
      break
    }
    case 'warded': {
      // 장옷 — 아래로 퍼지는 겉옷이 다리를 덮어 윤곽이 흐려진다.
      const robe = mesh(cyl(0.19, 0.44, 1.12, 9), cloth)
      robe.position.y = 0.58
      group.add(robe)
      const collar = mesh(cyl(0.21, 0.25, 0.13, 8), trim)
      collar.position.y = 1.18
      group.add(collar)
      // 부적 — 붉은 종잇조각이 매달려 흔들린다.
      const talisman = mesh(box(0.02, 0.22, 0.14), mat(0xc23b2e))
      talisman.position.set(0.19, 1.0, 0.16)
      group.add(talisman)
      break
    }
    case 'bulwark': {
      const chest = mesh(box(0.4, 0.64, 0.56), cloth)
      chest.position.y = 1.0
      group.add(chest)
      const belt = mesh(box(0.44, 0.1, 0.6), trim)
      belt.position.y = 0.7
      group.add(belt)
      const skirt = mesh(cyl(0.3, 0.36, 0.26, 8), mat(body, { flat: true }))
      belt.position.y = 0.72
      skirt.position.y = 0.56
      group.add(skirt)
      break
    }
    case 'boss': {
      const chest = mesh(cyl(0.3, 0.42, 0.85, 8), cloth)
      chest.position.y = 1.15
      group.add(chest)
      for (let i = 0; i < 4; i++) {
        const plate = mesh(box(0.5, 0.1, 0.72), trim)
        plate.position.y = 0.86 + i * 0.2
        group.add(plate)
      }
      // 전포(戰袍) — 등에 드리운 망토. 보스의 실루엣을 가장 크게 만드는 것.
      const cape = mesh(box(0.06, 1.5, 0.95), mat(body, { side: THREE.DoubleSide }))
      cape.position.set(-0.3, 1.05, 0)
      cape.rotation.z = -0.06
      group.add(cape)
      break
    }
    default: {
      const chest = mesh(cyl(0.17, 0.23, 0.56, 7), cloth)
      chest.position.y = 1.0
      group.add(chest)
      const belt = mesh(cyl(0.21, 0.21, 0.07, 7), trim)
      belt.position.y = 0.74
      group.add(belt)
    }
  }
  return group
}

/**
 * 두 팔.
 *
 * 무기를 든 팔은 흔들리지 않는다 — 창을 들고 팔을 휘저으면 행군이 아니라
 * 산책이 된다. 방패 팔도 마찬가지로 고정한다.
 */
function arms(def: EnemyDef, body: number, accent: number): THREE.Group {
  const group = new THREE.Group()
  const sleeve = mat(def.silhouette === 'armored' ? accent : body)
  const long = def.boss ? 0.78 : 0.6
  const shoulderY = def.silhouette === 'swift' ? 1.12 : def.boss ? 1.5 : 1.22
  const width = def.silhouette === 'boss' ? 0.4 : def.silhouette === 'armored' ? 0.34 : 0.28

  for (const side of [-1, 1]) {
    const upper = mesh(cyl(0.062, 0.05, long, 5), sleeve)
    upper.position.y = -long / 2
    const hand = mesh(sph(0.06, 5), mat(0xb08c6e))
    hand.position.y = -long
    const limb = new THREE.Group()
    limb.add(upper, hand)

    // 오른팔(+Z 쪽)이 무기를 잡는 팔이다. 창·방패를 든 적은 그쪽을 고정한다.
    const holds = side > 0 && def.silhouette !== 'basic'
    const pivot = joint(limb, [0, shoulderY, side * width], side > 0 ? Math.PI : 0, holds ? 0 : 1)
    if (holds) pivot.rotation.z = 0.55
    group.add(pivot)
  }
  return group
}

function head(def: EnemyDef, body: number, accent: number): THREE.Group {
  const group = new THREE.Group()
  const y = def.silhouette === 'boss' ? 1.72 : def.silhouette === 'swift' ? 1.34 : 1.45
  const lean = def.silhouette === 'swift' ? 0.12 : 0

  const neck = mesh(cyl(0.06, 0.07, 0.12, 6), mat(0xb08c6e))
  neck.position.set(lean * 0.5, y - 0.14, 0)
  group.add(neck)
  const skull = mesh(sph(def.boss ? 0.16 : 0.13), mat(0xb08c6e))
  skull.position.set(lean, y, 0)
  group.add(skull)

  switch (def.silhouette) {
    case 'armored': {
      // 첨주형 투구 + 목가리개
      const helm = mesh(cone(0.17, 0.28, 8), mat(accent, { flat: true }))
      helm.position.y = y + 0.16
      group.add(helm)
      const spike = mesh(cone(0.03, 0.16, 5), mat(0xd6dce4))
      spike.position.y = y + 0.36
      group.add(spike)
      const neckGuard = mesh(cyl(0.19, 0.24, 0.16, 8), mat(body, { flat: true }))
      neckGuard.position.y = y - 0.08
      group.add(neckGuard)
      break
    }
    case 'warded': {
      // 삿갓 — 얼굴을 가린다. 누구인지 모르는 것이 이 적의 성격이다.
      const hat = mesh(cone(0.36, 0.22, 12), mat(0x6a5f45))
      hat.position.y = y + 0.15
      group.add(hat)
      const brim = mesh(cyl(0.36, 0.36, 0.02, 12), mat(0x594f3b))
      brim.position.y = y + 0.05
      group.add(brim)
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
      // 상모 — 투구 꼭대기의 술. 보스만 단다.
      const plume = mesh(sph(0.08, 6), mat(0xc23b2e))
      plume.position.y = y + 0.34
      group.add(plume)
      break
    }
    case 'swift': {
      const band = mesh(box(0.22, 0.07, 0.26), mat(accent))
      band.position.set(lean, y + 0.08, 0)
      group.add(band)
      const tail = mesh(box(0.24, 0.05, 0.05), mat(accent))
      tail.position.set(lean - 0.16, y + 0.05, 0)
      group.add(tail)
      break
    }
    default: {
      // 머릿수건. 머리보다 작아야 얼굴이 남는다 — 크게 잡으면 머리가 통째로
      // 삼켜져 목 위에 덩어리 하나만 얹힌 꼴이 된다.
      const cap = mesh(sph(0.128, 7), mat(accent))
      cap.position.y = y + 0.07
      cap.scale.y = 0.62
      group.add(cap)
      const knot = mesh(box(0.16, 0.04, 0.04), mat(accent))
      knot.position.set(-0.14, y + 0.05, 0)
      group.add(knot)
    }
  }
  return group
}

/** 손에 든 것과 등에 진 것 — 방패·창·기(旗). */
function gear(def: EnemyDef, body: number, accent: number): THREE.Group {
  const group = new THREE.Group()

  if (def.silhouette === 'bulwark') {
    // 몸보다 큰 방패. 정면(+X)을 막는다.
    //
    // **판때기 하나로 두면 방패가 아니라 담벼락이 된다.** 처음에 통짜 상자로
    // 세웠더니 눈앞 3미터에서 본 충차가 걸어 다니는 널빤지였다. 널을 세로로
    // 짜고 테두리를 두르고 못을 박아야, 같은 크기라도 "들고 있는 물건"으로 읽힌다.
    // 높이는 투구가 위로 비어져 나올 만큼만 — 얼굴이 완전히 가려지면 사람이
    // 아니라 이동하는 벽이 된다.
    const shield = new THREE.Group()
    shield.position.set(0.36, 0.88, 0.08)
    shield.rotation.z = -0.05

    const planks = mat(0x6b4a30)
    const face = mesh(box(0.1, 0.95, 0.76), planks)
    shield.add(face)
    for (let i = -1; i <= 1; i++) {
      const groove = mesh(box(0.03, 0.95, 0.05), mat(0x4a3220))
      groove.position.set(0.06, 0, i * 0.24)
      shield.add(groove)
    }
    // 쇠테 — 위아래를 두른다. 여기서 accent가 쓰여야 적의 색이 살아난다.
    for (const edge of [-1, 1]) {
      const band = mesh(box(0.13, 0.1, 0.8), mat(accent, { flat: true }))
      band.position.set(0.01, edge * 0.44, 0)
      shield.add(band)
    }
    const boss = mesh(sph(0.11, 8), mat(0xd6c48a))
    boss.position.set(0.09, 0, 0)
    shield.add(boss)
    for (const corner of [-1, 1]) {
      for (const edge of [-1, 1]) {
        const stud = mesh(sph(0.035, 5), mat(0xd6c48a))
        stud.position.set(0.07, edge * 0.3, corner * 0.28)
        shield.add(stud)
      }
    }
    group.add(shield)

    // 방패 뒤로 짧은 칼 — 방패만 들고 오면 왜 위험한지가 안 읽힌다.
    const blade = mesh(box(0.5, 0.05, 0.1), mat(0xcfd6dd))
    blade.position.set(0.1, 1.35, -0.24)
    blade.rotation.z = 0.7
    group.add(blade)
  }

  if (def.silhouette !== 'warded' && def.silhouette !== 'bulwark') {
    // 창 — 대부분의 적이 든다. 길이가 실루엣의 세로선을 만든다.
    const tall = def.boss ? 2.6 : 1.8
    const shaft = mesh(cyl(0.03, 0.03, tall, 5), mat(0x6b4a30))
    shaft.position.set(0.2, (def.boss ? 1.4 : 1.05) + 0.1, 0.22)
    shaft.rotation.z = 0.14
    group.add(shaft)
    const tip = mesh(cone(0.06, 0.3, 5), mat(0xc9d1da))
    tip.position.set(0.2 + Math.sin(0.14) * tall * 0.5, (def.boss ? 1.4 : 1.05) + tall / 2 + 0.18, 0.22)
    group.add(tip)
    // 창날 아래 붉은 술. 조선 창의 특징이고, 멀리서 적의 밀도를 읽게 해 준다.
    const tassel = mesh(cyl(0.05, 0.02, 0.16, 5), mat(0xb0392c))
    tassel.position.set(tip.position.x - 0.03, tip.position.y - 0.24, 0.22)
    group.add(tassel)
  }

  if (def.silhouette === 'warded') {
    // 소매 안에 감춘 지팡이. 장옷 실루엣을 깨지 않을 만큼만 내민다.
    //
    // **머리 높이를 넘기지 않는다.** 처음에 손잡이를 1.7까지 올렸더니 삿갓
    // 바로 위에 구슬이 떠서, 지팡이가 아니라 머리에 꽂은 장식으로 보였다.
    const staff = mesh(cyl(0.028, 0.028, 1.34, 5), mat(0x4a3f2e))
    staff.position.set(0.26, 0.86, 0.3)
    staff.rotation.z = 0.1
    group.add(staff)
    const knob = mesh(sph(0.065, 6), mat(accent))
    knob.position.set(0.32, 1.5, 0.3)
    group.add(knob)
  }

  if (def.boss) {
    // 등에 꽂은 기(旗). 보스가 오는 것을 벽 너머에서도 보게 한다.
    const pole = mesh(cyl(0.035, 0.035, 2.6, 5), mat(0x4a3220))
    pole.position.set(-0.3, 2.0, 0.25)
    group.add(pole)
    const flag = mesh(box(0.03, 0.9, 0.7), mat(body, { side: THREE.DoubleSide }))
    flag.position.set(-0.3, 2.75, 0.6)
    group.add(flag)
    const finial = mesh(cone(0.07, 0.24, 6), mat(0xe8ddc0))
    finial.position.set(-0.3, 3.4, 0.25)
    group.add(finial)
  }
  return group
}

/** 말. 기마 적의 발밑. 네 다리가 어긋난 박자로 달린다. */
function horse(body: number, accent: number): THREE.Group {
  const group = new THREE.Group()
  const hide = mat(0x4a3a2c)
  const mane = mat(accent)

  const barrel = mesh(cyl(0.32, 0.3, 1.5, 8), hide)
  barrel.position.y = 1.1
  barrel.rotation.z = Math.PI / 2
  group.add(barrel)
  const chest = mesh(sph(0.34, 7), hide)
  chest.position.set(0.6, 1.12, 0)
  chest.scale.set(0.8, 1, 0.95)
  group.add(chest)

  // 앞다리와 뒷다리가 대각으로 짝을 이룬다 — 속보(trot)의 박자다.
  const gait = [0, Math.PI, Math.PI, 0]
  let i = 0
  for (const fx of [0.55, -0.5]) {
    for (const side of [-1, 1]) {
      const upper = mesh(cyl(0.09, 0.06, 1.0, 5), hide)
      upper.position.y = -0.5
      const hoof = mesh(cyl(0.07, 0.08, 0.12, 5), mat(0x241d17))
      hoof.position.y = -1.02
      const limb = new THREE.Group()
      limb.add(upper, hoof)
      group.add(joint(limb, [fx, 1.05, side * 0.26], gait[i++]!, 0.7))
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
  for (const side of [-1, 1]) {
    const ear = mesh(cone(0.05, 0.14, 5), hide)
    ear.position.set(0.9, 1.92, side * 0.08)
    group.add(ear)
  }
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
  const blanket = mesh(box(0.7, 0.04, 0.86), mat(body, { flat: true }))
  blanket.position.set(0.02, 1.27, 0)
  group.add(blanket)
  return group
}
