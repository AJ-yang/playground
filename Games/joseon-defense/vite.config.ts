import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * 페이지가 둘이다 — 2D 지휘관 시점(`index.html`)과 3D 1인칭 전장(`fps.html`).
 *
 * 한 페이지에 두 렌더러를 다 싣고 키 하나로 전환하는 방법도 있었지만,
 * three.js는 무겁다. 2D만 하러 온 사람에게까지 3D 번들을 내려받게 할 이유가
 * 없어서 진입점을 갈랐다. 두 페이지는 같은 `Game`과 같은 진행도(localStorage)를
 * 공유하므로, 오가며 플레이해도 해금과 기록은 하나로 이어진다.
 */
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        fps: fileURLToPath(new URL('./fps.html', import.meta.url)),
      },
    },
  },
})
