import type { NextConfig } from 'next'

/**
 * GitHub Pages는 정적 파일만 서빙하므로 서버 렌더 없이 전부 미리 만들어야 한다.
 * 결과 페이지는 16개 코드를 generateStaticParams로 뽑고, 선택 기록(?p=)은
 * 클라이언트가 URL에서 읽는다. 공유 미리보기에 필요한 og:image와 제목은
 * 코드만으로 정해지므로 정적 HTML에 그대로 박힌다.
 *
 * basePath는 배포 때만 켠다. 로컬 개발에서 켜면 주소가 /gyeol로 밀린다.
 */
const basePath = process.env.PAGES_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default nextConfig
