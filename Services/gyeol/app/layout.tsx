import type { Metadata } from 'next'
import { Analytics } from '@/components/common/Analytics'
import { Footer } from '@/components/common/Footer'
import './globals.css'

export const metadata: Metadata = {
  // og:image는 절대 URL이어야 카카오톡·인스타 크롤러가 읽는다.
  // 없으면 localhost로 박혀 공유 미리보기가 통째로 깨진다.
  metadataBase: new URL(process.env.PAGES_SITE_URL ?? 'http://localhost:3100'),
  title: '결 — 당신은 어떤 이야기에 끌리는가',
  description: '재미있게 본 작품을 고르면 당신의 이야기 취향에 이름을 붙여드립니다',
  openGraph: {
    title: '결 — 당신은 어떤 이야기에 끌리는가',
    description: '재미있게 본 작품을 고르면 당신의 이야기 취향에 이름을 붙여드립니다',
    type: 'website',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-neutral-950 text-white">
        <div className="flex-1">{children}</div>
        <Footer />
        <Analytics />
      </body>
    </html>
  )
}
