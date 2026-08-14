// app/result/page.tsx
import { Suspense } from 'react'
import { ResultView } from '@/components/result/ResultView'

/**
 * 결이 붙지 않은 결과 주소.
 *
 * 공유 링크는 이제 결별 경로(`/r/<결 id>/?p=`)를 쓴다. 이 경로는 **그 전에
 * 퍼진 링크를 살려두려고** 남긴다. 미리보기 문구를 결마다 다르게 주지는
 * 못하지만 본문은 똑같이 나온다.
 */
export default function ResultPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-4 py-12">
      {/* ResultView가 useSearchParams를 쓰므로 Suspense 경계가 필요하다. */}
      <Suspense fallback={<p className="py-20 text-center text-neutral-500">불러오는 중…</p>}>
        <ResultView />
      </Suspense>
    </main>
  )
}
