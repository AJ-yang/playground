# 족장 — Unity 이관용 결정론 코어

`Games/chieftain`(TypeScript + Three.js)의 **시뮬레이션만** C#으로 옮긴 것이다.
렌더링은 하나도 들어 있지 않고 `UnityEngine`도 참조하지 않는다.

## 왜 이것만 있는가

Unity 에디터는 이 컨테이너에서 **설치가 불가능하다.** 확인한 것:

| | 결과 |
|---|---|
| `unity` · `unityhub` · `unity-editor` | 설치 안 됨 |
| `download.unity3d.com` | 연결 차단 |
| `public-cdn.cloud.unity3d.com` (UnityHub) | 연결 차단 |
| `license.unity3d.com` · `core.unity3d.com` | 연결 차단 |

에디터 바이너리를 구할 수도 없고, 구해도 라이선스 활성화가 네트워크를 타므로
안 된다. 그래서 **에디터 없이 만들 수 있고 에디터 없이 검증되는 부분**만 했다 —
그게 마침 이관에서 가장 크고 가장 위험한 조각이다.

씬·프리팹·URP 설정·렌더 코드는 사람이 에디터에서 만들어야 한다. 이 저장소는
그때 `Assets/Scripts/Core/`에 그대로 복사해 넣을 것을 미리 만들어 둔 것이다.

## 무엇이 검증되었는가

```
./verify.sh
```

TS 원본과 C# 포팅을 **같은 시드로 나란히 굴리고 매 틱 전체 상태를 비교한다.**
부동소수는 비트 패턴으로 찍으므로 마지막 비트 하나가 달라도 잡힌다.

```
seed 12345      3600틱  일치
seed 1          3600틱  일치
seed 999983     3600틱  일치
seed 20260824   3600틱  일치
seed 7          3600틱  일치
모든 시드에서 TS와 C#이 비트까지 일치한다.
```

5개 시드 × 3600틱(각 60초) — 유닛 좌표·체력·점령도·은·안개·건물까지 전부.

## 이 과정에서 찾은 진짜 버그

**원본 TypeScript는 락스텝이 불가능한 상태였다.** 포팅이 아니라 대조가 찾아낸 것이다.

IEEE 754는 사칙연산과 `sqrt`만 마지막 비트까지 못 박고, 나머지 수학 함수는
구현에 맡긴다. 같은 입력 20,000개를 V8과 .NET에 먹여 재보면:

| 함수 | 마지막 비트가 다른 비율 |
|---|---|
| `Math.hypot` 대 `sqrt(x²+z²)` | **37.0%** |
| `sqrt` 대 `sqrt` | 0.0% |
| `Math.atan2` | **17.9%** |
| `Math.sin` | **3.4%** |
| `Math.cos` | **3.1%** |

이건 Unity 이관 문제가 아니다. **브라우저가 다르기만 해도 같은 일이 난다** —
GDD 7.2가 1일차부터 지키기로 한 결정론이, 정작 이 함수들 때문에 안 지켜지고
있었다. 1비트 차이는 다음 틱에 2비트가 되고 30초 뒤에는 다른 판이 된다.

고친 방법: `hypot`은 `sqrt(x*x+z*z)`로 못 박고, `atan2`·`sin`·`cos`는 **Cephes
알고리즘을 손으로 옮겨 적었다**(곱셈·덧셈·나눗셈·비교만 쓴다). 양쪽에 연산 순서까지
같은 짝을 두었다:

- `Games/chieftain/src/core/det.ts`
- `Games/chieftain-unity/Core/Vec2.cs`의 `Det`

네이티브 `Math`와의 최대 오차는 sin·cos 1.1e-16, atan2 8.9e-16 — 1 ULP 남짓이라
게임 동작은 그대로다. 프레임 시간도 그대로다(측정 795ms 대 798ms, 소프트웨어
래스터라이저 기준).

## 무엇이 들어 있는가

```
Core/                    Unity의 Assets/Scripts/Core로 그대로 들어갈 것
  Rng.cs                 mulberry32. 32비트 정수 산술이라 정의상 일치한다
  Vec2.cs                Vec2 구조체 + Det(결정론 산술)
  Loop.cs                고정 타임스텝 상수
  Types.cs               Unit·Tile·Building·PlayerState…
  Board.cs               칸·다리·경로·점령·안개
  Game.cs                판 전체. 렌더링을 전혀 모른다
  Ai.cs                  컴퓨터 상대
  Data/                  Units·Tuning·Fjord·Neutrals
Trace/                   대조 하네스. Unity에는 안 들어간다
verify.sh                위의 검증을 돌린다
```

## Unity에서 이어서 할 일

1. 새 URP 프로젝트를 만들고 `Core/`를 `Assets/Scripts/Core/`에 복사한다
   (`.csproj`는 빼고 — Unity가 자체 어셈블리를 만든다). `.asmdef`를 하나 두면
   컴파일이 빨라지고 렌더 코드가 코어를 오염시키지 못한다.
2. `Time.fixedDeltaTime`을 `Loop.FixedDt`(1/60)로 맞추고 `FixedUpdate`에서
   `Game.Update(Loop.FixedDt)`를 부른다. `Time.deltaTime`은 렌더에만 쓴다.
3. **`UnityEngine.Mathf`·`Random`·`Vector3`를 코어에 절대 들이지 말 것.**
   `Mathf`는 `float`이고 `Random`은 시드가 전역이라, 둘 중 하나만 새어 들어와도
   여기서 증명한 결정론이 통째로 무효가 된다.
4. 렌더 쪽은 `Game`의 상태를 **읽기만** 한다. 지금 `src/render/*`가 하는 일과
   같은 일을, 같은 경계로.
5. 배포가 바뀐다 — Unity WebGL은 GitHub Pages에서 `Content-Encoding`을 못 세우므로
   "Decompression Fallback"을 켜야 하고, 빈 URP 빌드도 압축 5~10MB다. 지금 Three.js
   빌드는 즉시 뜬다. 이 차이는 이관을 결정할 때 사람이 값을 매길 문제다.
