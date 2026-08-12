# playground

이것저것 만들어 보는 저장소. 갈래별로 폴더를 두고 그 아래에 프로젝트를 하나씩 넣는다.

| 폴더 | 무엇 | 상태 |
| --- | --- | --- |
| [`Games/joseon-defense/`](Games/joseon-defense/) | **조선 방어전** — 왜구의 노략에서 병자호란까지, 여섯 전쟁으로부터 성을 지키는 경로형 타워디펜스 | 배포됨 |

저장소 루트의 `.claude/`·`.agents/`·`skills-lock.json`은 프로젝트가 아니라 이
저장소에서 쓰는 도구 설정이다.

## 조선 방어전

TypeScript + HTML5 Canvas, 게임 엔진 의존성 없음. 스프라이트 파일도 없이 손으로
쓴 SVG 패스를 `Path2D`로 그린다.

**놀아 보기** → <https://aj-yang.github.io/playground/>

```bash
cd Games/joseon-defense
npm install
npm run dev        # http://localhost:5173
npm run balance    # 밸런스 회귀 게이트 — 설계 의도가 깨지면 종료 코드 1
```

이 프로젝트의 특징은 밸런스를 **눈이 아니라 시뮬레이터로** 잡았다는 것이다.
브라우저와 같은 `Game` 클래스를 렌더링 없이 돌려 빌드 방침만 다른 대조군 AI
20종 × 20판 × 6스테이지(2,400판)를 약 100초에 끝낸다. 밸런스가 무너진 세 번이
전부 "기물을 더 지었는데 더 나빠진다"는 같은 모양이었고 코드를 읽어서는 안
보였기 때문에, 그 판단을 CI로 옮겨 뒀다.

자세한 것은 [`Games/joseon-defense/README.md`](Games/joseon-defense/README.md)와
[`Games/joseon-defense/docs/`](Games/joseon-defense/docs/) 아래 문서들:

- [`GDD.md`](Games/joseon-defense/docs/GDD.md) — 설계 의도와 참고 게임 분석
- [`BALANCE.md`](Games/joseon-defense/docs/BALANCE.md) — 밸런스 검증 방법·결과·근거
- [`ROADMAP.md`](Games/joseon-defense/docs/ROADMAP.md) — 다음 작업 계획

## 배포

`main`에 푸시되면 `.github/workflows/deploy.yml`이 `Games/joseon-defense/`를 빌드해
GitHub Pages로 올린다. 같은 푸시에서 `verify.yml`이 타입 검사·빌드·밸런스
게이트를 돌린다. 두 워크플로 모두 `working-directory: Games/joseon-defense`로 돈다.
