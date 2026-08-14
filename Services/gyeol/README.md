# 결 (gyeol)

재미있게 본 영화·드라마를 고르면 **당신의 이야기 취향에 이름을 붙여주는** 서비스.

**→ [aj-yang.github.io/playground/gyeol](https://aj-yang.github.io/playground/gyeol/)**

이 서비스가 파는 것은 추천 정확도가 아니다. 시청 이력을 가진 왓챠피디아·넷플릭스를 그것으로 이길 방법은 없다. 대신 취향을 **언어로** 만들어준다 — "액션 4.2점"이 아니라 "서늘한 복수의 결"이라고.

- **취향 정의** — 제품의 본체. 25개 결 중 하나로 판정한다
- **추천** — 그 정의가 맞다는 증거
- **공유** — 그 정의의 얼굴

결과에는 **판정을 가른 한 편**이 함께 나온다 — 고른 것을 하나씩 빼보고 결이 바뀌는 작품을 찾는다. 그리고 친구에게 링크를 보내면 **둘의 궁합**(`/vs/`)이 나온다. 둘 다 서버 없이 주소만으로 돈다.

공유 카드는 두 규격으로 만든다. 카카오톡은 4:5가, 인스타그램 스토리는 9:16이 크게 잡힌다. 25개 결은 [`/gyeols/`](https://aj-yang.github.io/playground/gyeol/gyeols/)에 모아 두었다.

## 구조

서버도 데이터베이스도 없다. Next.js 정적 익스포트를 GitHub Pages에 올리고, 카탈로그 색인(12,595편)을 브라우저가 받아 전부 클라이언트에서 계산한다. 선택 기록은 URL에 TMDB id로 담아 서버 없이 결과를 재현한다.

```
lib/gyeol/     매칭 엔진 (순수 함수, 전부 테스트됨)
data/          결 25종 정의
scripts/       TMDB 파이프라인
docs/superpowers/specs/   PRD와 결 정의 (정본)
```

## 데이터 만들기

`.env.local`에 `TMDB_API_KEY`가 필요하다.

```bash
npm run build:data   # 카탈로그 → 키워드 → 색인 → 추천. TMDB 호출 2만 건, 오래 걸린다
npm run dev
```

`public/recommendations.json`은 재생성 가능하므로 커밋하지 않는다. **`public/catalog.json`은 커밋한다** — 배포하는 CI 러너에는 TMDB 키가 없어서 이걸 만들 수 없다. 작품을 갱신하려면 키를 가진 사람이 `build:data`를 돌리고 바뀐 색인을 커밋한다.

## 계측

성공 기준은 공유율과 완주율이다(PRD 1절). 그 두 비율을 만들 수 있을 만큼만 잰다.

```
완주율 = result    / start(mode=solo)
         vs_result / start(mode=vs)
공유율 = (share_card + share_vs) / result
```

완주율은 `mode`로 갈라서 본다. 친구 링크를 타고 온 사람은 다 고르고 나면 자기 결과가 아니라 궁합 화면으로 가므로 `result`를 내지 않는다 — 나누지 않고 계산하면 완주율이 그만큼 낮게 나온다.

사람을 식별하지 않는다. 로그인도 저장소도 없는 제품이라 여기서 개인을 따라다니면 앞뒤가 안 맞는다. 보내는 것은 위 사건의 발생과, 비율을 읽는 데 필요한 몇 개의 수뿐이다.

`.env.local`의 `NEXT_PUBLIC_GA_ID`가 비어 있으면 **스크립트를 아예 안 받는다.** 브라우저가 추적 거부(DNT)를 켠 경우도 같다. 도구를 바꾸려면 `lib/gyeol/track.ts`의 `send`만 고치면 된다.

## 배포

`main`에 푸시하면 playground 저장소의 `deploy.yml`이 굽고 올린다. 사람이 손으로
밀어 넣던 것을(예전에는 `gh-pages`로 강제 푸시했다) CI가 대신한다.

배포와 똑같은 빌드를 손으로 돌려 보려면:

```bash
npm run build:pages   # out/에 정적 파일이 나온다
```

**주소가 빌드 시점에 박힌다.** `basePath`가 HTML·JS 안에 문자열로 들어가므로
산출물을 다른 자리로 옮기는 것만으로는 주소가 안 바뀐다. 경로는
`package.json`의 `build:pages`에 적혀 있고, 공유 카드·OG 이미지에 인쇄되는
주소도 같은 값에서 나온다(`lib/gyeol/site.ts`).

`public/`의 데이터는 그대로 실려 나간다 — 색인을 다시 굽지 않고 배포하면 직전
색인이 유지된다. 코드만 고쳤을 때는 그것이 맞다.

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
