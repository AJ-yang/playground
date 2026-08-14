/**
 * `/tmdb.svg`처럼 앞이 슬래시로 시작하는 경로는 basePath가 붙지 않는다. 배포
 * 주소가 `/playground/gyeol/`이면 브라우저는 사이트 최상단에서 찾다가 404를
 * 받는다. `<img>`는 조용히 깨질 뿐이라 눈으로 안 보면 모른다 — TMDB 고지에
 * 들어가는 로고라 안 뜨면 안 된다.
 *
 * 데이터를 받아 오는 쪽(`use-catalog.ts` 등)이 하는 것과 같은 방식으로 붙인다.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-2xl flex-col items-center gap-2 px-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BASE}/tmdb.svg`} alt="The Movie Database" className="h-4 opacity-60" />
      <p className="text-xs leading-relaxed text-neutral-500">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  )
}
