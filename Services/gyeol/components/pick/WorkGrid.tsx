// components/WorkGrid.tsx
'use client'

import { WorkTile } from './WorkTile'
import { workKey, type CatalogEntry } from '@/lib/gyeol/types'

export function WorkGrid({
  works,
  selected,
  onToggle,
}: {
  works: CatalogEntry[]
  selected: ReadonlySet<string>
  onToggle: (work: CatalogEntry) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {works.map((work) => (
        <WorkTile
          key={workKey(work)}
          work={work}
          selected={selected.has(workKey(work))}
          onToggle={() => onToggle(work)}
        />
      ))}
    </div>
  )
}
