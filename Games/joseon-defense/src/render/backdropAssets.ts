/**
 * 타이틀 배경에 깔리는 실물 이미지. **생성 파일 — 직접 고치지 않는다.**
 *
 * `assets/backdrop/` 에 원본을 넣고 `python3 tools/bake-backdrop.py` 를
 * 실행하면 이 파일이 다시 만들어진다. 아티팩트 페이지가 외부 호스트를 전부
 * 막는 CSP 아래서 돌기 때문에 이미지는 번들 안에 `data:` URI로 들어간다.
 *
 * 비어 있으면 타이틀은 예전 벡터 지도로 자동으로 돌아간다.
 */

export interface BackdropImage {
  id: string
  /** 이 사진이 무엇의 실물인지 — 기물 id와 짝이 맞는다. */
  motif: string
  data: string
  w: number
  h: number
}

export const BACKDROP_MAP: { data: string; w: number; h: number } | null = null

export const BACKDROP_PLATES: readonly BackdropImage[] = [

]

/** 출처와 라이선스. CC-BY 원본을 쓴다면 화면 어딘가에 이 줄이 남아야 한다. */
export const BACKDROP_CREDITS: readonly string[] = [

]
