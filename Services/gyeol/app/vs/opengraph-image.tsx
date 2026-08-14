import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SITE_LABEL } from '@/lib/gyeol/site'

/**
 * 궁합 링크의 미리보기.
 *
 * 초대장이 카카오톡에 붙었을 때 한 줄짜리 링크로 쪼그라들지 않게 한다. 결
 * 페이지와 달리 여기서는 **결 이름을 쓸 수 없다** — 링크를 받은 사람의 결은
 * 아직 없고, 보낸 사람의 결을 크게 박으면 자기 결과인 줄 알고 연다.
 *
 * 결과 페이지와 같은 이유로 한글 폰트를 직접 넘긴다(`app/r/[gyeol]/`의 주석
 * 참고). 이모지도 같은 이유로 넣지 않는다.
 */
/**
 * 미리보기 이미지는 라우트 핸들러로 컴파일된다. 결별 이미지와 달리 여기는
 * `generateStaticParams`가 없어서 — 궁합은 결 조합이 아니라 주소에 담긴 두
 * 선택으로 정해지므로 미리 구울 목록이 없다 — 정적이라는 것을 직접 밝혀야
 * `output: 'export'`가 이 경로를 내보낸다.
 */
export const dynamic = 'force-static'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const fonts = join(process.cwd(), 'assets/fonts')
  const [bold, regular] = await Promise.all([
    readFile(join(fonts, 'Pretendard-Bold.otf')),
    readFile(join(fonts, 'Pretendard-Regular.otf')),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 90px',
          textAlign: 'center',
          // 두 사람의 화면이라 한쪽 색으로 칠하지 않는다. 커튼색에서 시작해
          // 반대편으로 넘어가는 것으로 "둘"을 나타낸다.
          backgroundImage: 'linear-gradient(115deg, #3B1013, #120E1E)',
          fontFamily: 'Pretendard',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.55)' }}>
          친구가 결과를 보냈어요
        </div>
        <div
          style={{ display: 'flex', fontSize: 84, fontWeight: 700, color: '#ffffff', marginTop: 18 }}
        >
          우리 취향은 얼마나 닿아 있을까
        </div>
        <div style={{ display: 'flex', fontSize: 38, color: '#EF5A63', marginTop: 24 }}>
          내 결을 더하면 둘의 궁합이 나옵니다
        </div>
        <div
          style={{ display: 'flex', fontSize: 28, color: 'rgba(255,255,255,0.5)', marginTop: 56 }}
        >
          {SITE_LABEL}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Pretendard', data: bold, style: 'normal', weight: 700 },
        { name: 'Pretendard', data: regular, style: 'normal', weight: 400 },
      ],
    },
  )
}
