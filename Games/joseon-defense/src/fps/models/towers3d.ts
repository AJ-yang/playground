import * as THREE from 'three'
import type { TowerDef } from '../../data/towers'
import { C, hex } from '../palette3d'
import { TILE_M } from '../coords'
import { box, cone, cyl, geo, mat, mesh, sph } from './kit'

/**
 * 기물의 3D 모형 — 절차적으로 세운다.
 *
 * 외부 모델 파일을 쓰지 않는 이유는 2D 아트가 그랬던 것과 같다. 이 게임의
 * 기물은 밸런스가 바뀌면 생김새도 같이 바뀌어야 하는데(레벨이 오르면 병력이
 * 늘어야 한다), 그때마다 모델러를 거쳐야 하면 수치를 못 만진다.
 *
 * **레벨은 병력 수로 읽힌다.** Lv1은 한 명, Lv2는 두 명, Lv3은 세 명이 선다.
 * 기(器)는 사람이 늘 수 없으니 대신 포신이 굵어지고 짐이 붙는다. 1인칭에서는
 * 머리 위 숫자를 볼 수 없으므로, 강화한 기물이 **멀리서 실루엣만으로**
 * 달라 보여야 강화가 보람이 된다.
 *
 * 규약 두 가지:
 *   - 모형의 **정면은 로컬 +X**다. 조준각(`turretAngle`)이 보드 기준
 *     `atan2(dy, dx)`이므로 `rotation.y = -angle` 한 줄로 맞아떨어진다.
 *   - 조준해서 움직이는 부분은 `userData.turret` 그룹에 담는다. 총구 위치가
 *     필요한 연출은 `userData.muzzle`을 읽는다.
 */

export interface TowerModel extends THREE.Group {
  userData: {
    /** 적을 향해 돌아가는 부분. 없으면(기고·거마작) undefined. */
    turret?: THREE.Group
    /** 발사 섬광을 띄울 자리 */
    muzzle?: THREE.Object3D
    /** 깃발처럼 바람에 흔들리는 부분 */
    flag?: THREE.Object3D
  }
}

// ────────────────────────────── 사람 ──────────────────────────────

/**
 * 병사 하나. 키 1.7m 기준.
 *
 * 무기는 `hand` 그룹에 담아 돌려준다 — 조준할 때 사람 전체가 돌아야 하는지
 * (사수·포수) 팔만 돌아야 하는지가 기물마다 다르기 때문이다. 여기서는
 * **사람 전체를 돌린다**. 1인칭에서 보기에 그쪽이 훨씬 살아 있어 보인다.
 */
function soldier(bodyColor: number, accentColor: number): THREE.Group {
  const group = new THREE.Group()
  const cloth = mat(bodyColor)
  const trim = mat(accentColor)
  const skin = mat(0xc7a183)
  const dark = mat(0x2b2b2f)

  // 바지·행전
  for (const side of [-1, 1]) {
    const leg = mesh(cyl(0.085, 0.1, 0.72, 6), dark)
    leg.position.set(0, 0.36, side * 0.12)
    group.add(leg)
  }
  // 저고리 위에 걸친 전복(戰服)
  const torso = mesh(cyl(0.2, 0.26, 0.62, 8), cloth)
  torso.position.y = 1.02
  group.add(torso)
  // 전대(戰帶) — 허리끈. 옷색과 대비되는 띠 하나로 몸통이 통짜로 안 보인다.
  const belt = mesh(cyl(0.235, 0.235, 0.08, 8), trim)
  belt.position.y = 0.8
  group.add(belt)

  const head = mesh(sph(0.13), skin)
  head.position.y = 1.45
  group.add(head)

  // 전립(戰笠) — 챙 넓은 벙거지. 이 실루엣 하나로 조선 병사가 된다.
  const brim = mesh(cyl(0.28, 0.28, 0.03, 10), mat(0x33302c))
  brim.position.y = 1.55
  group.add(brim)
  const crown = mesh(cone(0.16, 0.22, 10), mat(0x33302c))
  crown.position.y = 1.66
  group.add(crown)
  const knob = mesh(sph(0.045, 6), trim)
  knob.position.y = 1.78
  group.add(knob)

  return group
}

/**
 * 팔 한 짝. 어깨에서 앞으로 뻗는다.
 *
 * 안쪽 끝이 반드시 어깨에 붙어 있어야 한다 — 중심을 대충 앞에 두면 팔을
 * 들어 올린 자세(pitch가 큰 쪽)에서 어깨와 팔이 떨어져 공중에 막대가 뜬다.
 */
function arm(color: number, length: number, pitch: number, side: number): THREE.Mesh {
  const shoulderY = 1.24
  const limb = mesh(cyl(0.055, 0.065, length, 6), mat(color))
  limb.position.set(
    Math.cos(pitch) * length * 0.5,
    shoulderY + Math.sin(pitch) * length * 0.5,
    side * 0.23,
  )
  limb.rotation.z = -Math.PI / 2 + pitch
  return limb
}

// ────────────────────────────── 발밑 ──────────────────────────────

/**
 * 기물이 딛는 자리.
 *
 * 병(兵)은 흙을 돋운 단, 기(器)는 나무 받침, 책(柵)은 바닥 그대로 — `kind`가
 * 곧 발밑 처리다. 2D에서 정한 규칙을 그대로 옮겼다. 멀리서 봐도 저것이
 * 사람인지 기계인지 장애물인지가 발밑에서 먼저 읽힌다.
 */
function footing(kind: TowerDef['kind']): THREE.Object3D | null {
  if (kind === 'barrier') return null
  const size = TILE_M * 0.86
  if (kind === 'engine') {
    const plate = mesh(box(size, 0.18, size), mat(C.timberDark))
    plate.position.y = 0.09
    plate.receiveShadow = true
    return plate
  }
  const mound = mesh(cyl(size * 0.5, size * 0.56, 0.3, 10), mat(C.stoneDark, { flat: true }))
  mound.position.y = 0.15
  mound.receiveShadow = true
  return mound
}

/** 레벨 표식 — 단 둘레에 꽂는 작은 깃대. 병력 수와 별개로 숫자를 정확히 읽게 한다. */
function levelPins(level: number, accent: number): THREE.Object3D {
  const group = new THREE.Group()
  for (let i = 0; i < level; i++) {
    const angle = Math.PI * 0.75 + (i - (level - 1) / 2) * 0.42
    const pole = mesh(cyl(0.025, 0.025, 0.7, 4), mat(C.timberDark))
    pole.position.set(Math.cos(angle) * TILE_M * 0.42, 0.45, Math.sin(angle) * TILE_M * 0.42)
    group.add(pole)
    const pennant = mesh(box(0.02, 0.16, 0.18), mat(accent))
    pennant.position.set(pole.position.x, 0.72, pole.position.z + 0.1)
    group.add(pennant)
  }
  return group
}

// ────────────────────────────── 무기 ──────────────────────────────

/**
 * 각궁 — 쥔 손 앞에 세운 활 하나와 등 뒤 화살통.
 *
 * 활은 **XY 평면**에 눕는다. 활채가 위아래로 뻗고 배가 앞(+X)으로 부풀어야
 * 화살이 그 사이를 지나간다. 처음에 X축으로 90도 눕혔더니 활이 바닥과
 * 나란해져, 병사가 가슴 앞에 막대를 가로로 든 꼴이 됐다.
 */
function bow(accent: number): THREE.Group {
  const group = new THREE.Group()
  const limb = geo('bowlimb', () => new THREE.TorusGeometry(0.32, 0.026, 5, 14, Math.PI * 1.1))
  const arc = mesh(limb, mat(C.timber))
  arc.position.set(0.16, 1.2, 0.17)
  // 호가 +X를 가운데 두도록 돌린다 (0~198° → -99~+99°).
  arc.rotation.set(0, 0, -Math.PI * 0.55)
  group.add(arc)
  // 시위는 두 끝을 잇는 세로줄. 활채가 부푼 만큼 뒤에 선다.
  const string = mesh(box(0.01, 0.62, 0.01), mat(0xd8d2bd))
  string.position.set(0.11, 1.2, 0.17)
  group.add(string)
  const quiver = mesh(cyl(0.07, 0.07, 0.4, 6), mat(C.timberDark))
  quiver.position.set(-0.16, 1.15, -0.14)
  quiver.rotation.z = 0.35
  group.add(quiver)
  for (let i = 0; i < 3; i++) {
    const shaft = mesh(cyl(0.012, 0.012, 0.34, 4), mat(accent))
    shaft.position.set(-0.2 + i * 0.03, 1.42, -0.16 + i * 0.04)
    shaft.rotation.z = 0.35
    group.add(shaft)
  }
  return group
}

/** 환도 — 치켜든 칼. */
function sabre(accent: number): THREE.Group {
  const group = new THREE.Group()
  const blade = mesh(box(0.72, 0.045, 0.11), mat(0xcfd6dd))
  blade.position.set(0.42, 1.5, 0.2)
  blade.rotation.z = 0.5
  group.add(blade)
  const guard = mesh(cyl(0.09, 0.09, 0.035, 8), mat(accent))
  guard.position.set(0.12, 1.31, 0.2)
  group.add(guard)
  const grip = mesh(cyl(0.035, 0.035, 0.18, 6), mat(C.timberDark))
  grip.position.set(0.06, 1.26, 0.2)
  grip.rotation.z = 0.5
  group.add(grip)
  return group
}

/** 조총 — 화승이 물린 긴 총열. */
function musket(): { group: THREE.Group; muzzle: THREE.Object3D } {
  const group = new THREE.Group()
  const stock = mesh(box(0.5, 0.08, 0.07), mat(C.timber))
  stock.position.set(0.1, 1.22, 0.2)
  group.add(stock)
  const barrel = mesh(cyl(0.028, 0.032, 0.86, 6), mat(0x4a4d52))
  barrel.position.set(0.55, 1.26, 0.2)
  barrel.rotation.z = Math.PI / 2
  group.add(barrel)
  const match = mesh(sph(0.035, 6), mat(C.ember, { emissive: 0xff6a1e }))
  match.position.set(0.24, 1.3, 0.2)
  group.add(match)

  const muzzle = new THREE.Object3D()
  muzzle.position.set(1.0, 1.26, 0.2)
  group.add(muzzle)
  return { group, muzzle }
}

/** 총통 — 나무 거치대에 얹은 청동 포신. */
function chongtong(level: number): { group: THREE.Group; muzzle: THREE.Object3D } {
  const group = new THREE.Group()
  const r = 0.13 + level * 0.022
  const carriage = mesh(box(1.0, 0.22, 0.5), mat(C.timber))
  carriage.position.set(0, 0.5, 0)
  group.add(carriage)
  for (const side of [-1, 1]) {
    const strut = mesh(box(0.16, 0.5, 0.14), mat(C.timberDark))
    strut.position.set(-0.3, 0.3, side * 0.22)
    group.add(strut)
  }
  const barrel = mesh(cyl(r, r * 1.25, 1.5, 12), mat(0x8a6f3a))
  barrel.position.set(0.35, 0.78, 0)
  barrel.rotation.z = Math.PI / 2 - 0.16
  group.add(barrel)
  // 죽절(竹節) — 대나무 마디처럼 두른 보강 띠. 조선 총통의 특징이다.
  for (let i = 0; i < 3; i++) {
    const band = mesh(cyl(r * 1.2, r * 1.2, 0.08, 12), mat(0xa8874a))
    band.position.set(-0.15 + i * 0.5, 0.86 - i * 0.08, 0)
    band.rotation.z = Math.PI / 2 - 0.16
    group.add(band)
  }
  const muzzle = new THREE.Object3D()
  muzzle.position.set(1.1, 0.96, 0)
  group.add(muzzle)
  return { group, muzzle }
}

/** 화차 — 수레 위 신기전 발사틀. 레벨이 오르면 발사공이 늘어난다. */
function hwacha(level: number): { group: THREE.Group; muzzle: THREE.Object3D } {
  const group = new THREE.Group()
  const bed = mesh(box(1.3, 0.16, 0.9), mat(C.timber))
  bed.position.set(0, 0.62, 0)
  group.add(bed)
  for (const side of [-1, 1]) {
    const wheel = mesh(cyl(0.44, 0.44, 0.1, 12), mat(C.timberDark))
    wheel.position.set(-0.1, 0.44, side * 0.52)
    wheel.rotation.x = Math.PI / 2
    group.add(wheel)
    for (let s = 0; s < 4; s++) {
      const spoke = mesh(box(0.8, 0.05, 0.05), mat(C.timber))
      spoke.position.copy(wheel.position)
      spoke.rotation.x = Math.PI / 2
      spoke.rotation.y = (s * Math.PI) / 4
      group.add(spoke)
    }
  }
  // 발사틀 — 위로 15도 들린다. 하늘로 쏘아 올리는 물건이라야 화차로 보인다.
  const frame = new THREE.Group()
  frame.position.set(0.05, 0.78, 0)
  frame.rotation.z = 0.26
  const shellBody = mesh(box(0.9, 0.5, 0.86), mat(C.timberDark))
  frame.add(shellBody)
  const rows = 2 + level
  for (let r2 = 0; r2 < rows; r2++) {
    for (let c = 0; c < 5; c++) {
      const tube = mesh(cyl(0.045, 0.045, 0.92, 5), mat(0x3a332a))
      tube.position.set(0.05, -0.18 + r2 * 0.17, -0.34 + c * 0.17)
      tube.rotation.z = Math.PI / 2
      frame.add(tube)
    }
  }
  group.add(frame)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0.75, 1.05, 0)
  group.add(muzzle)
  return { group, muzzle }
}

/** 비격진천뢰 — 심지가 타는 무쇠 구슬과 화로. */
function bombs(level: number): THREE.Group {
  const group = new THREE.Group()
  const brazier = mesh(cyl(0.26, 0.2, 0.26, 8), mat(0x3d3a35))
  brazier.position.set(-0.45, 0.42, -0.35)
  group.add(brazier)
  const fire = mesh(sph(0.16, 6), mat(C.ember, { emissive: 0xff6a1e }))
  fire.position.set(-0.45, 0.6, -0.35)
  group.add(fire)
  for (let i = 0; i < level + 1; i++) {
    const shell = mesh(sph(0.17, 8), mat(0x35383d))
    shell.position.set(0.45 - i * 0.02, 0.5, 0.3 - i * 0.34)
    group.add(shell)
    const band = mesh(cyl(0.18, 0.18, 0.04, 8), mat(0x5a5f66))
    band.position.copy(shell.position)
    band.rotation.x = Math.PI / 2
    group.add(band)
  }
  return group
}

/** 기고 — 북과 깃발. 딜이 없는 대신 눈에는 가장 잘 띈다. */
function bannerRig(level: number, accent: number): { group: THREE.Group; flag: THREE.Object3D } {
  const group = new THREE.Group()
  const pole = mesh(cyl(0.06, 0.07, 4.2 + level * 0.3, 8), mat(C.timberDark))
  pole.position.set(0.15, (4.2 + level * 0.3) / 2 + 0.3, 0.2)
  group.add(pole)

  const flag = new THREE.Group()
  const clothGeo = geo('flagcloth', () => new THREE.PlaneGeometry(1.5, 1.0, 6, 1))
  const cloth = mesh(clothGeo, mat(accent, { side: THREE.DoubleSide }))
  cloth.position.set(0.75, 0, 0)
  flag.add(cloth)
  flag.position.set(0.15, 3.6 + level * 0.3, 0.2)
  group.add(flag)

  const finial = mesh(cone(0.09, 0.28, 6), mat(accent))
  finial.position.set(0.15, 4.6 + level * 0.3, 0.2)
  group.add(finial)

  // 북 — 지휘의 반쪽. 깃발이 눈이라면 북은 귀다.
  const drum = mesh(cyl(0.38, 0.38, 0.5, 12), mat(0x8c3b2c))
  drum.position.set(-0.4, 0.75, -0.3)
  drum.rotation.z = Math.PI / 2
  group.add(drum)
  for (const side of [-1, 1]) {
    const rim = mesh(cyl(0.4, 0.4, 0.05, 12), mat(0xd8c48a))
    rim.position.set(-0.4 + side * 0.24, 0.75, -0.3)
    rim.rotation.z = Math.PI / 2
    group.add(rim)
  }
  const stand = mesh(box(0.1, 0.5, 0.9), mat(C.timber))
  stand.position.set(-0.4, 0.3, -0.3)
  group.add(stand)

  return { group, flag }
}

/** 거마작 — 통나무에 창을 꽂아 만든 기병 저지물. 사람이 서지 않는다. */
function chevaux(level: number): THREE.Group {
  const group = new THREE.Group()
  const beam = mesh(cyl(0.14, 0.14, TILE_M * 0.9, 8), mat(C.timber))
  beam.position.y = 0.55
  beam.rotation.x = Math.PI / 2
  group.add(beam)

  const spikes = 4 + level * 2
  for (let i = 0; i < spikes; i++) {
    const t = (i / (spikes - 1) - 0.5) * TILE_M * 0.8
    for (const axis of [0, 1]) {
      const spike = mesh(cyl(0.03, 0.06, 1.5, 5), mat(C.timberDark))
      spike.position.set(0, 0.55, t)
      spike.rotation.x = axis === 0 ? 0.9 : -0.9
      spike.rotation.z = axis === 0 ? 0.9 : -0.9
      group.add(spike)
      const tip = mesh(cone(0.05, 0.16, 5), mat(0xb9c0c8))
      tip.position.set(
        Math.sin(axis === 0 ? 0.9 : -0.9) * 0.72,
        0.55 + Math.cos(0.9) * 0.72 * (axis === 0 ? 1 : 1),
        t,
      )
      tip.rotation.z = axis === 0 ? 0.9 : -0.9
      group.add(tip)
    }
  }
  // 발밑에 깐 잔가지 — 바닥에 놓인 물건이라는 것을 발밑에서 읽게 한다.
  const litter = mesh(box(TILE_M * 0.9, 0.06, TILE_M * 0.7), mat(C.timberDark))
  litter.position.y = 0.03
  litter.receiveShadow = true
  group.add(litter)
  return group
}

// ────────────────────────────── 조립 ──────────────────────────────

/**
 * 기물 하나의 모형을 세운다.
 *
 * @param level 1~3. 병력 수와 장비 규모가 여기서 갈린다.
 */
export function buildTowerModel(def: TowerDef, level: number): TowerModel {
  const model = new THREE.Group() as TowerModel
  model.userData = {}

  const base = footing(def.kind)
  if (base) model.add(base)
  if (def.kind !== 'barrier') model.add(levelPins(level, hex(def.accent)))

  const turret = new THREE.Group()
  turret.position.y = def.kind === 'engine' ? 0 : 0.3
  model.add(turret)

  const body = hex(def.color)
  const accent = hex(def.accent)

  const crew = (make: (index: number) => THREE.Object3D): void => {
    // 병력은 단 위에 부채꼴로 선다. 한 명일 때 정중앙, 둘 이상이면 좌우로 벌린다.
    for (let i = 0; i < level; i++) {
      const offset = (i - (level - 1) / 2) * 0.62
      const person = new THREE.Group()
      person.add(soldier(body, accent))
      person.add(make(i))
      person.position.set(0, 0, offset)
      // 완전히 나란히 서면 인형처럼 보인다. 조금씩 어긋나게 둔다.
      person.rotation.y = (i - (level - 1) / 2) * 0.14
      turret.add(person)
    }
  }

  switch (def.shape) {
    case 'arrow': {
      crew(() => {
        const g = new THREE.Group()
        g.add(bow(accent))
        g.add(arm(body, 0.5, -0.1, 1))
        g.add(arm(body, 0.42, 0.5, -1))
        return g
      })
      const muzzle = new THREE.Object3D()
      muzzle.position.set(0.5, 1.5, 0)
      turret.add(muzzle)
      model.userData.muzzle = muzzle
      break
    }
    case 'blade': {
      crew(() => {
        const g = new THREE.Group()
        g.add(sabre(accent))
        g.add(arm(body, 0.44, 0.7, 1))
        g.add(arm(body, 0.4, -0.3, -1))
        return g
      })
      const muzzle = new THREE.Object3D()
      muzzle.position.set(0.6, 1.4, 0)
      turret.add(muzzle)
      model.userData.muzzle = muzzle
      break
    }
    case 'musket': {
      let tip: THREE.Object3D | null = null
      crew(() => {
        const g = new THREE.Group()
        const weapon = musket()
        g.add(weapon.group)
        g.add(arm(body, 0.46, 0.05, 1))
        g.add(arm(body, 0.4, 0.2, -1))
        if (!tip) tip = weapon.muzzle
        return g
      })
      if (tip) model.userData.muzzle = tip
      break
    }
    case 'flask': {
      crew(() => {
        const g = new THREE.Group()
        g.add(arm(body, 0.44, 0.6, 1))
        g.add(arm(body, 0.4, -0.2, -1))
        return g
      })
      turret.add(bombs(level))
      const muzzle = new THREE.Object3D()
      muzzle.position.set(0.55, 1.2, 0)
      turret.add(muzzle)
      model.userData.muzzle = muzzle
      break
    }
    case 'orb': {
      const rig = chongtong(level)
      turret.add(rig.group)
      model.userData.muzzle = rig.muzzle
      // 포수 한 명이 옆에 붙는다. 사람 없이 놓인 포는 버려진 물건처럼 보인다.
      const gunner = soldier(body, accent)
      gunner.position.set(-0.55, 0, 0.55)
      gunner.rotation.y = -0.6
      gunner.scale.setScalar(0.95)
      turret.add(gunner)
      break
    }
    case 'cannon': {
      const rig = hwacha(level)
      turret.add(rig.group)
      model.userData.muzzle = rig.muzzle
      const gunner = soldier(body, accent)
      gunner.position.set(-0.85, 0, 0.15)
      gunner.rotation.y = 0.2
      gunner.scale.setScalar(0.95)
      turret.add(gunner)
      break
    }
    case 'banner': {
      const rig = bannerRig(level, accent)
      turret.add(rig.group)
      model.userData.flag = rig.flag
      for (let i = 0; i < level; i++) {
        const drummer = soldier(body, accent)
        drummer.position.set(-0.5, 0, -0.3 + i * 0.5)
        drummer.rotation.y = 1.2
        drummer.scale.setScalar(0.95)
        turret.add(drummer)
      }
      break
    }
    case 'crystal': {
      turret.add(chevaux(level))
      break
    }
  }

  // 조준하지 않는 기물(기고·거마작)은 turret을 노출하지 않는다 —
  // 노출하면 Actors가 매 프레임 각도를 밀어 넣어 깃발이 팽이처럼 돈다.
  if (def.shape !== 'banner' && def.shape !== 'crystal') model.userData.turret = turret

  return model
}

const ghostMaterials = new Map<number, THREE.MeshBasicMaterial>()

function ghostMaterial(color: number): THREE.MeshBasicMaterial {
  let m = ghostMaterials.get(color)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false })
    ghostMaterials.set(color, m)
  }
  return m
}

/** 배치 미리보기용 반투명 모형. 실제 재질을 건드리지 않도록 전부 갈아 끼운다. */
export function buildGhostModel(def: TowerDef, valid: boolean): THREE.Group {
  const model = buildTowerModel(def, 1)
  const ghost = ghostMaterial(valid ? C.valid : C.invalid)
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.material = ghost
      object.castShadow = false
      object.receiveShadow = false
    }
  })
  return model
}
