import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ResultView } from '@/components/result/ResultView'
import { GYEOL_TYPES } from '@/data/gyeol-types'

/**
 * 결마다 하나씩 미리 구워두는 결과 페이지.
 *
 * **공유 링크의 미리보기를 결마다 다르게 하려고 존재한다.** 정적 배포라
 * `?p=`로는 og 태그를 바꿀 수 없어서, 카카오톡에 링크를 붙이면 25명이 전부
 * 같은 제목·같은(없는) 썸네일을 봤다. 이미지 카드를 아무리 잘 만들어도 링크로
 * 공유하는 사람에게는 닿지 않는다.
 *
 * 본문은 `/result/`와 같은 컴포넌트다. 이 경로의 결 id는 **미리보기 문구를
 * 정하는 데만** 쓰고, 화면에 그리는 근거는 언제나 `?p=`에 담긴 선택이다.
 * 색인을 다시 만들어 판정이 달라지면 미리보기와 본문이 어긋날 수 있지만,
 * 그때 틀리는 쪽은 미리보기 한 줄뿐이다.
 */
export const dynamicParams = false

export function generateStaticParams() {
  return GYEOL_TYPES.map((gyeol) => ({ gyeol: gyeol.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gyeol: string }>
}): Promise<Metadata> {
  const { gyeol: id } = await params
  const gyeol = GYEOL_TYPES.find((g) => g.id === id)
  if (gyeol === undefined) return {}

  const title = `${gyeol.emoji} ${gyeol.name}`
  const description = `"${gyeol.catchphrase}" — ${gyeol.description}`

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function GyeolResultPage({
  params,
}: {
  params: Promise<{ gyeol: string }>
}) {
  const { gyeol: id } = await params
  if (!GYEOL_TYPES.some((g) => g.id === id)) notFound()

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-4 py-12">
      {/* ResultView가 useSearchParams를 쓰므로 Suspense 경계가 필요하다. */}
      <Suspense fallback={<p className="py-20 text-center text-neutral-500">불러오는 중…</p>}>
        <ResultView gyeolId={id} />
      </Suspense>
    </main>
  )
}
