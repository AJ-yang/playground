# Services

| 프로젝트 | 무엇 | 상태 |
| --- | --- | --- |
| [`gyeol/`](gyeol/) | **결(gyeol)** — 재미있게 본 영화·드라마를 고르면 이야기 취향에 이름을 붙여주는 서비스 | [배포됨](https://aj-yang.github.io/playground/gyeol/) |

## 결의 배포

소스도 배포도 이 저장소가 맡는다. `main`에 푸시되면 `deploy.yml`이 결을 굽고
`/playground/gyeol/`에 올린다.

```bash
cd Services/gyeol
npm install
npm run dev          # http://localhost:3000
npm test             # 159건
npm run build:pages  # 배포와 같은 빌드 — out/에 정적 파일이 나온다
```

**주소가 빌드 시점에 박힌다.** 결은 Next.js 정적 내보내기(`output: 'export'`)라
`basePath`가 HTML·JS 안에 문자열로 들어간다. 그래서 조선 방어전처럼 `dist`를
그대로 옮기면 되는 게 아니라, 배포 경로를 넣어서 다시 구워야 한다. 그 경로는
`package.json`의 `build:pages`에 적혀 있다.

```
PAGES_BASE_PATH=/playground/gyeol
PAGES_SITE_URL=https://aj-yang.github.io/playground/gyeol
```

앞의 것은 페이지가 받아 올 자기 자산의 경로, 뒤의 것은 공유 미리보기
(`og:image`)에 박히는 절대 주소다. 주소를 옮기려면 이 둘과 `deploy.yml`의 조립
경로를 같이 바꿔야 한다.

## `public/catalog.json`은 커밋되어 있다

12,595편짜리 색인이고 생성물이지만, 만들려면 TMDB API 키로
`npm run build:data`를 돌려야 한다. CI 러너에는 그 키가 없으므로 커밋하지
않으면 배포 자체가 불가능하다. 커밋해 둔 덕에 따라오는 것이 둘 더 있다 —
클론만으로 빌드가 되고, `lib/gyeol/catalog.test.ts`의 색인 검증 11건이 CI에서
실제로 돈다(파일이 없으면 통째로 skip된다).

작품을 갱신하려면 키를 가진 사람이 `npm run build:data`를 돌리고 바뀐
`public/catalog.json`을 커밋한다. 원본 덤프(`data/*.raw.json`)는 여전히
추적하지 않는다 — 색인만 있으면 되고 원본은 크다.

## 옛 주소

결은 예전에 `aj-yang.github.io/gyeol`에서 서빙됐다. 배포가 이리로 오면서
주소가 `aj-yang.github.io/playground/gyeol`로 바뀌었다. 결은 결과 공유와
궁합(`/vs/`)이 핵심이라 그동안 뿌려진 링크가 옛 주소를 가리키고 있다 —
원본 저장소(`AJ-yang/gyeol`)의 `gh-pages`를 어떻게 할지는 별도 작업이다.

## 프로젝트를 추가할 때

저장소 루트 [`README.md`](../README.md)의 「배포」 절을 그대로 따른다. 정적
페이지로 내보낼 것이라면:

1. `Services/<이름>/` 아래에 프로젝트를 넣는다
2. `.github/workflows/deploy.yml`의 「배포 트리 조립」 단계에 한 줄을 더한다
3. `site/index.html`에 카드를 하나 붙인다
4. 위 표와 루트 `README.md`의 표에 한 줄씩 더한다

주소는 저장소 구조를 그대로 따라가므로 `Services/foo/dist`는
`/playground/foo/`가 된다.
