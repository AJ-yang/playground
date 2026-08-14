import type { CatalogEntry, Gyeol } from '@/lib/gyeol/types'

function tone(hue: number, lightness: number, alpha = 1): string {
  return `hsla(${hue}, 72%, ${lightness}%, ${alpha})`
}

/**
 * 판정을 가른 한 편.
 *
 * 결과 화면에서 가장 개인적인 자리다. 결 이름은 25명이 나눠 갖지만 "「올드보이」
 * 하나가 당신을 이 결로 만들었다"는 그 사람의 선택에서만 나온다. 결이 남의
 * 이야기처럼 읽히는 것을 막는 것이 이 칸의 역할이다.
 *
 * 가른 한 편이 없을 수도 있다. 그때는 칸을 비우지 않고 그 사실을 말한다 —
 * 어느 것을 빼도 결과가 같다는 것은 취향이 흐리다는 뜻이 아니라 고른 전부가
 * 한 방향이었다는 뜻이고, 그쪽이 오히려 강한 결과다.
 */
export function DecisivePick({
  decisive,
  gyeol,
  onOpen,
}: {
  decisive: { work: CatalogEntry; without: Gyeol } | null
  gyeol: Gyeol
  onOpen: (work: CatalogEntry) => void
}) {
  if (decisive === null) {
    return (
      <section
        className="rounded-2xl border p-5 text-center"
        style={{ borderColor: tone(gyeol.hue, 60, 0.25), backgroundColor: tone(gyeol.hue, 40, 0.07) }}
      >
        <h2 className="text-sm font-bold" style={{ color: tone(gyeol.hue, 72) }}>
          결정적인 한 편이 없어요
        </h2>
        <p className="mt-2 break-keep text-sm leading-relaxed text-neutral-300">
          어느 한 편을 빼도 결과는 <b className="font-bold text-white">{gyeol.name}</b>입니다. 고른
          작품 전부가 같은 방향을 가리키고 있어요.
        </p>
      </section>
    )
  }

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ borderColor: tone(gyeol.hue, 60, 0.25), backgroundColor: tone(gyeol.hue, 40, 0.07) }}
    >
      <h2 className="text-sm font-bold" style={{ color: tone(gyeol.hue, 72) }}>
        이 한 편이 갈랐어요
      </h2>

      <div className="mt-3 flex items-center gap-4">
        <button
          onClick={() => onOpen(decisive.work)}
          title={decisive.work.t}
          aria-label={`${decisive.work.t} 정보 보기`}
          className="w-20 shrink-0 overflow-hidden rounded-md transition hover:opacity-80 focus:ring-2 focus:ring-white/60 focus:outline-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://image.tmdb.org/t/p/w185/${decisive.work.p}`}
            alt={decisive.work.t}
            className="aspect-[2/3] w-full bg-neutral-800 object-cover"
          />
        </button>

        <p className="break-keep leading-relaxed text-neutral-300">
          <b className="font-bold text-white">「{decisive.work.t}」</b> 하나가 당신을{' '}
          <b className="font-bold text-white">{gyeol.name}</b>로 만들었어요. 이걸 빼면{' '}
          <b className="font-bold" style={{ color: tone(decisive.without.hue, 72) }}>
            {decisive.without.name}
          </b>
          이 됩니다.
        </p>
      </div>
    </section>
  )
}
