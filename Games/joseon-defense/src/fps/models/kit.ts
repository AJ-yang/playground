import * as THREE from 'three'

/**
 * 절차적 모형을 세울 때 쓰는 공용 부품 창고.
 *
 * 재질과 지오메트리를 **모양·치수별로 한 번만** 만들어 돌려 쓴다. 적이 마흔
 * 마리에 기물이 스무 기면 개체마다 새로 만드는 순간 GPU 리소스가 수백 개로
 * 불어나고, 드로우콜 병합도 전부 깨진다. 클론(`Object3D.clone()`)은 재질과
 * 지오메트리를 **공유**하므로, 여기만 지키면 개체를 아무리 복제해도 자원은
 * 늘지 않는다.
 */

const materials = new Map<string, THREE.MeshLambertMaterial>()

export interface MatOptions {
  flat?: boolean
  emissive?: number
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
}

export function mat(color: number, opts: MatOptions = {}): THREE.MeshLambertMaterial {
  const key = `${color}:${opts.flat ? 1 : 0}:${opts.emissive ?? 0}:${opts.opacity ?? 1}:${opts.side ?? 0}`
  let m = materials.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      flatShading: opts.flat ?? false,
      emissive: opts.emissive ?? 0x000000,
      transparent: opts.transparent ?? (opts.opacity !== undefined && opts.opacity < 1),
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    })
    materials.set(key, m)
  }
  return m
}

const geometries = new Map<string, THREE.BufferGeometry>()

export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key)
  if (!g) {
    g = make()
    geometries.set(key, g)
  }
  return g as T
}

export const box = (w: number, h: number, d: number): THREE.BoxGeometry =>
  geo(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d))

export const cyl = (rt: number, rb: number, h: number, seg = 8): THREE.CylinderGeometry =>
  geo(`cyl:${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))

export const sph = (r: number, seg = 8): THREE.SphereGeometry =>
  geo(`sph:${r},${seg}`, () => new THREE.SphereGeometry(r, seg, seg))

export const cone = (r: number, h: number, seg = 8): THREE.ConeGeometry =>
  geo(`cone:${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg))

export function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const object = new THREE.Mesh(g, m)
  object.castShadow = true
  return object
}
