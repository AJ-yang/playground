import { Suspense } from 'react'
import type { Metadata } from 'next'
import { MatchUpView } from '@/components/vs/MatchUpView'

/**
 * 두 사람의 궁합.
 *
 * 결과 페이지(`/r/<결 id>/`)와 달리 결마다 구울 수 없다. 조합이 25×25이기도
 * 하고, 어차피 본문의 근거는 주소에 담긴 두 선택이라 미리 만들 것이 없다.
 *
 * 그래서 미리보기 문구도 하나뿐이다 — 링크를 받은 사람은 아직 결과를 안 본
 * 상태이므로, 결 이름 대신 "열어보면 뭐가 나오는지"를 말한다.
 */
export const metadata: Metadata = {
  title: '궁합 — 우리 취향은 얼마나 닿아 있을까',
  description: '친구가 보낸 결과에 내 결을 더하면 둘의 궁합이 나옵니다',
  openGraph: {
    title: '궁합 — 우리 취향은 얼마나 닿아 있을까',
    description: '친구가 보낸 결과에 내 결을 더하면 둘의 궁합이 나옵니다',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
}

export default function MatchUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-4 py-12">
      {/* MatchUpView가 useSearchParams를 쓰므로 Suspense 경계가 필요하다. */}
      <Suspense fallback={<p className="py-20 text-center text-neutral-500">불러오는 중…</p>}>
        <MatchUpView />
      </Suspense>
    </main>
  )
}
