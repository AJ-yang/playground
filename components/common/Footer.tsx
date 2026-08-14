export function Footer() {
  return (
    <footer className="mx-auto flex max-w-2xl flex-col items-center gap-2 px-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tmdb.svg" alt="The Movie Database" className="h-4 opacity-60" />
      <p className="text-xs leading-relaxed text-neutral-500">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  )
}
