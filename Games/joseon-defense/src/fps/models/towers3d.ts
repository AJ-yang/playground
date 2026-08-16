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
 * **고증은 실루엣이 갈리는 데까지만 따른다.** 살수의 등패(藤牌)나 총통의
 * 죽절(竹節)을 넣는 이유는 고증 자체가 아니라, 그것이 있어야 옆 기물과 형태가
 * 갈리기 때문이다. 눈높이가 사람 키인 화면에서 여덟 종이 전부 "막대 든 사람"이면
 * 무엇을 지었는지 기억할 수가 없다.
 *
 * 규약 넷:
 *   - 모형의 **정면은 로컬 +X**다. 조준각(`turretAngle`)이 보드 기준
 *     `atan2(dy, dx)`이므로 `rotation.y = -angle` 한 줄로 맞아떨어진다.
 *   - 조준해서 움직이는 부분은 `userData.turret` 그룹에 담는다.
 *   - 발사 반동으로 뒤로 밀릴 부분은 `userData.recoil` 배열에 담는다 —
 *     포신은 미끄러지고 사람은 어깨를 젖힌다. 미는 쪽은 `Actors`다.
 *   - 가만히 있을 때 미세하게 흔들릴 부분은 `userData.idle` 배열에 담는다.
 *     이게 없으면 준비 시간 동안 기물이 통째로 정지 화면이 된다.
 */

export interface TowerModel extends THREE.Group {
  userData: {
    /** 적을 향해 돌아가는 부분. 없으면(기고·거마작) undefined. */
    turret?: THREE.Group
    /** 발사 섬광을 띄울 자리 */
    muzzle?: THREE.Object3D
    /** 깃발처럼 바람에 흔들리는 부분 */
    flag?: THREE.Object3D
    /** 반동으로 뒤로 밀리는 부분과 그 거리(미터) */
    recoil?: Array<{ node: THREE.Object3D; back: number; rest: number }>
    /** 숨 쉬듯 흔들리는 부분과 위상 */
    idle?: Array<{ node: THREE.Object3D; phase: number }>
  }
}

// ────────────────────────────── 사람 ──────────────────────────────

/**
 * 병사 하나. 키 1.7m 기준.
 *
 * 조선 병사의 실루엣은 **전립(戰笠)** 하나로 결정된다 — 챙 넓은 벙거지에
 * 꼭지가 달린 그 모양. 그래서 머리에 가장 공을 들이고, 몸통은 전복(戰服)과
 * 요대(腰帶)의 두 색으로만 나눈다. 여기서 디테일을 더 얹어 봐야 세 걸음만
 * 물러나면 안 보이고, 드로우콜만 늘어난다.
 */
function soldier(bodyColor: number, accentColor: number): THREE.Group {
  const group = new THREE.Group()
  const cloth = mat(bodyColor)
  const trim = mat(accentColor)
  const skin = mat(0xc7a183)
  const dark = mat(0x2b2b2f)

  // 다리 — 한 발을 앞으로 낸 사격 자세. 나란히 세우면 차렷 자세가 되어
  // 전투 중인 병사로 안 보인다.
  for (const side of [-1, 1]) {
    const leg = mesh(cyl(0.08, 0.095, 0.7, 6), dark)
    leg.position.set(side > 0 ? 0.09 : -0.07, 0.35, side * 0.13)
    leg.rotation.z = side > 0 ? -0.14 : 0.1
    group.add(leg)
    // 행전(行纏) — 정강이를 감은 천. 다리가 통짜 막대로 안 보이게 하는 띠.
    const wrap = mesh(cyl(0.088, 0.078, 0.22, 6), trim)
    wrap.position.set(leg.position.x + (side > 0 ? 0.03 : -0.02), 0.16, side * 0.13)
    group.add(wrap)
    const foot = mesh(box(0.22, 0.07, 0.13), dark)
    foot.position.set(leg.position.x + 0.05, 0.035, side * 0.13)
    group.add(foot)
  }

  // 저고리 위에 걸친 전복(戰服)
  const torso = mesh(cyl(0.19, 0.25, 0.6, 8), cloth)
  torso.position.y = 1.0
  group.add(torso)
  // 전대(戰帶) — 허리끈. 옷색과 대비되는 띠 하나로 몸통이 통짜로 안 보인다.
  const belt = mesh(cyl(0.225, 0.225, 0.08, 8), trim)
  belt.position.y = 0.78
  group.add(belt)
  // 어깨 — 팔이 붙을 자리를 넓혀 준다. 원통 하나면 목부터 허리까지 직선이다.
  const shoulders = mesh(cyl(0.2, 0.17, 0.14, 8), cloth)
  shoulders.position.y = 1.29
  group.add(shoulders)

  const neck = mesh(cyl(0.055, 0.065, 0.1, 6), skin)
  neck.position.y = 1.37
  group.add(neck)
  const head = mesh(sph(0.125), skin)
  head.position.y = 1.46
  group.add(head)

  // 전립(戰笠) — 챙 넓은 벙거지. 이 실루엣 하나로 조선 병사가 된다.
  const brim = mesh(cyl(0.27, 0.27, 0.028, 12), mat(0x33302c))
  brim.position.y = 1.55
  group.add(brim)
  const crown = mesh(cone(0.155, 0.2, 12), mat(0x3a352f))
  crown.position.y = 1.65
  group.add(crown)
  const knob = mesh(sph(0.042, 6), trim)
  knob.position.y = 1.76
  group.add(knob)
  // 갓끈 — 턱 아래로 내려오는 줄. 없으면 모자가 머리 위에 얹혀만 있다.
  const strap = mesh(box(0.02, 0.16, 0.02), mat(0x241f1a))
  strap.position.set(0.1, 1.44, 0.1)
  group.add(strap)

  return group
}

/**
 * 팔 한 짝. 어깨에서 앞으로 뻗는다.
 *
 * 안쪽 끝이 반드시 어깨에 붙어 있어야 한다 — 중심을 대충 앞에 두면 팔을
 * 들어 올린 자세(pitch가 큰 쪽)에서 어깨와 팔이 떨어져 공중에 막대가 뜬다.
 */
function arm(color: number, length: number, pitch: number, side: number): THREE.Mesh {
  const shoulderY = 1.26
  const limb = mesh(cyl(0.055, 0.065, length, 6), mat(color))
  limb.position.set(
    Math.cos(pitch) * length * 0.5,
    shoulderY + Math.sin(pitch) * length * 0.5,
    side * 0.22,
  )
  limb.rotation.z = -Math.PI / 2 + pitch
  return limb
}

/** 주먹. 팔 끝이 허공에서 잘리면 소매만 뻗은 꼴이 된다. */
function fist(at: [number, number, number]): THREE.Mesh {
  const hand = mesh(sph(0.058, 6), mat(0xc7a183))
  hand.position.set(at[0], at[1], at[2])
  return hand
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
  const group = new THREE.Group()
  const size = TILE_M * 0.86

  if (kind === 'engine') {
    // 널을 깐 포좌(砲座). 판 한 장이면 발밑이 매끈한 회색 접시가 된다.
    const deck = mesh(box(size, 0.16, size), mat(C.timberDark))
    deck.position.y = 0.08
    deck.receiveShadow = true
    group.add(deck)
    for (let i = -2; i <= 2; i++) {
      const plank = mesh(box(size, 0.04, 0.06), mat(0x3b2a1a))
      plank.position.set(0, 0.17, (i * size) / 5.4)
      group.add(plank)
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const peg = mesh(cyl(0.05, 0.05, 0.24, 5), mat(C.timber))
        peg.position.set((sx * size) / 2.3, 0.12, (sz * size) / 2.3)
        group.add(peg)
      }
    }
    return group
  }

  // 흙을 돋운 단과 그 둘레의 모래주머니. 사람이 몸을 가리는 자리다.
  const mound = mesh(cyl(size * 0.5, size * 0.56, 0.28, 12), mat(C.stoneDark, { flat: true }))
  mound.position.y = 0.14
  mound.receiveShadow = true
  group.add(mound)
  // 모래주머니 — **구슬이 아니라 자루다.** 처음에 구를 눌러 놓았더니 단 둘레에
  // 돌멩이를 늘어놓은 꼴이 됐다. 눕힌 상자를 겹쳐 쌓아야 천으로 읽힌다.
  const sacks = 7
  for (let i = 0; i < sacks; i++) {
    // 정면(+X) 쪽 반원에만 쌓는다 — 적을 보는 쪽이라야 엄폐가 된다.
    const angle = -Math.PI / 2 + (i / (sacks - 1)) * Math.PI
    const x = Math.cos(angle) * size * 0.48
    const z = Math.sin(angle) * size * 0.48
    const lower = mesh(box(0.2, 0.15, 0.38), mat(0x7a6d54, { flat: true }))
    lower.position.set(x, 0.34, z)
    lower.rotation.y = -angle
    group.add(lower)
    // 위 켜는 반 칸씩 어긋나게 — 벽돌처럼 엇물려야 쌓은 것으로 보인다.
    if (i < sacks - 1) {
      const upperAngle = angle + Math.PI / (sacks - 1) / 2
      const upper = mesh(box(0.19, 0.14, 0.36), mat(0x6f6249, { flat: true }))
      upper.position.set(Math.cos(upperAngle) * size * 0.48, 0.47, Math.sin(upperAngle) * size * 0.48)
      upper.rotation.y = -upperAngle
      group.add(upper)
    }
  }
  return group
}

/** 레벨 표식 — 단 뒤에 꽂는 수기(手旗). 병력 수와 별개로 숫자를 정확히 읽게 한다. */
function levelPins(level: number, accent: number): THREE.Object3D {
  const group = new THREE.Group()
  for (let i = 0; i < level; i++) {
    const angle = Math.PI * 0.78 + (i - (level - 1) / 2) * 0.36
    const x = Math.cos(angle) * TILE_M * 0.44
    const z = Math.sin(angle) * TILE_M * 0.44
    const pole = mesh(cyl(0.022, 0.022, 0.86, 4), mat(C.timberDark))
    pole.position.set(x, 0.53, z)
    group.add(pole)
    const cloth = mesh(box(0.015, 0.2, 0.24), mat(accent, { side: THREE.DoubleSide }))
    cloth.position.set(x, 0.84, z + 0.13)
    group.add(cloth)
  }
  return group
}

// ────────────────────────────── 무기 ──────────────────────────────

/**
 * 각궁 — 시위를 당긴 자세.
 *
 * 활은 **XY 평면**에 눕는다. 활채가 위아래로 뻗고 배가 앞(+X)으로 부풀어야
 * 화살이 그 사이를 지나간다. 처음에 X축으로 90도 눕혔더니 활이 바닥과
 * 나란해져, 병사가 가슴 앞에 막대를 가로로 든 꼴이 됐다.
 */
function bow(accent: number): { group: THREE.Group; draw: THREE.Object3D } {
  const group = new THREE.Group()
  const limbGeo = geo('bowlimb', () => new THREE.TorusGeometry(0.32, 0.026, 5, 14, Math.PI * 1.1))
  const arc = mesh(limbGeo, mat(C.timber))
  arc.position.set(0.16, 1.2, 0.17)
  // 호가 +X를 가운데 두도록 돌린다 (0~198° → -99~+99°).
  arc.rotation.set(0, 0, -Math.PI * 0.55)
  group.add(arc)
  // 고자(활 끝) — 각궁은 끝이 반대로 젖혀 있다. 이 두 점이 각궁의 표식이다.
  for (const end of [-1, 1]) {
    const tipEnd = mesh(cyl(0.02, 0.03, 0.12, 5), mat(0x3a2a1c))
    tipEnd.position.set(0.11, 1.2 + end * 0.31, 0.17)
    tipEnd.rotation.z = end * 0.5
    group.add(tipEnd)
  }

  // 시위와 그것을 당긴 손. 당긴 손이 반동으로 앞으로 튀어나간다.
  const draw = new THREE.Group()
  const string = mesh(box(0.01, 0.62, 0.01), mat(0xd8d2bd))
  string.position.set(0.02, 1.2, 0.17)
  draw.add(string)
  const shaft = mesh(cyl(0.012, 0.012, 0.66, 4), mat(0xbfae8c))
  shaft.position.set(0.3, 1.2, 0.17)
  shaft.rotation.z = Math.PI / 2
  draw.add(shaft)
  const head = mesh(cone(0.022, 0.07, 5), mat(0xc9d1da))
  head.position.set(0.64, 1.2, 0.17)
  head.rotation.z = -Math.PI / 2
  draw.add(head)
  group.add(draw)

  // 등에 멘 시복(矢箙) — 화살통. 화살 끝의 깃이 보여야 통이 통으로 읽힌다.
  const quiver = mesh(cyl(0.07, 0.06, 0.42, 6), mat(C.timberDark))
  quiver.position.set(-0.17, 1.12, -0.16)
  quiver.rotation.z = 0.32
  group.add(quiver)
  for (let i = 0; i < 3; i++) {
    const nock = mesh(cyl(0.01, 0.01, 0.2, 4), mat(0xbfae8c))
    nock.position.set(-0.24 + i * 0.02, 1.4, -0.19 + i * 0.05)
    nock.rotation.z = 0.32
    group.add(nock)
    const feather = mesh(box(0.012, 0.11, 0.05), mat(accent))
    feather.position.set(-0.26 + i * 0.02, 1.46, -0.19 + i * 0.05)
    group.add(feather)
  }
  return { group, draw }
}

/** 환도와 등패(藤牌) — 살수의 표식. 칼만 들면 옆 기물과 실루엣이 안 갈린다. */
function sabre(accent: number): THREE.Group {
  const group = new THREE.Group()

  const blade = mesh(box(0.7, 0.045, 0.11), mat(0xcfd6dd))
  blade.position.set(0.36, 1.62, 0.22)
  blade.rotation.z = 0.62
  group.add(blade)
  const guard = mesh(cyl(0.085, 0.085, 0.03, 8), mat(accent))
  guard.position.set(0.11, 1.4, 0.22)
  group.add(guard)
  const grip = mesh(cyl(0.033, 0.033, 0.19, 6), mat(0x2f2721))
  grip.position.set(0.06, 1.33, 0.22)
  grip.rotation.z = 0.62
  group.add(grip)

  // 등패 — 등나무를 감아 만든 둥근 방패. 살수는 이걸 왼팔에 낀다.
  const shield = new THREE.Group()
  shield.position.set(0.28, 1.06, -0.24)
  shield.rotation.z = -0.12
  const face = mesh(cyl(0.31, 0.29, 0.07, 14), mat(0x7d6238, { flat: true }))
  face.rotation.z = Math.PI / 2
  shield.add(face)
  for (let i = 0; i < 3; i++) {
    const ring = mesh(cyl(0.3 - i * 0.09, 0.3 - i * 0.09, 0.02, 14), mat(0x5e4828))
    ring.position.x = 0.04
    ring.rotation.z = Math.PI / 2
    shield.add(ring)
  }
  // 배꼽 쇠는 밝아야 한다. 어두우면 방패 한가운데 구멍이 뚫린 것으로 보인다.
  const boss = mesh(sph(0.07, 7), mat(0x9aa3ad))
  boss.position.x = 0.06
  shield.add(boss)
  group.add(shield)

  // 허리에 찬 칼집 — 칼을 뽑아 든 병사에게도 집은 남아 있어야 한다.
  const sheath = mesh(cyl(0.04, 0.035, 0.6, 6), mat(0x33302c))
  sheath.position.set(-0.16, 0.74, -0.12)
  sheath.rotation.z = 0.5
  group.add(sheath)
  return group
}

/** 조총 — 화승이 물린 긴 총열. 개머리판과 가늠쇠까지 있어야 총으로 읽힌다. */
function musket(): { group: THREE.Group; muzzle: THREE.Object3D; slide: THREE.Object3D } {
  const group = new THREE.Group()
  const slide = new THREE.Group()

  const stock = mesh(box(0.46, 0.09, 0.07), mat(C.timber))
  stock.position.set(0.05, 1.2, 0.2)
  slide.add(stock)
  const butt = mesh(box(0.2, 0.13, 0.08), mat(0x5a3c22))
  butt.position.set(-0.18, 1.17, 0.2)
  butt.rotation.z = 0.18
  slide.add(butt)
  const barrel = mesh(cyl(0.026, 0.03, 0.9, 8), mat(0x4a4d52))
  barrel.position.set(0.58, 1.25, 0.2)
  barrel.rotation.z = Math.PI / 2
  slide.add(barrel)
  const sight = mesh(box(0.02, 0.04, 0.02), mat(0x6a6d72))
  sight.position.set(0.98, 1.29, 0.2)
  slide.add(sight)
  // 용두(龍頭) — 화승을 물린 S자 걸쇠. 조총을 조총으로 만드는 부품이다.
  const serpentine = mesh(box(0.05, 0.12, 0.03), mat(0x6a6d72))
  serpentine.position.set(0.22, 1.32, 0.2)
  serpentine.rotation.z = -0.4
  slide.add(serpentine)
  const match = mesh(sph(0.032, 6), mat(C.ember, { emissive: 0xff6a1e }))
  match.position.set(0.25, 1.37, 0.2)
  slide.add(match)
  group.add(slide)

  const muzzle = new THREE.Object3D()
  muzzle.position.set(1.04, 1.25, 0.2)
  group.add(muzzle)
  return { group, muzzle, slide }
}

/**
 * 총통 — 동차(童車)에 얹은 청동 포신.
 *
 * 죽절(竹節)이 이 물건의 표식이다 — 대나무 마디처럼 두른 보강 띠. 조선 총통은
 * 주조 이음매를 이 띠로 감아 압력을 견뎠고, 그래서 실루엣이 매끈한 원통이
 * 아니라 마디진 막대가 된다.
 */
function chongtong(level: number): {
  group: THREE.Group
  muzzle: THREE.Object3D
  slide: THREE.Object3D
} {
  const group = new THREE.Group()
  const slide = new THREE.Group()
  const r = 0.13 + level * 0.022

  // 동차 — 포신을 얹는 나무 수레
  const bed = mesh(box(1.15, 0.16, 0.46), mat(C.timber))
  bed.position.set(-0.05, 0.52, 0)
  group.add(bed)
  for (const side of [-1, 1]) {
    const rail = mesh(box(1.15, 0.22, 0.07), mat(0x5a3c22))
    rail.position.set(-0.05, 0.66, side * 0.23)
    group.add(rail)
    const wheel = mesh(cyl(0.22, 0.22, 0.08, 10), mat(C.timberDark))
    wheel.position.set(0.3, 0.22, side * 0.28)
    wheel.rotation.x = Math.PI / 2
    group.add(wheel)
  }
  // 고임목 — 포구를 들어 올리는 쐐기. 포가 수평이면 화살이 땅에 박힌다.
  const wedge = mesh(box(0.3, 0.2, 0.36), mat(0x4a3220))
  wedge.position.set(-0.4, 0.68, 0)
  group.add(wedge)

  const barrel = mesh(cyl(r, r * 1.28, 1.45, 12), mat(0x8a6f3a))
  barrel.position.set(0.32, 0.82, 0)
  barrel.rotation.z = Math.PI / 2 - 0.17
  slide.add(barrel)
  for (let i = 0; i < 4; i++) {
    const band = mesh(cyl(r * 1.22, r * 1.22, 0.07, 12), mat(0xa8874a))
    band.position.set(-0.24 + i * 0.38, 0.92 - i * 0.065, 0)
    band.rotation.z = Math.PI / 2 - 0.17
    slide.add(band)
  }
  // 손잡이 — 포신을 옮길 때 잡는 고리
  for (const side of [-1, 1]) {
    const ring = mesh(cyl(0.05, 0.05, 0.03, 8), mat(0xa8874a))
    ring.position.set(0.1, 0.96, side * r * 1.2)
    group.add(ring)
  }
  group.add(slide)

  // 화약 궤와 격목(激木) 더미 — 포 옆에 있어야 쓰는 물건으로 보인다.
  const crate = mesh(box(0.34, 0.26, 0.3), mat(0x4a3f2e))
  crate.position.set(-0.62, 0.13, 0.52)
  group.add(crate)
  const lid = mesh(box(0.36, 0.04, 0.32), mat(0x6b5a42))
  crate.add(lid.translateY(0.15))

  const muzzle = new THREE.Object3D()
  muzzle.position.set(1.08, 1.0, 0)
  group.add(muzzle)
  return { group, muzzle, slide }
}

/**
 * 화차 — 수레 위 신기전 발사틀.
 *
 * 발사틀은 위로 들려 있어야 한다. 화차는 하늘로 쏘아 올려 떨어뜨리는 물건이라,
 * 수평으로 두면 그냥 상자를 실은 수레가 된다. 레벨이 오르면 발사공의 줄이 는다 —
 * 백 발이 한 번에 나가는 물건이니 구멍 수가 곧 위력이다.
 */
function hwacha(level: number): {
  group: THREE.Group
  muzzle: THREE.Object3D
  slide: THREE.Object3D
} {
  const group = new THREE.Group()

  const bed = mesh(box(1.3, 0.16, 0.9), mat(C.timber))
  bed.position.set(0, 0.62, 0)
  group.add(bed)
  for (const side of [-1, 1]) {
    const wheel = mesh(cyl(0.44, 0.44, 0.1, 14), mat(C.timberDark))
    wheel.position.set(-0.1, 0.44, side * 0.52)
    wheel.rotation.x = Math.PI / 2
    group.add(wheel)
    const hub = mesh(cyl(0.1, 0.1, 0.16, 8), mat(0x5a3c22))
    hub.position.copy(wheel.position)
    hub.rotation.x = Math.PI / 2
    group.add(hub)
    for (let s = 0; s < 4; s++) {
      const spoke = mesh(box(0.82, 0.05, 0.05), mat(C.timber))
      spoke.position.copy(wheel.position)
      spoke.rotation.x = Math.PI / 2
      spoke.rotation.y = (s * Math.PI) / 4
      group.add(spoke)
    }
  }
  // 끌채 — 수레를 끄는 두 막대. 이게 있어야 굴러온 물건으로 보인다.
  for (const side of [-1, 1]) {
    const shaft = mesh(cyl(0.05, 0.04, 0.9, 5), mat(C.timber))
    shaft.position.set(-0.85, 0.5, side * 0.3)
    shaft.rotation.z = Math.PI / 2 - 0.12
    group.add(shaft)
  }

  // 발사틀 — 위로 15도. 반동으로 통째로 뒤로 밀린다.
  const slide = new THREE.Group()
  slide.position.set(0.05, 0.78, 0)
  slide.rotation.z = 0.26
  const shell = mesh(box(0.88, 0.52, 0.86), mat(C.timberDark))
  slide.add(shell)
  const rows = 2 + level
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 5; c++) {
      const tube = mesh(cyl(0.045, 0.045, 0.92, 6), mat(0x3a332a))
      tube.position.set(0.05, -0.18 + r * 0.17, -0.34 + c * 0.17)
      tube.rotation.z = Math.PI / 2
      slide.add(tube)
      // 장전된 신기전의 살대. 통 끝으로 삐죽 나온 것이 곧 남은 화력이다.
      const arrow = mesh(cyl(0.012, 0.012, 0.34, 4), mat(0xbfae8c))
      arrow.position.set(0.6, -0.18 + r * 0.17, -0.34 + c * 0.17)
      arrow.rotation.z = Math.PI / 2
      slide.add(arrow)
    }
  }
  group.add(slide)

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0.78, 1.06, 0)
  group.add(muzzle)
  return { group, muzzle, slide }
}

/**
 * 별파진 — 완구(碗口)와 비격진천뢰.
 *
 * 비격진천뢰는 손으로 던지는 물건이 아니라 **완구라는 사발 모양 박격포로
 * 쏘아 올리는** 폭탄이다. 그래서 발밑에 구슬만 굴려 두면 무엇으로 쏘는지가
 * 화면에서 사라진다. 사발을 놓고 그 옆에 탄을 쌓는다.
 */
function bomblauncher(level: number): { group: THREE.Group; muzzle: THREE.Object3D } {
  const group = new THREE.Group()

  // 완구 — 받침돌 위의 사발. 위로 크게 벌어진 입이 표식이다.
  const base = mesh(box(0.62, 0.2, 0.5), mat(C.stoneDark, { flat: true }))
  base.position.set(0.16, 0.1, 0)
  group.add(base)
  const bowl = mesh(cyl(0.3, 0.19, 0.44, 12), mat(0x6e5a34))
  bowl.position.set(0.16, 0.42, 0)
  bowl.rotation.z = -0.3
  group.add(bowl)
  const rim = mesh(cyl(0.33, 0.33, 0.06, 12), mat(0xa8874a))
  rim.position.set(0.24, 0.62, 0)
  rim.rotation.z = -0.3
  group.add(rim)
  const shellIn = mesh(sph(0.17, 8), mat(0x35383d))
  shellIn.position.set(0.24, 0.66, 0)
  group.add(shellIn)

  // 화로와 심지. 불씨가 이 기물의 유일한 따뜻한 색이다.
  const brazier = mesh(cyl(0.24, 0.18, 0.26, 8), mat(0x3d3a35))
  brazier.position.set(-0.5, 0.4, -0.32)
  group.add(brazier)
  const legs3 = mesh(cyl(0.03, 0.03, 0.3, 5), mat(0x3d3a35))
  legs3.position.set(-0.5, 0.15, -0.32)
  group.add(legs3)
  const fire = mesh(sph(0.15, 6), mat(C.ember, { emissive: 0xff6a1e }))
  fire.position.set(-0.5, 0.57, -0.32)
  group.add(fire)

  // 쌓아 둔 진천뢰. 레벨이 곧 재고다.
  for (let i = 0; i <= level; i++) {
    const shell = mesh(sph(0.16, 8), mat(0x35383d))
    shell.position.set(-0.3 + (i % 2) * 0.34, 0.16, 0.42 - Math.floor(i / 2) * 0.34)
    group.add(shell)
    const band = mesh(cyl(0.17, 0.17, 0.035, 8), mat(0x5a5f66))
    band.position.copy(shell.position)
    band.rotation.x = Math.PI / 2
    group.add(band)
    const fuse = mesh(cyl(0.02, 0.02, 0.1, 4), mat(0x8a7a5a))
    fuse.position.set(shell.position.x, 0.29, shell.position.z)
    group.add(fuse)
  }

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0.32, 0.8, 0)
  group.add(muzzle)
  return { group, muzzle }
}

/** 기고 — 북과 깃발. 딜이 0인 대신 눈에는 가장 잘 띈다. */
function bannerRig(level: number, accent: number): { group: THREE.Group; flag: THREE.Object3D } {
  const group = new THREE.Group()
  const height = 3.8 + level * 0.28

  const pole = mesh(cyl(0.055, 0.07, height, 8), mat(C.timberDark))
  pole.position.set(0.15, height / 2 + 0.3, 0.2)
  group.add(pole)

  const flag = new THREE.Group()
  const clothGeo = geo('flagcloth', () => new THREE.PlaneGeometry(1.5, 1.0, 6, 1))
  const cloth = mesh(clothGeo, mat(accent, { side: THREE.DoubleSide }))
  cloth.position.set(0.75, 0, 0)
  flag.add(cloth)
  // 화염각(火焰脚) — 깃발 가장자리의 불꽃 모양 이빨. 조선 군기의 특징이다.
  for (let i = 0; i < 3; i++) {
    const tooth = mesh(box(0.3, 0.16, 0.01), mat(accent, { side: THREE.DoubleSide }))
    tooth.position.set(1.58, -0.34 + i * 0.34, 0)
    tooth.rotation.z = 0.5
    flag.add(tooth)
  }
  flag.position.set(0.15, height - 0.6, 0.2)
  group.add(flag)

  const finial = mesh(cone(0.085, 0.3, 8), mat(accent))
  finial.position.set(0.15, height + 0.42, 0.2)
  group.add(finial)
  const tassel = mesh(cyl(0.05, 0.02, 0.22, 6), mat(0xb0392c))
  tassel.position.set(0.15, height + 0.16, 0.2)
  group.add(tassel)

  // 좌고(座鼓) — 틀에 매단 북. 깃발이 눈이라면 북은 귀다.
  const drum = new THREE.Group()
  drum.position.set(-0.42, 0.86, -0.5)
  const body = mesh(cyl(0.4, 0.4, 0.52, 14), mat(0x8c3b2c))
  body.rotation.z = Math.PI / 2
  drum.add(body)
  for (const side of [-1, 1]) {
    const skin = mesh(cyl(0.41, 0.41, 0.04, 14), mat(0xd8c48a))
    skin.position.x = side * 0.26
    skin.rotation.z = Math.PI / 2
    drum.add(skin)
    const tack = mesh(cyl(0.43, 0.43, 0.03, 14), mat(0x5a2a20))
    tack.position.x = side * 0.22
    tack.rotation.z = Math.PI / 2
    drum.add(tack)
  }
  group.add(drum)
  // 북틀 — 두 기둥과 가로대. 땅에 굴러다니는 북은 지휘 도구가 아니다.
  for (const sz of [-1, 1]) {
    const post = mesh(box(0.1, 1.14, 0.1), mat(C.timber))
    post.position.set(-0.42, 0.57, -0.5 + sz * 0.46)
    group.add(post)
  }
  const crossbar = mesh(box(0.08, 0.08, 1.05), mat(C.timber))
  crossbar.position.set(-0.42, 1.34, -0.5)
  group.add(crossbar)

  return { group, flag }
}

/**
 * 거마작 — 통나무에 창을 꽂아 만든 기병 저지물.
 *
 * 사람이 서지 않는 유일한 기물이다. 가로 지른 통나무 하나에 X자로 엇갈린
 * 말뚝을 박고, 그 끝을 깎아 세운다. **말이 뛰어넘을 수 없는 높이**로 보여야
 * 하므로 창끝은 사람 가슴께(1.2m)에 온다.
 */
function chevaux(level: number): THREE.Group {
  const group = new THREE.Group()
  const span = TILE_M * 0.86
  const spikeLen = 1.5

  // 가로 통나무 — 모든 말뚝이 여기 묶인다.
  const beam = mesh(cyl(0.13, 0.13, span, 8), mat(C.timber))
  beam.position.y = 0.66
  beam.rotation.x = Math.PI / 2
  group.add(beam)

  // X자 말뚝. 레벨이 오르면 촘촘해진다.
  const pairs = 2 + level
  for (let i = 0; i < pairs; i++) {
    const z = ((i / (pairs - 1)) - 0.5) * span * 0.82
    for (const lean of [0.85, -0.85]) {
      const stake = new THREE.Group()
      stake.position.set(0, 0.66, z)
      stake.rotation.z = lean

      const shaft = mesh(cyl(0.05, 0.038, spikeLen, 6), mat(C.timberDark))
      shaft.rotation.z = Math.PI / 2
      stake.add(shaft)
      for (const end of [-1, 1]) {
        const tip = mesh(cone(0.055, 0.2, 6), mat(0xb9c0c8))
        tip.position.x = (end * (spikeLen + 0.18)) / 2
        tip.rotation.z = end > 0 ? -Math.PI / 2 : Math.PI / 2
        stake.add(tip)
      }
      // 묶은 새끼줄 — 엇갈린 두 말뚝이 한 물건임을 보여 준다.
      group.add(stake)
    }
    const lash = mesh(cyl(0.075, 0.075, 0.1, 8), mat(0x6b5a42))
    lash.position.set(0, 0.66, z)
    lash.rotation.x = Math.PI / 2
    group.add(lash)
  }

  // 발밑 — **널을 깔면 안 된다.** 판을 하나 놓았더니 거마작이 탁자 위에 얹힌
  // 꼴이 됐다. 이건 땅에 박아 세우는 물건이니, 밟혀 다져진 흙자국과 박아 둔
  // 말뚝 몇 개만 남긴다.
  const scar = mesh(cyl(TILE_M * 0.46, TILE_M * 0.46, 0.05, 14), mat(0x4a3f2e))
  scar.position.y = 0.025
  scar.receiveShadow = true
  group.add(scar)
  for (const sz of [-1, 1]) {
    const anchor = mesh(cyl(0.045, 0.06, 0.5, 5), mat(C.timberDark))
    anchor.position.set(0.1, 0.2, (sz * span) / 2.1)
    anchor.rotation.x = sz * 0.2
    group.add(anchor)
    const rope = mesh(cyl(0.02, 0.02, 0.6, 4), mat(0x6b5a42))
    rope.position.set(0.05, 0.45, (sz * span) / 2.3)
    rope.rotation.z = 0.9
    group.add(rope)
  }
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
  const recoil: NonNullable<TowerModel['userData']['recoil']> = []
  const idle: NonNullable<TowerModel['userData']['idle']> = []
  model.userData = { recoil, idle }

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
      // 저마다 다른 박자로 숨 쉰다. 같은 위상이면 셋이 한 몸처럼 흔들린다.
      idle.push({ node: person, phase: i * 2.1 })
    }
  }

  switch (def.shape) {
    case 'arrow': {
      crew(() => {
        const g = new THREE.Group()
        const weapon = bow(accent)
        g.add(weapon.group)
        g.add(arm(body, 0.52, -0.02, 1))
        g.add(fist([0.5, 1.25, 0.22]))
        g.add(arm(body, 0.3, 0.35, -1))
        // 시위는 놓는 순간 **앞으로** 튀어나간다. 총열이 뒤로 밀리는 것과
        // 반대 방향이라, 같은 배열에 담되 부호가 반대다.
        recoil.push({ node: weapon.draw, back: 0.18, rest: 0 })
        return g
      })
      const muzzle = new THREE.Object3D()
      muzzle.position.set(0.6, 1.24, 0)
      turret.add(muzzle)
      model.userData.muzzle = muzzle
      break
    }
    case 'blade': {
      crew(() => {
        const g = new THREE.Group()
        g.add(sabre(accent))
        g.add(arm(body, 0.42, 0.75, 1))
        g.add(arm(body, 0.4, -0.42, -1))
        return g
      })
      // 칼은 내려칠 때 앞으로 나간다 — 반동이 아니라 타격이다.
      recoil.push({ node: turret, back: 0.14, rest: 0 })
      const muzzle = new THREE.Object3D()
      muzzle.position.set(0.62, 1.5, 0)
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
        g.add(arm(body, 0.48, 0.02, 1))
        g.add(fist([0.46, 1.24, 0.22]))
        g.add(arm(body, 0.34, 0.16, -1))
        recoil.push({ node: weapon.slide, back: -0.13, rest: 0 })
        if (!tip) tip = weapon.muzzle
        return g
      })
      if (tip) model.userData.muzzle = tip
      break
    }
    case 'flask': {
      const rig = bomblauncher(level)
      turret.add(rig.group)
      model.userData.muzzle = rig.muzzle
      // 완구를 다루는 별파진 한 명. 사람 없이 놓인 포는 버려진 물건이다.
      const gunner = new THREE.Group()
      gunner.add(soldier(body, accent))
      gunner.add(arm(body, 0.44, 0.5, 1))
      // 화승 막대 — 완구의 심지에 불을 붙이는 긴 막대.
      // 막대는 **손끝에서** 뻗어야 한다. 중심을 손에 두면 막대가 몸을 관통한다.
      const linstock = mesh(cyl(0.02, 0.024, 0.62, 5), mat(0x4a3f2e))
      linstock.position.set(0.66, 1.5, 0.22)
      linstock.rotation.z = 0.6
      gunner.add(linstock)
      const emberTip = mesh(sph(0.035, 6), mat(C.ember, { emissive: 0xff6a1e }))
      emberTip.position.set(0.92, 1.68, 0.22)
      gunner.add(emberTip)
      gunner.position.set(-0.55, 0, 0.5)
      gunner.rotation.y = -0.7
      gunner.scale.setScalar(0.95)
      turret.add(gunner)
      idle.push({ node: gunner, phase: 1.1 })
      break
    }
    case 'orb': {
      const rig = chongtong(level)
      turret.add(rig.group)
      model.userData.muzzle = rig.muzzle
      recoil.push({ node: rig.slide, back: -0.22, rest: 0 })
      const gunner = new THREE.Group()
      gunner.add(soldier(body, accent))
      gunner.add(arm(body, 0.44, 0.35, 1))
      const linstock = mesh(cyl(0.02, 0.024, 0.7, 5), mat(0x4a3f2e))
      linstock.position.set(0.72, 1.38, 0.22)
      linstock.rotation.z = 0.35
      gunner.add(linstock)
      const emberTip = mesh(sph(0.035, 6), mat(C.ember, { emissive: 0xff6a1e }))
      emberTip.position.set(1.05, 1.5, 0.22)
      gunner.add(emberTip)
      gunner.position.set(-0.62, 0, 0.62)
      gunner.rotation.y = -0.8
      gunner.scale.setScalar(0.95)
      turret.add(gunner)
      idle.push({ node: gunner, phase: 0.6 })
      break
    }
    case 'cannon': {
      const rig = hwacha(level)
      turret.add(rig.group)
      model.userData.muzzle = rig.muzzle
      recoil.push({ node: rig.slide, back: -0.2, rest: 0.05 })
      const gunner = new THREE.Group()
      gunner.add(soldier(body, accent))
      gunner.add(arm(body, 0.4, 0.1, 1))
      gunner.add(arm(body, 0.4, 0.1, -1))
      gunner.position.set(-0.95, 0, 0.1)
      gunner.rotation.y = 0.1
      gunner.scale.setScalar(0.95)
      turret.add(gunner)
      idle.push({ node: gunner, phase: 2.4 })
      break
    }
    case 'banner': {
      const rig = bannerRig(level, accent)
      turret.add(rig.group)
      model.userData.flag = rig.flag
      for (let i = 0; i < level; i++) {
        const drummer = new THREE.Group()
        drummer.add(soldier(body, accent))
        drummer.add(arm(body, 0.4, 0.45, 1))
        drummer.add(arm(body, 0.4, 0.2, -1))
        // 북채 — 두 손에 하나씩.
        for (const side of [-1, 1]) {
          const stick = mesh(cyl(0.018, 0.022, 0.34, 5), mat(0xc9b48a))
          stick.position.set(0.42, 1.4 + side * 0.05, side * 0.2)
          stick.rotation.z = 0.5
          drummer.add(stick)
        }
        drummer.position.set(-0.2, 0, 0.46 - i * 0.5)
        drummer.rotation.y = 2.1
        drummer.scale.setScalar(0.95)
        turret.add(drummer)
        idle.push({ node: drummer, phase: i * 1.7 })
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
