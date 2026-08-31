import * as THREE from 'three'
import { C, hex } from './palette'

/**
 * 하늘 — 세로 그라디언트 한 장.
 *
 * 전에는 `setClearColor` 단색이었다. 단색 배경은 지평선이 없어서, 부감에서는
 * 맵이 검은 종이 위에 놓인 것처럼 보이고 1인칭에서는 앞이 그냥 벽이 된다.
 * 깊이를 만드는 것은 지형이 아니라 **위아래로 변하는 밝기**다.
 *
 * 이걸 메시가 아니라 `scene.background`로 두는 이유는 두 가지다 — 안개가 안
 * 먹어서 지평선 색이 그대로 남고, 카메라 둘(부감·1인칭) 어느 쪽으로 봐도
 * 같은 하늘이 된다.
 */

const W = 1024
const H = 512

export function bakeSky(): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!

  // 위에서 아래로 — 천정, 중천, 지평선, 그리고 지평선 아래의 바다 반사.
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0.0, hex(C.skyZenith))
  grad.addColorStop(0.34, hex(C.skyMid))
  grad.addColorStop(0.5, hex(C.skyHorizon))
  grad.addColorStop(0.54, hex(C.skyUnder))
  grad.addColorStop(1.0, hex(C.deepWater))
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  // 해가 있는 쪽의 옅은 빛무리. 태양광 방향(World.buildLights)과 같은 자리다.
  // 이 얼룩 하나가 "빛이 어디서 오는가"를 배경만으로 말해 준다.
  //
  // **세 번 그린다.** 캔버스를 원통으로 말아 쓰는 텍스처라 오른쪽 끝과 왼쪽
  // 끝이 맞닿는데, 한 번만 그리면 캔버스 밖으로 나간 부분이 잘려서 그
  // 이음매에 세로줄이 생긴다. 1인칭으로 하늘을 보면 바로 보였다.
  for (const shift of [-W, 0, W]) {
    const cx = SUN_U * W + shift
    const cy = SUN_V * H
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.3)
    glow.addColorStop(0, 'rgba(255,238,206,0.5)')
    glow.addColorStop(0.45, 'rgba(255,226,180,0.15)')
    glow.addColorStop(1, 'rgba(255,226,180,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, W, H)
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * 태양 방향을 등장방형(equirectangular) 좌표로 옮긴 값.
 *
 * `SUN_DIR`을 정규화해서 u = atan2(z, x)/2π + ½, v = asin(y)/π + ½로 접고,
 * 캔버스는 위가 v=1이므로 뒤집어 둔다. 손으로 눈대중해도 티는 안 나지만,
 * 조명을 옮길 때 빛무리가 같이 따라오게 하려면 식으로 묶여 있어야 한다.
 */
export const SUN_DIR = new THREE.Vector3(-40, 70, 30).normalize()
const SUN_U = Math.atan2(SUN_DIR.z, SUN_DIR.x) / (Math.PI * 2) + 0.5
const SUN_V = 1 - (Math.asin(SUN_DIR.y) / Math.PI + 0.5)
