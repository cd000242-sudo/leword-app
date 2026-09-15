# 구독 CLI 폴백 연결 — 2026-09-14

자동 생성은 `src/utils/agent-cli/defaultChain.ts`에서 정의한 Claude → Codex → Gemini 순서로 실행한다. 기존 Grok은 마지막 예비 제공자로 유지한다. 웹에서 제공자를 명시적으로 선택하면 그 제공자를 먼저 실행하고, 실패 시 나머지를 공통 순서로 시도한다. 제공자별 로그인·연결 진단은 해당 제공자만 검사한다.

| 적용 경로 | 변경 |
|---|---|
| 오늘의 글감: 앱·예약 | Gemini 추가, 전체 실패 시 기존 데이터 보존, 빈 회차 재시도 |
| 황금키워드: 보강·브리프 | 공통 실행기 적용, 브리프 Gemini 누락 수정 |
| 제휴: 보강·제목 | 공통 실행기 적용, 보강 Gemini 누락 수정 |
| 실검 틈새·다음 물결 | 공통 실행기 적용 |
| 키워드 수요·인사이트 | 실제 호출 실패 후에도 다음 제공자 시도 |
| 웹 지식인 답변·글감·레이더·글 진단 | 선택 엔진 실패 시 다른 제공자 시도 |
| 자료 보강(agent 모드) | Gemini 누락 수정 |
| 제목 창고 | 공통 실행기 적용, 생성 실패 시 기존 파일 보존 |
| GitHub 워크플로 5개 | CLI 설치 공통화, Claude 토큰만 확인하던 차단 제거 |
| 앱 Gemini 설치·로그인·계정 전환 | 생성기와 동일한 agy 설치, 공식 대화형 인증 및 로그인 상태 확인 |
| 개별 엔진 연결 시험 | Grok 시험이 Gemini를 호출하던 잘못된 연결 수정 |
| 사이트 유튜브 글감 | 서버의 일반 오류에도 앱 구독으로 재시도 |
| 사이트 레이더 첫 분석 | 서버 본문 추출 → 앱 공통 폴백 → 서버 응답 검증·검색량/문서수 실측 |
| 사이트 앱 요청 대기시간 | 마지막 제공자까지 실행할 수 있도록 기능별 전체 폴백 시간 확보 |

`runAny.ts`는 모든 제공자의 실패 사유를 남긴다. Claude 오류 봉투는 메타데이터보다 실제 오류 문구를 우선 표시한다. 따라서 최초 Claude 한도 초과가 마지막 미설치 오류에 가려지지 않는다.

오늘의 글감에서 검색량을 측정하지 않을 때 같은 배열을 비우면서 생성 결과까지 사라지던 문제도 수정했다. 0건 결과는 정상 게시하거나 완료로 집계하지 않는다.

## 검증

- Claude 한도 초과 → Codex 실패 → Gemini 성공: 실행 순서·실제 선택 제공자 검증.
- 글감 생성 스크립트 실행: 빈 회차 재시도·게시, 정상 회차 생략, 전체 실패 시 기존 파일 보존.
- 키워드 인사이트: Gemini 제안을 검색량 검증 후 반영.
- 전체 자동 생성 경로의 직접 CLI 연결 누락 검사, 워크플로 YAML 및 셸 문법 검사.
- 2026-09-14: 관련 Vitest 32개 파일, 314개 테스트 통과. TypeScript/Electron 빌드 통과.
- 사이트 연결 테스트 4개, 워커 분석 테스트 3개 통과. 사이트 TypeScript/Vite 빌드와 워커 JavaScript 문법 검사 통과.
- 전체 사이트 UI의 80% 커버리지는 측정하지 않았다. 실제 Windows 대화형 터미널 입출력은 확인했으며, macOS/Linux 인증 창은 모의 테스트 범위다.

Gemini 설치·인증은 [Google 공식 설치 및 인증 흐름](https://antigravity.google/docs/cli/install/)을 따른다. 설치 스크립트 본문도 확인해 Linux에서 지원하지 않는 추가 플래그를 제거했다. 앱에서 로그인을 누르면 대화형 Gemini 창을 열며, 계정 전환은 해당 창에 `/logout`을 입력한 뒤 실제 인증 해제를 확인한다. 계정 전환의 브라우저 승인까지는 사용자 조작이 필요하므로 자동 테스트는 명령 연결·상태 판정·취소를 검증한다.

## 운영 반영 전 확인할 상태

이 변경은 작업 사본과 로컬 빌드에 적용했다. GitHub 기본 브랜치와 배포 앱에는 별도 반영해야 한다.

조사 시점에 GitHub 실행기는 Claude 로그인만 있었고, Codex·Gemini 로그인과 자체 호스팅 실행기는 없었다. 공통 설치가 로그인을 대신하지는 않는다. Google은 비대화형 CLI가 저장된 로그인 세션을 사용하며, 세션이 없으면 인증 오류로 종료한다고 설명한다: [Google headless mode](https://antigravity.google/docs/cli/headless/).

현재 저장소는 공개다. 개인 Codex 인증 파일을 이 저장소의 작업에 자동 복사하지 않는다. OpenAI도 계정 인증을 사용하는 CI를 공개 저장소에 사용하지 않도록 안내한다: [OpenAI automation authentication](https://learn.chatgpt.com/docs/non-interactive-mode#authenticate-in-automation).

PC의 Gemini 실행기는 첫 시험에서 `Eligibility check failed: UNAVAILABLE (code 503)`을 반환했으나, 16:20 KST 재시험은 `연결 확인`으로 성공했다. 공통 실행기의 실제 호출도 Claude 한도 초과 → Codex `연동확인` 응답으로 폴백 성공을 확인했다. 예약 실행 환경에는 별도로 정상 로그인 세션이 마련돼야 한다.

Gemini 앱 설치 함수의 실제 실행도 성공했다: `method=native`, 설치 후 감지 `Antigravity CLI 1.2.2`. Windows에서 `powershell.exe`처럼 확장자가 있는 실행 파일을 찾지 못하던 경로 탐색과, 설치기에 필요한 CPU 아키텍처 환경변수 누락도 수정했다.

실제 글감 생성은 2026-09-13 17:03 KST에 종료 코드 0으로 완료했다. 13개 분야에서 68건(NOW 35 · NEXT 28 · ALWAYS 5)을 만들었고, 앞 5개 분야는 Codex, 뒤 8개 분야는 Gemini가 응답했다. 검색어 184개를 측정했으며 핵심어 자리 68건도 측정했다. 결과는 `tmp/agent-fallback-recovery/topic-briefs.json`에 있다. 이 파일은 **9월 13일 저녁 회차**이며, 9월 14일 글감으로 다시 표시하거나 게시하지 않았다.

## 함께 반영할 작업 사본

- 앱·예약 생성 코드: 이 저장소의 변경사항.
- 사이트: 별도 Git 저장소 `tmp/leaderspro-admin-work`의 `spa/src/lib/bridge.ts`, `spa/src/components/leword/{YoutubeTab,RadarTab}.tsx`, `spa/scripts/generation-fallback.test.cjs`.
- 워커: `tmp/cf-worker/worker.js`. 임시 폴더 밖에도 이번 레이더 변경만 `docs/patches/worker-radar-agent-fallback.patch`로 보존한다. 원본 워커의 다른 변경은 이 패치에 넣지 않았다.
- 워커 회귀 시험: `node scripts/test-radar-worker-fallback.cjs tmp/cf-worker/worker.js`.

레이더는 워커 → 앱 → 사이트 순으로 반영한다. 새 워커의 앱 분석 경로와 기존 서버 분석 경로는 같은 파서와 실측 함수를 사용한다. 워커의 기존 `deploy.js`는 바인딩과 예약 설정도 교체하므로 단순 코드 검증용으로 실행하지 않았다. 실제 배포 시 현재 설정을 보존해야 한다.

현재까지 원격 브랜치 푸시, 사이트·워커 배포, 앱 배포판 발행, PC 예약 등록은 하지 않았다. 예약을 PC에서 돌릴지 별도 실행기에서 돌릴지는 아직 확정되지 않았다. 이 선택과 해당 환경의 로그인 없이는 GitHub에 실행기만 설치해도 Codex·Gemini 예약 폴백이 실제로 성공하지 않는다.
