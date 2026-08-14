import Link from 'next/link'
import { Perforations, ProjectorBeam, VELVET, VELVET_LINE, VELVET_SOFT, VELVET_TEXT } from '@/components/common/cinema'

/**
 * 첫 화면.
 *
 * 이름을 먼저 설명한다. "결"은 서비스 이름이자 결과물의 단위인데, 아무 설명
 * 없이 "당신의 결"이라고 하면 무슨 말인지 알 수 없다. 다만 길게 쓰지 않는다 —
 * 여기서 할 일은 읽히는 것이 아니라 시작하게 하는 것이다.
 *
 * 라운드 안내와 같은 극장 언어를 쓴다(components/cinema.tsx). 여기만 흰 버튼에
 * 검은 배경이면 다음 화면으로 넘어갈 때 톤이 튄다.
 *
 * 다만 입장권 모양은 쓰지 않는다. 티켓은 "이제 들어간다"는 뜻이라 라운드
 * 안내에 두고, 여기는 그 앞의 포스터 자리다. 필름 가장자리만 빌린다.
 */
export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <ProjectorBeam />

      <h1 className="text-4xl font-black leading-tight sm:text-5xl">
        당신은 어떤 이야기에
        <br />
        끌리는가
      </h1>
      <p className="mt-5 break-keep leading-relaxed text-neutral-400">
        재미있게 본 영화와 드라마를 고르면
        <br />
        당신의 이야기 취향에 이름을 붙여드립니다.
      </p>

      <section className="mt-9 w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#121013] text-left shadow-2xl shadow-black/60">
        <Perforations className="h-6 w-full border-b border-white/5" />
        <div className="px-6 py-6">
          <span
            className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ backgroundColor: VELVET_SOFT, color: VELVET_TEXT }}
          >
            왜 &lsquo;결&rsquo;인가요?
          </span>
          <p className="mt-3.5 break-keep text-sm leading-relaxed text-neutral-300">
            나뭇결처럼, 겉으로 잘 드러나지 않아도 안에서 일정하게 흐르는 방향을 결이라고
            합니다. 어떤 이야기에 자꾸 끌리는지에도 그런 방향이 있습니다.
          </p>
          <p
            className="mt-4 break-keep border-l-2 pl-3.5 text-xs leading-relaxed text-neutral-400"
            style={{ borderColor: VELVET_LINE }}
          >
            장르로는 잡히지 않는 그 방향에 이름을 붙입니다. 25개의 결 중 하나가 나와요.
          </p>
        </div>
      </section>

      {/* Link는 button이 아니라 VelvetButton을 못 쓴다. 색과 형태만 맞춘다. */}
      <Link
        href="/pick/"
        className="mt-8 w-full max-w-sm rounded-full px-8 py-4 text-lg font-bold text-white transition hover:brightness-110 active:scale-[0.99]"
        style={{ backgroundColor: VELVET }}
      >
        시작하기
      </Link>

      <p className="mt-4 text-xs text-neutral-600">약 1분 소요 · 로그인 없음</p>

      {/*
        해보기 전에 무엇이 나오는지 보고 싶은 사람이 있다. 시작 버튼과 경쟁하지
        않도록 작게 두되, 없으면 25개가 있다는 것 자체를 모르고 나간다.
      */}
      <Link href="/gyeols/" className="mt-6 text-sm text-neutral-400 underline">
        25개 결 먼저 둘러보기
      </Link>
    </main>
  )
}
