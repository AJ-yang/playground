/**
 * 구워 둔 배경 이미지를 실제로 디코드해 주는 얇은 층.
 *
 * `backdropAssets.ts` 는 `data:` URI 문자열만 들고 있다. 캔버스에 그리려면
 * `HTMLImageElement` 로 만들어야 하는데, 이건 브라우저에서만 되는 일이다.
 * 헤드리스 시뮬레이터(`npm run sim`)는 DOM 없이 도는 같은 소스를 쓰므로
 * `Image` 가 없는 환경에서도 조용히 아무것도 안 하고 넘어가야 한다.
 *
 * 디코드는 비동기다. 그래서 "있다/없다"를 두 단계로 나눠 묻는다.
 *
 *   - `hasBackdropPhotos()` — 자산이 **존재하는지**. 동기, 첫 프레임부터 참.
 *   - `backdropMapImage()`  — 지금 **그릴 수 있는지**. 디코드 전에는 null.
 *
 * 타이틀은 앞의 것으로 벡터 지도로 되돌아갈지를 정하고, 뒤의 것으로 이번
 * 프레임에 뭘 그릴지를 정한다. 이렇게 나눠야 디코드가 끝나는 순간 벡터
 * 지도가 사진 지도로 튀는 깜빡임이 생기지 않는다.
 */

import { BACKDROP_MAP, BACKDROP_PLATES, type BackdropImage } from './backdropAssets'

export interface LoadedPlate {
  id: string
  motif: string
  img: HTMLImageElement
}

let started = false
let mapEl: HTMLImageElement | null = null
const plateEls: LoadedPlate[] = []

function decode(data: string): HTMLImageElement {
  const el = new Image()
  el.decoding = 'async'
  el.src = data
  return el
}

function ready(el: HTMLImageElement | null): boolean {
  return !!el && el.complete && el.naturalWidth > 0
}

/** 디코드를 시작한다. 여러 번 불러도 한 번만 돈다. */
export function initBackdropImages(): void {
  if (started || typeof Image === 'undefined') return
  started = true

  if (BACKDROP_MAP) mapEl = decode(BACKDROP_MAP.data)
  for (const plate of BACKDROP_PLATES as readonly BackdropImage[]) {
    plateEls.push({ id: plate.id, motif: plate.motif, img: decode(plate.data) })
  }
}

/** 구워 둔 사진이 하나라도 있는가. 디코드 여부와 무관한 동기 질문이다. */
export function hasBackdropPhotos(): boolean {
  return BACKDROP_MAP !== null || BACKDROP_PLATES.length > 0
}

/** 지도 스캔이 있는가. 없으면 그리는 쪽이 벡터 지도로 되돌아간다. */
export function hasBackdropMap(): boolean {
  return BACKDROP_MAP !== null
}

/** 이번 프레임에 그릴 수 있는 지도. 아직 디코드 중이면 null. */
export function backdropMapImage(): HTMLImageElement | null {
  return ready(mapEl) ? mapEl : null
}

/** 이번 프레임에 그릴 수 있는 유물 사진들. 먼저 준비된 것부터 나온다. */
export function backdropPlateImages(): readonly LoadedPlate[] {
  return plateEls.filter((plate) => ready(plate.img))
}
