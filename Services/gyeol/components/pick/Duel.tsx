'use client'

import { VELVET_TEXT } from '@/components/common/cinema'
import type { Duel as DuelData } from '@/lib/gyeol/duel'
import type { CatalogEntry } from '@/lib/gyeol/types'

/**
 * 두 편을 나란히 놓고 고르게 한다.
 *
 * 결 이름은 보여주지 않는다. "그때로 돌아가는 결"이라고 적어두면 작품이 아니라
 * 라벨을 보고 고르게 된다 — 1라운드에서 장르 머리말을 뗀 것과 같은 이유다.
 */
export function Duel({
  duel,
  round,
  total,
  onPick,
  onSkip,
}: {
  duel: DuelData
  round: number
  total: number
  onPick: (work: CatalogEntry) => void
  onSkip: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        {/*
          지금 몇 번째인지만 커튼색으로 짚는다. 포스터 두 장이 화면의 전부라
          테두리나 배경까지 물들이면 비교가 어려워진다.
        */}
        <p className="text-sm text-neutral-500">
          <span className="font-bold" style={{ color: VELVET_TEXT }}>
            {round}
          </span>{' '}
          / {total}
        </p>
        <p className="mt-1 break-keep text-lg font-bold">어느 쪽이 더 끌리나요?</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[duel.left, duel.right].map((side) => (
          <button
            key={side.gyeolId}
            onClick={() => onPick(side.work)}
            className="overflow-hidden rounded-2xl bg-neutral-900 text-left transition hover:ring-4 hover:ring-white/60 focus:outline-none focus:ring-4 focus:ring-white/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://image.tmdb.org/t/p/w342/${side.work.p}`}
              alt={side.work.t}
              className="aspect-[2/3] w-full object-cover"
            />
            <span className="block break-keep p-3 text-sm font-bold">{side.work.t}</span>
          </button>
        ))}
      </div>

      {/* 모르는 작품이거나 판단이 어려울 때 넘어갈 길. 없으면 아무거나 찍게 된다. */}
      <button
        onClick={onSkip}
        className="mx-auto rounded-full border border-neutral-700 px-6 py-2.5 text-sm text-neutral-400 transition hover:bg-neutral-900"
      >
        잘 모르겠어요
      </button>
    </div>
  )
}
