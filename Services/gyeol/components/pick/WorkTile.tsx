// components/WorkTile.tsx
'use client'

import { useState } from 'react'
import type { CatalogEntry } from '@/lib/gyeol/types'

/**
 * 선택은 토글이다. 안 본 작품은 그냥 안 고르면 되므로 "몰라요" 같은 장치가
 * 필요 없다 (PRD 3절).
 */
export function WorkTile({
  work,
  selected,
  onToggle,
}: {
  work: CatalogEntry
  selected: boolean
  onToggle: () => void
}) {
  const [failed, setFailed] = useState(false)

  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-neutral-800 text-left transition ${
        selected ? 'ring-4 ring-white' : 'ring-0 hover:ring-2 hover:ring-white/50'
      }`}
    >
      {failed ? (
        <span className="flex h-full w-full items-center justify-center break-keep p-2 text-center text-xs font-bold text-white">
          {work.t}
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`https://image.tmdb.org/t/p/w342/${work.p}`}
          alt={work.t}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition ${selected ? '' : 'opacity-70'}`}
        />
      )}
      {selected && (
        <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-black">
          ✓
        </span>
      )}
    </button>
  )
}
