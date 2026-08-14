import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { GYEOL_TYPES } from '@/data/gyeol-types'

/**
 * 결마다 하나씩 굽는 공유 미리보기 이미지.
 *
 * 카카오톡·페이스북은 og:image가 있어야 큰 카드로 보여준다. 없으면 링크가
 * 한 줄짜리로 쪼그라들어 눈에 안 띈다.
 *
 * **한글 폰트를 직접 넘겨야 한다.** Satori는 시스템 폰트를 쓰지 않고, next/og에
 * 번들된 것은 라틴 전용 Geist뿐이라 그대로 그리면 한글이 통째로 빈칸이 된다.
 * Pretendard(OFL)를 레포에 두고 빌드 때만 읽는다 — 클라이언트 번들에는 안 실린다.
 *
 * 이모지는 넣지 않는다. Satori가 이모지를 그리려면 빌드 중에 외부 CDN에서
 * 이미지를 받아와야 해서, 네트워크가 막히면 빌드가 조용히 깨진다. 제목줄에
 * 이모지가 이미 들어가므로 미리보기 전체로 보면 한 번은 보인다.
 */
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export function generateStaticParams() {
  return GYEOL_TYPES.map((gyeol) => ({ gyeol: gyeol.id }))
}

export default async function Image({ params }: { params: Promise<{ gyeol: string }> }) {
  const { gyeol: id } = await params
  const gyeol = GYEOL_TYPES.find((g) => g.id === id) ?? GYEOL_TYPES[0]

  const fonts = join(process.cwd(), 'assets/fonts')
  const [bold, regular] = await Promise.all([
    readFile(join(fonts, 'Pretendard-Bold.otf')),
    readFile(join(fonts, 'Pretendard-Regular.otf')),
  ])

  const tone = (lightness: number) => `hsl(${gyeol.hue}, 72%, ${lightness}%)`

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
          backgroundImage: `linear-gradient(160deg, ${tone(26)}, ${tone(8)})`,
          fontFamily: 'Pretendard',
        }}
      >
        {/*
          Satori는 자식이 둘 이상인 div에 명시적 display를 요구한다. 따옴표를
          JSX로 붙이면 텍스트 노드가 셋이 되어 빌드가 통째로 실패하므로,
          문자열을 미리 합쳐 자식 하나로 넘긴다.
        */}
        <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.55)' }}>
          당신이 자꾸 고르는 이야기
        </div>
        <div
          style={{ display: 'flex', fontSize: 92, fontWeight: 700, color: '#ffffff', marginTop: 18 }}
        >
          {gyeol.name}
        </div>
        <div style={{ display: 'flex', fontSize: 44, color: tone(78), marginTop: 22 }}>
          {`\u201C${gyeol.catchphrase}\u201D`}
        </div>
        <div
          style={{ display: 'flex', fontSize: 28, color: 'rgba(255,255,255,0.5)', marginTop: 56 }}
        >
          aj-yang.github.io/gyeol
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
