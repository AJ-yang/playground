# Services

| 프로젝트 | 무엇 | 상태 |
| --- | --- | --- |
| [`gyeol/`](gyeol/) | **결(gyeol)** — 재미있게 본 영화·드라마를 고르면 이야기 취향에 이름을 붙여주는 서비스 | [배포됨](https://aj-yang.github.io/gyeol/) · **자체 저장소에서 배포** |

## 결은 아직 이 저장소에서 배포되지 않는다

소스는 여기 있지만 **배포는 원본 저장소(`AJ-yang/gyeol`)의 `gh-pages` 브랜치가
계속 맡는다.** 주소도 `aj-yang.github.io/gyeol` 그대로다. 옮기지 않은 이유가
셋이다.

1. **빌드에 필요한 데이터가 저장소에 없다.** `public/catalog.json`과
   `public/recommendations.json`은 `.gitignore` 대상이다 — TMDB API 키로
   파이프라인(`npm run build:data`)을 돌려야 생기는 12,595편짜리 색인이라
   커밋하지 않는다. 이 저장소의 CI에는 그 키가 없다.
2. **주소가 바뀌면 이미 뿌린 링크가 죽는다.** 결의 핵심 기능이 결과 공유와
   궁합(`/vs/`)이라 URL이 곧 제품이다. `/gyeol` → `/playground/gyeol`로 옮기면
   그동안 공유된 링크가 전부 깨진다.
3. **배포 방식이 다르다.** 결은 `out/`을 `gh-pages`로 강제 푸시하고, 이
   저장소는 `upload-pages-artifact`로 트리를 조립한다. `basePath`도 빌드 때
   `/gyeol`로 박힌다.

옮기려면 TMDB 키를 저장소 시크릿으로 넣고, 카탈로그 파이프라인을 CI에서 돌리고,
`basePath`를 바꾸고, 옛 주소에 리다이렉트를 남겨야 한다. 배선 한 줄로 되는 일이
아니라 별도 작업으로 둔다.

## 프로젝트를 추가할 때

저장소 루트 [`README.md`](../README.md)의 「배포」 절을 그대로 따른다. 정적
페이지로 내보낼 것이라면:

1. `Services/<이름>/` 아래에 프로젝트를 넣는다
2. `.github/workflows/deploy.yml`의 「배포 트리 조립」 단계에 한 줄을 더한다
3. `site/index.html`에 카드를 하나 붙인다
4. 위 표와 루트 `README.md`의 표에 한 줄씩 더한다

주소는 저장소 구조를 그대로 따라가므로 `Services/foo/dist`는
`/playground/foo/`가 된다.
