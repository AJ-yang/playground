import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * next build --output export 결과를 GitHub Pages가 그대로 서빙할 수 있게 다듬는다.
 *
 * 1. `.nojekyll` 생성 — 없으면 Jekyll이 밑줄로 시작하는 경로를 무시해서 `_next/`의
 *    JS·CSS가 전부 404가 되고 사이트가 통째로 죽는다.
 * 2. `opengraph-image` → `opengraph-image.png` — GitHub Pages는 확장자로 Content-Type을
 *    정한다. 확장자가 없으면 octet-stream으로 나가서 카카오톡·페이스북 크롤러가
 *    이미지로 인식하지 않고 공유 미리보기가 깨진다. HTML의 참조도 같이 고친다.
 * 3. basePath가 빠진 절대 경로가 없는지 확인 — 있으면 배포된 자리에서 404다.
 */

const OUT = 'out'
const BASE = process.env.PAGES_BASE_PATH ?? ''

/**
 * `src="/tmdb.svg"`처럼 basePath 없이 최상단을 가리키는 참조를 찾아낸다.
 *
 * Next가 알아서 붙여 주는 것은 `<Link>`와 `next/image`, 메타데이터뿐이다.
 * 손으로 쓴 `<img src="/...">`에는 안 붙어서 배포하면 조용히 404가 된다.
 * 실제로 TMDB 고지 로고가 그렇게 깨진 채로 있었고, 이미지는 안 떠도 페이지가
 * 죽지 않아서 아무도 몰랐다. 빌드에서 떨어뜨린다.
 */
function checkAbsolutePaths(files: string[]) {
  if (BASE === '') return

  const offenders: string[] = []
  for (const path of files) {
    if (!path.endsWith('.html')) continue
    const html = readFileSync(path, 'utf8')
    for (const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      const url = match[1]
      if (url.startsWith(`${BASE}/`) || url === BASE) continue
      offenders.push(`${path}: ${url}`)
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `basePath(${BASE})가 빠진 절대 경로가 있다 — 배포하면 404다:\n  ${offenders.join('\n  ')}`,
    )
  }
}

function walk(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else found.push(path)
  }
  return found
}

function main() {
  const files = walk(OUT)

  writeFileSync(join(OUT, '.nojekyll'), '')

  let renamed = 0
  for (const path of files) {
    if (path.endsWith('/opengraph-image')) {
      renameSync(path, `${path}.png`)
      renamed++
    }
  }

  let patched = 0
  for (const path of files) {
    if (!path.endsWith('.html') && !path.endsWith('.txt')) continue
    const before = readFileSync(path, 'utf8')
    const after = before.replaceAll('/opengraph-image?', '/opengraph-image.png?')
    if (after !== before) {
      writeFileSync(path, after)
      patched++
    }
  }

  console.log(`.nojekyll 생성, OG 이미지 ${renamed}개 확장자 부여, 참조 ${patched}개 파일 수정`)

  const leftover = walk(OUT).filter((p) => p.endsWith('/opengraph-image'))
  if (leftover.length > 0) throw new Error(`확장자 없는 OG 이미지가 남았다: ${leftover.join(', ')}`)

  checkAbsolutePaths(walk(OUT))
}

main()
