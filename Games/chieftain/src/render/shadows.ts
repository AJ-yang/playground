import * as THREE from 'three'

/**
 * 그림자를 켤 메시를 골라 준다.
 *
 * 기준은 **재질**이다 — `MeshStandardMaterial`은 빛을 받는 실체(몸·나무·성),
 * `MeshBasicMaterial`은 규칙을 그리는 표식(반경 링·안개 판·체력바·불꽃·시신)이다.
 * 이 경계가 이미 코드 전체에 그어져 있으므로, 여기서 재질만 보고 갈라도
 * 표식에 그림자가 지는 일이 없다. 목록을 손으로 유지하는 것보다 안 틀린다.
 *
 * 그림자를 안 받아야 할 실체가 생기면 `userData.noShadow = true`를 달면 된다.
 */
export function castShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return
    const m = o as THREE.Mesh
    if (m.userData.noShadow) return
    const mat = m.material
    const lit = Array.isArray(mat)
      ? mat.some((x) => (x as THREE.MeshStandardMaterial).isMeshStandardMaterial)
      : (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial
    if (!lit) return
    m.castShadow = true
    m.receiveShadow = true
  })
}
