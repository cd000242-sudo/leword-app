# HOMEFEED STORY RADAR v2.0 — 구현 기록 (`/leword?tab=homefeed` · "홈판 신호")

2026-09-16 구현. 계획서는 [IMPLEMENTATION_PLAN_HOMEFEED_V2.md](IMPLEMENTATION_PLAN_HOMEFEED_V2.md).
두 저장소를 같이 고쳤다: **APP** `C:\Users\park\leword-app`(수집 · 판정 · AI), **SITE** `C:\Users\박성현\Desktop\리더 네이버 자동화`(화면).

## 1. 무엇을 만들었나

실시간 이슈를 **키워드가 아니라 스토리 후보**로 본다. 화면 흐름은 명령서 그대로다:

```
실시간 이슈 → 새 사실(STORY DELTA) → 재미 근거(FUN GAP) → 첫 카드(FIRST CARD)
   → 제목(STOP 3) → 대표이미지 · 썸네일 → 원고 → 발행 기록 → 성과학습
```

- 수집 · 판정은 **이 PC 의 LEWORD 앱**이 한다(기본 꺼짐 · 켜면 10분마다). 사이트 탭은 앱이 계산해 둔 결과를 읽어 그린다.
- 제목 · 원고 · 이미지 · AI 보강은 **사용자가 버튼을 눌렀을 때만** 내 구독 에이전트(클로드 · 코덱스 · 제미나이 · 그록)로 돈다. 목록 · 상세를 그릴 때는 AI 를 부르지 않는다.
- 이미지 생성은 **코덱스 구독의 내장 image_gen** 만 쓴다. 유료 API 키 경로(scripts/image_gen.py · OPENAI_API_KEY)는 실행기에서 차단한다.
- 수치는 실측 · 단순 산술뿐이고 못 잰 값은 `미측정`이다. 확률 · 점수 · 가짜 분모(`n/10`)는 화면에도 코드에도 없다(테스트로 잠금).

## 2. 왜 앱에서 수집하나 (실측 근거)

| 후보 | 왜 못 쓰나 |
|---|---|
| 클라우드 워커 크론 | 등록 · 배포는 정상인데 크론이 안 돈다(기록된 실측). KV 는 최신 한 벌만 덮어써 10분 이력이 남지 않는다 |
| 워커 issue-brief 를 10분마다 | 이슈마다 KV 쓰기 1회 — 하루 1,000회 한도를 넘는다 |
| 깃허브 예약 | 2~4.5시간 밀리거나 회차가 통째로 빠진다 |
| **앱(채택)** | 사용자가 앱을 켜 둔 동안 10분 간격이 지켜진다. 네이버 키도 사용자 본인 것이고, 구독 에이전트도 이 PC 에 있다 |

## 3. 새 파일

**APP — 판정 엔진(순수 함수)** `src/utils/homefeed/`
`types.ts`(스키마 버전 · 타입) · `settings.ts`(중앙 설정 · 하한) · `text.ts`(정규화 · 토큰 · 자카드 · 표본 관련성) · `lexicon.ts`(긴장 · 사건 말 · 과장어 · 루머 · 팬 전용 사전) ·
`category.ts`(카테고리 규칙) · `clusters.ts`(유사 제목 묶음 · 각도 · 정보층) · `signals.ts`(신호) · `story.ts`(6요소 · NO-SEARCH · TELLABILITY · FIRST CARD · 위험) ·
`status.ts`(창 · 상태 · 정렬) · `visual.ts`(이미지 전략 · 실제 이미지 가이드 · AI 프롬프트 · 썸네일) · `titles.ts`(제목 프롬프트 · 파서 · STOP/FLAT/OVER · 제목-이미지 조합) ·
`draft.ts`(원고 프롬프트 · 검사) · `calibration.ts`(성과 집계 · 표본 게이트) · `ai-materials.ts`(AI 보강 · 프롬프트 다듬기) · `ledger.ts`(이슈 키 · 처음 본 시각) · `engine.ts`(스토리 조립)

**APP — 메인 프로세스** `src/main/homefeed/`
`store.ts`(JSON 저장소) · `og-image.ts`(기사 대표이미지) · `collector.ts`(한 회차) · `sources.ts`(실제 원천 묶음) · `engine.ts`(재계산) · `scheduler.ts`(주기 · 복원) ·
`service.ts`(브리지 흐름) · `bridge-routes.ts`(경로 · 입력 검증) · `host.ts`(구독 체인 · 이미지 실행기 연결)

**APP — 에이전트** `src/utils/agent-cli/codexImageRunner.ts`(코덱스 내장 이미지 생성 · 예비 CLI 차단 · 한도 안내)

**SITE** `spa/src/lib/homefeedBridge.ts`(브리지 클라이언트 · 타입) · `spa/src/lib/homefeedModel.mjs` + `.d.mts`(라벨 · 미측정 표기 · 필터 · 정렬 · 보정 문장) ·
`spa/src/components/leword/homefeed/`(`HomefeedTab` · `HomefeedCard` · `HomefeedDetail` · `HomefeedSignalPane` · `HomefeedStoryPane` · `HomefeedFirstCard` · `HomefeedVisual` ·
`HomefeedTitlesDraft` · `HomefeedPublish` · `HomefeedLearning` · `HomefeedSettingsPanel` · `HomefeedParts` · `HomefeedStyles`)

**수정한 파일(최소 침습)**
APP `src/main/web-bridge.ts`(경로 한 줄 · deps 한 칸) · `src/main/web-bridge-host.ts`(호스트 연결 한 줄) · `src/main/keywordMasterIpcHandlers.ts`(시작 · 종료 배선) · `scripts/run-sanity-gate-test.js`(테스트 등록) · `src/utils/homefeed/*` 신설
SITE `spa/src/pages/LewordPage.tsx`(탭 등록 세 줄) · `spa/src/components/leword/LewordStyles.tsx`(탭 색 한 줄) · `spa/src/lib/bridge.ts`(`bridgeCall` · `BRIDGE_BASE` export) · `.github/workflows/deploy-pages.yml`(테스트 두 개 추가)

**이슈 탭 · 검색량/경쟁도 계산 · 로그인 · 결제는 건드리지 않았다**(계약 테스트로 잠금).

## 4. 데이터 — 명령서 테이블 A~H → 앱 JSON

운영 DB 가 없다. `%APPDATA%\LEWORD\homefeed\` 아래 JSON 이고 파일마다 스키마 버전을 싣는다(버전이 다르면 읽지 않고 새로 만든다). 쓰기는 임시 파일 → 이름 바꾸기(원자적).

| 명령서 | 파일 | 스키마 |
|---|---|---|
| A 스냅샷 | `snapshots/YYYY-MM-DD/HHmmssSSS.json` | `homefeed-snapshot-v1` |
| B 원천 상태 | `sources.json` | `homefeed-sources-v1` |
| C 처음 본 시각 | `signal-state.json` | `homefeed-signal-state-v1` |
| D 스토리 후보 | `stories.json` | `homefeed-stories-v1` |
| E · F 이미지 · 제목 · 조합 · 원고 · 생성 이미지 기록 | `assets/<이슈키 해시>.json` | `homefeed-assets-v1` |
| G 발행 | `posts.json` | `homefeed-posts-v1` |
| H 성과 | `performance.json` | `homefeed-performance-v1` |
| 설정 · og 캐시 · 이미지 | `settings.json` · `og-cache.json` · `images/<id>.bin|.json` | 각 `-v1` |

**마이그레이션**: 없다(새 폴더 · 새 파일). 기존 파일을 고치거나 지우지 않는다.
**롤백**: 설정에서 수집을 끄면 멈춘다. 코드 되돌리기는 homefeed 폴더 · 브리지 한 줄 · 탭 세 줄 제거. 데이터는 `%APPDATA%\LEWORD\homefeed` 폴더만 지우면 된다(다른 기능과 겹치는 파일 없음).
**보존**: 스냅샷 기본 7일(설정), 회차마다 지난 것 정리.

## 5. 신호 계산

- 과거 시점은 "목표 시각에 가장 가까운 앞선 회차"를 쓰되 허용 오차(수집 주기와 5분 중 큰 값) 안에 있어야 한다 — 10분마다 찍혔다고 가정하지 않는다.
- **null 전파**: 두 시점 중 하나라도 못 쟀으면 결과는 null → 화면 `미측정`. 0 으로 채우지 않는다.
- 나이는 처음 본 시각 장부에서 잰다. 장부가 비어 있던 첫 회차, 앱이 꺼져 사이가 벌어진 회차에 처음 보인 이슈는 `검열`로 표시하고 화면은 **"기록 이후 N분 이상"** 으로만 말한다.
- 재는 값: 원천 확산(실시간 목록 4곳) · 순위와 변화(음수=상승) · 뉴스 검색 결과 수 · 블로그 문서수와 10/30/60분 증가 · 분당 증가 · 가속((0~30분)−(30~60분)) · 지속(연속 회차 · 최근 60분 등장 n회 중 m회) · 포화(표본 n건 중 비슷한 제목 m건) · 매체 수 · 이미지 후보 수.

## 6. 스토리 · 게이트 · 판정

- 6요소: 기준어(개체+카테고리) · 새 사실(30분 이상 앞선 회차 표본에 없던 사실 말) · 긴장(9종 규칙 + 근거 제목) · 각도(묶음 밖 사실 말 + 근거) · 재미 근거(10종 플래그, **근거 없는 플래그 금지**) · 정보층(숫자 · 인용 · 사건 말, 같은 값은 한 층).
- NO-SEARCH 5항(앞 3항이 하나라도 거짓이면 NOW 불가) · TELLABILITY(기준어+새 사실+긴장을 60자 안에) · FIRST CARD 5항 검사와 3안 미리보기.
- 창: `OPENING · OPEN · NARROWING · CLOSED · UNKNOWN`, 상태: `NOW · EARLY · WATCH · LATE · DROP`. **판정마다 사유 코드 배열**을 남기고 화면이 사람 말로 옮긴다.
- 정렬: 창 → 가속 → 원천 확산 → 재미 근거 수 → 정보층 → 나이.
- 임계값은 전부 중앙 설정의 **보정 전 가설값**이다. 성과학습 표를 보고 사장님이 관리자 설정에서 고친다 — 코드가 스스로 바꾸지 않는다.

## 7. 이미지 · 제목 · 원고에서 지키는 선

- 기사 사진은 **후보**다: 권리 `권리 확인 필요`, 워터마크 `모름(직접 확인)`. "사용 가능"이라 쓰지 않는다. 워터마크 · 자막이 있으면 **잘라 쓰라고 하지 않고 다른 사진을 고르라고** 한다.
- AI 이미지에는 `AI 생성 이미지 — 실제 사건 사진이 아닙니다` 표기가 붙고, 실존 인물 주제는 얼굴 재현 대신 상징 장면으로 프롬프트를 짠다. 증거가 필요한 주제(연예 · 스포츠 · 사건 · 정책)는 "증거 자리에 AI 를 쓰지 말라"고 명시한다.
- 제목은 AI 12개 → 앱이 교리로 검사: 기사에 없는 숫자 · 과장어 = **OVER**, 상투구 · 쉼표 끊기 · 기사 제목 옮기기(겹침 0.5+) · 기준어 없음 · 38자 초과 · 답 누설 = **FLAT**, 나머지 **STOP**(상위 3 + 제목-이미지 조합). OVER 제목은 고를 수도 원고로 갈 수도 없다.
- 원고(이 탭 한정 예외)는 검사 후 어기면 사유를 붙여 한 번 다시 쓴다: 첫 줄 `최종 제목:` · `###` 금지 · 해시태그 5~10 · `## 이미지 배치 가이드` · 기사체 시작 금지 · 카드 약속 초반 상환 · 워터마크 삭제 권유 금지.

## 8. API (앱 브리지 · 127.0.0.1:47615 · 허용 출처만)

`GET /v1/bridge/homefeed/stories` · `POST story` · `POST collect` · `POST review` · `POST titles` · `POST visual` · `POST select` · `POST draft` · `POST image` ·
`GET image-file?id=` · `POST publish` · `POST performance` · `GET calibration` · `GET · POST settings`

- **재료만 받는다**: 스토리 id · 고른 제목/조합 id · 설정 값 · 발행 주소 · 성과 숫자. 이미지 설명(사용자가 고친 프롬프트)만 예외로 받고, 실행기가 "그림 설명"으로 감싸 길이를 자르고 읽기 전용 샌드박스에서 돌린다.
- `404` 는 **없는 경로**에만 쓴다(사이트는 404 를 "앱이 구버전"으로 읽는다). 지금 계산본에 없는 스토리 · 제목 · 이미지는 `410`.

## 9. 비용 통제

목록 = 규칙만 → 상세 = 저장된 계산본 → [AI 보강] · [제목 만들기] · [프롬프트 다듬기] · [원고 만들기] · [AI 이미지 생성]은 버튼을 눌러야 돈다.
AI 결과는 **근거 해시**로 캐시한다 — 근거 기사가 그대로면 다시 부르지 않고, 바뀌면 화면이 "근거가 바뀌었다"고 알린다.
이미지 실행기는 구독 허용목록 환경만 넘기고(OPENAI_API_KEY 는 애초에 전달되지 않음), 코덱스가 예비 CLI 를 쓰려는 흔적이 보이면 실패로 끊는다. 한도에 걸리면 재개 안내 문구를 그대로 보여 준다.

## 10. 성과학습

발행 기록(발행 때의 창 · 상태 · 제목 유형 · 이미지 전략 · 썸네일 유형) → T+30분 · 2시간 · 6시간 · 24시간 실측을 **사용자가 입력**(앱은 블로그 로그인 통계를 읽지 않는다) → 패턴별 표.
표본 규칙: `n < 5` 수치 숨김 · `n < 20` 개수와 중앙값만(비율 금지) · `n ≥ 20` 진입 비율 · 중앙값 · p25~p75. 하한(5 · 20)은 설정으로도 못 내린다.

## 11. 검증 결과(2026-09-16)

| 항목 | 결과 |
|---|---|
| APP 컴파일 `npx tsc -p tsconfig.json` | 오류 0 |
| APP 단위 · 통합 vitest 8파일 | **101/101 통과** (`homefeed-text-ledger` · `homefeed-signals` · `homefeed-story-status` · `homefeed-visual-titles-draft` · `homefeed-store-collector` · `homefeed-bridge-service` · `homefeed-real-data` · `codex-image-runner`) |
| 기존 배선 회귀(`my-lanes-always-run` · `realtime-niche-auto-persist` · `bridge-gap-topics-usage` · `bridge-no-subscription-token`) | 통과 |
| SITE 빌드 `npm run build`(tsc --noEmit + vite) | 성공 |
| SITE `node --test`(모델 11 · 계약 5 · 기존 브리지 전용 9) | **25/25 통과** |
| 실측 수집(이 PC · 10분 간격) | 회차 6개(07:20~08:10 KST) · 회차마다 이슈 10개 · 원천 8/8 정상 · 대표이미지 30장 · 실패 0 |
| 실측 통합 테스트 | 실제 스냅샷 6회차(54KB 픽스처)로 스토리 조립 · 근거/숫자/권리 표기 · 재현성 확인 |
| 화면 스모크(숨은 Chromium + 실제 브리지 + 실측 수집본) | **22/22 통과** — 목록 · 상세 6구획 · AI 보강 · 제목 · 원고 · 이미지 생성 · 발행 · 성과 · 모바일 400px · 이슈 탭 회귀 |

**실측으로 찾아 고친 결함**: 네이버 뉴스 검색이 문장형 검색어에 느슨하게 걸어 준 **다른 이슈 기사**가 표본에 섞여 각도 · 재미 근거를 오염시켰다(예: '엄지성 해트트릭' 이슈에 '손흥민 기념식' 기사). 검색어 어절이 제목에 실제로 겹칠 때만 표본으로 쓰도록 필터를 넣고(`isRelevantSample`) 버린 기사 수를 회차 로그에 남긴다.

## 12. 실행 방법

**사장님(앱 · 사이트)**
1. LEWORD 앱을 켠다(브리지가 자동으로 뜬다).
2. 사이트 `/leword?tab=homefeed` → [수집 켜기]. 10분마다 쌓이고, 30~60분 지나면 새 사실 · 증가 속도 · 가속이 계산된다.
3. 카드 [자세히] → 첫 카드 → [제목 만들기] → 조합 고르기 → [원고 만들기] → (원하면 [AI 이미지 생성]) → [발행 기록] → [성과학습]에서 숫자 입력.
4. 이미지 생성은 설정에서 "코덱스 구독으로 생성"을 켜야 돈다(기본 꺼짐 · 프롬프트 복사만).

**개발**
```bash
npx tsc -p tsconfig.json                     # APP 컴파일
npx vitest run src/utils/__tests__/homefeed-*.test.ts src/utils/__tests__/codex-image-runner.test.ts
node scripts/run-sanity-gate-test.js         # 릴리즈 게이트(홈판 테스트 포함)
cd "…/리더 네이버 자동화/spa" && npm run build
cd "…/리더 네이버 자동화" && node --test spa/tests/homefeed-model.test.mjs spa/tests/homefeed-contract.test.mjs
```

## 13. 계획서와 달라진 점

| 계획 | 실제 | 왜 |
|---|---|---|
| `src/main/homefeed/ai.ts` · `bridge-deps.ts` | `service.ts` + `host.ts` | 흐름(서비스)과 배선(호스트)을 나눠 테스트에서 실행기를 갈아끼울 수 있게 |
| `parse.ts` 에 절대 재개 시각 파서 추가 | 하지 않음. 이미지 실행기에서 문구를 **그대로** 보여 줌 | "try again at 3:05 PM" 은 시간대를 알 수 없다 — 계산하면 지어내는 값이 된다 |
| 사이트 컴포넌트 12개 분리 | 필터 · 카드 · 상세 구획을 11개로 합침 | 필터는 탭 본체에서만 쓰고, 상세는 구획 탭으로 묶는 게 읽기 쉬움 |
| 스토리 id 없는 경로 404 | **410** | 사이트는 404 를 "앱 구버전"으로 읽기 때문 |

## 14. 남은 한계 · 블로커

1. **코덱스 이미지 실측**: 이 PC 코덱스 계정 사용 한도가 2026-09-21 10:24 에 풀린다. 실행기 · 화면 · 저장 경로는 가짜 실행기로 검증했지만 **실제 생성 1회 확인은 그 뒤**에 해야 한다.
2. **블로그 문서수 변동**: 긴 문장형 검색어의 total 은 회차마다 꽤 흔들린다(실측: 296 → 18). 작은 증가 · 감소는 잡음으로 보고, 가속은 큰 흐름에서만 읽어야 한다.
3. **성과 숫자는 수동 입력**: 글별 조회 · 유입은 로그인 통계라 읽을 코드가 없다(있는 척하지 않는다).
4. **Signal.bz 원천 지연**: 원천 자체가 20~30분 늦어 `OPENING` 판정도 그만큼 늦는다.
5. **앱이 꺼져 있던 구간**: 이력이 비고, 그 구간을 걸친 증가량 · 나이는 `미측정` · `검열`로 남는다.
6. **임계값은 가설값**: 성과학습 표본이 5건 · 20건을 넘기 전에는 비율을 말하지 않는다. 보정 전까지 창 · 상태는 "기준을 이렇게 잡았다"는 뜻일 뿐이다.
