import Link from 'next/link'
import type { Metadata } from 'next'
import { Perforations, VELVET, VELVET_LINE, VELVET_SOFT, VELVET_TEXT } from '@/components/common/cinema'
import { GYEOL_TYPES } from '@/data/gyeol-types'

/**
 * 결 도감.
 *
 * 결 소개 페이지(`/r/<결 id>/`)는 25개가 이미 구워져 있는데 그것들을 묶는
 * 자리가 없었다. 그래서 친구에게 카드를 받은 사람이 "다른 건 뭐가 있지"라고
 * 생각해도 갈 데가 없고, 검색 엔진도 각 결에 닿을 길이 링크뿐이었다.
 *
 * 이 페이지가 하는 일은 두 가지다. 하나는 **탐색** — 남의 결을 구경하다
 * 자기 것을 해보게 만든다. 다른 하나는 **유입** — 결 이름이나 문구로 검색해
 * 들어올 문이 25개 생긴다.
 *
 * 순위나 희귀도는 매기지 않는다. 25개는 서로 다른 것이지 좋고 나쁜 것이
 * 아니고, 순서를 붙이는 순간 사람들이 "좋은 결"을 받으려고 고르기 시작한다.
 */
export const metadata: Metadata = {
  title: '결 도감 — 25개의 이야기 취향',
  description: '장르로는 잡히지 않는 25가지 이야기 취향. 당신은 어느 결인가요?',
  openGraph: {
    title: '결 도감 — 25개의 이야기 취향',
    description: '장르로는 잡히지 않는 25가지 이야기 취향. 당신은 어느 결인가요?',
    type: 'website',
  },
}

function tone(hue: number, lightness: number, alpha = 1): string {
  return `hsla(${hue}, 72%, ${lightness}%, ${alpha})`
}

export default function GyeolIndexPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-9 px-4 py-12">
      <header className="text-center">
        <span
          className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ backgroundColor: VELVET_SOFT, color: VELVET_TEXT }}
        >
          결 도감
        </span>
        <h1 className="mt-3.5 text-3xl font-black break-keep sm:text-4xl">25개의 결</h1>
        <p className="mx-auto mt-4 max-w-md break-keep leading-relaxed text-neutral-400">
          나뭇결처럼, 겉으로 잘 드러나지 않아도 안에서 일정하게 흐르는 방향을 결이라고 합니다.
          장르로는 잡히지 않는 그 방향에 이름을 붙였어요.
        </p>
      </header>

      {/*
        두 칸으로 둔다. 한 칸이면 25개를 내리느라 스크롤이 길고, 세 칸이면
        모바일에서 결 이름이 두세 줄로 접힌다.
      */}
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {GYEOL_TYPES.map((gyeol) => (
          <li key={gyeol.id}>
            <Link
              href={`/r/${gyeol.id}/`}
              className="flex h-full items-start gap-3.5 rounded-2xl border p-4 transition hover:brightness-125"
              style={{
                borderColor: tone(gyeol.hue, 60, 0.28),
                backgroundColor: tone(gyeol.hue, 40, 0.08),
              }}
            >
              <span className="shrink-0 text-3xl" aria-hidden>
                {gyeol.emoji}
              </span>
              <span className="min-w-0">
                <span className="block break-keep font-bold">{gyeol.name}</span>
                <span
                  className="mt-1 block break-keep text-sm"
                  style={{ color: tone(gyeol.hue, 76) }}
                >
                  &ldquo;{gyeol.catchphrase}&rdquo;
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121013] text-center shadow-2xl shadow-black/60">
        <Perforations className="h-6 w-full border-b border-white/5" />
        <div className="px-6 py-7">
          <p className="break-keep leading-relaxed text-neutral-300">
            재미있게 본 작품을 고르면 이 중 하나가 나와요.
          </p>
          <Link
            href="/pick/"
            className="mt-5 inline-block rounded-full px-8 py-3.5 font-bold text-white transition hover:brightness-110"
            style={{ backgroundColor: VELVET }}
          >
            내 결 찾으러 가기
          </Link>
          <p className="mt-3 text-xs text-neutral-600">약 1분 소요 · 로그인 없음</p>
        </div>
        <Perforations className="h-6 w-full border-t border-white/5" />
      </section>

      <p
        className="mx-auto max-w-md break-keep border-l-2 pl-3.5 text-xs leading-relaxed text-neutral-500"
        style={{ borderColor: VELVET_LINE }}
      >
        결에는 순위도 희귀도도 없어요. 25개는 서로 다른 것이지 좋고 나쁜 것이 아닙니다.
      </p>
    </main>
  )
}
