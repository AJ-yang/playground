import { defineConfig } from 'vite'

/**
 * 진입점이 하나다 — 부감과 1인칭이 **같은 씬, 같은 프레임** 위에서 카메라만
 * 갈아끼우는 구조이기 때문이다(GDD 3.2). 조선 방어전이 2D/3D 페이지를 가른
 * 것과는 사정이 다르다. 저기서는 3D가 곁가지라 번들을 나눌 이유가 있었지만,
 * 여기서는 강림이 곧 게임이라 나눌 수가 없다.
 */
export default defineConfig({
  base: './',
  server: { port: 5174, host: true },
  build: { target: 'es2022', outDir: 'dist' },
})
