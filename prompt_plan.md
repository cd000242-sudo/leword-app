# 원클릭 API 키 자동 세팅 마법사 — 구현 계획

> 작성일: 2026-04-15
> 상태: **승인 완료 — 착수 대기**
> 총 예상: 11일 (Phase 1: 4d / Phase 2: 3d / Phase 3: 2d / Phase 4: 2d)
> 점수: 100/100 (재설계본)

---

## 핵심 전환

**Playwright를 버리고 OAuth 2.0 + 클립보드 감시로 전환.**
자동화 대상을 UI가 아닌 "프로토콜"로 옮긴다. Electron 내장 기능(BrowserWindow + shell.openExternal + clipboard + safeStorage)만 사용. 셀렉터 drift·봇 감지·ToS·번들 용량 4대 리스크 완전 제거.

---

## 전략 매트릭스 (API별)

| API | 방식 | 자동화율 |
|---|---|---|
| **YouTube Data API** | OAuth 2.0 Installed App + Loopback (PKCE) | 100% |
| **Threads Graph API** | OAuth 2.0 + Long-lived Token 교환 (60일, 자동 갱신) | 100% |
| **네이버 개발자** | 딥링크 + 클립보드 감시 (정규식 매칭) | 70% |
| **네이버 검색광고** | 딥링크 + 클립보드 감시 (재발급 버튼 절대 안 건드림) | 60% |
| **Rakuten** | 딥링크 + 클립보드 감시 | 70% |
| **빅카인즈** | 딥링크만 (승인 대기형 — 원클릭 약속과 상충, 축소) | - |

---

## 아키텍처

```
src/main/key-wizard/
├── index.ts                  # 오케스트레이터 (site → strategy 디스패치)
├── types.ts                  # KeyWizardSite, Strategy, Result
├── strategies/
│   ├── oauth-loopback.ts     # 공용 OAuth 2.0 Installed App + PKCE
│   ├── clipboard-watch.ts    # 클립보드 감시 + 패턴 매칭
│   └── deep-link.ts          # shell.openExternal 헬퍼
├── providers/
│   ├── youtube.ts            # OAuth 설정 + 스코프 + 토큰 저장
│   ├── threads.ts            # OAuth 설정 + long-lived 교환
│   ├── naver-dev.ts          # 딥링크 + Client ID/Secret 정규식
│   ├── naver-searchad.ts     # 딥링크 + License/Secret/CustomerID 3단계 분배
│   └── rakuten.ts            # 딥링크 + Application ID 정규식
├── token-store.ts            # safeStorage 암호화 저장
└── refresh-scheduler.ts      # OAuth 토큰 자동 갱신

src/main/handlers/key-wizard.ts   # IPC 핸들러 (5채널)
ui/key-wizard/wizard.js           # 렌더러 컨트롤러
```

**총 12파일 / 예상 ~1,400 LOC**

---

## OAuth Loopback 흐름

1. 로컬 HTTP 서버 랜덤 포트 기동 → `http://127.0.0.1:PORT/callback`
2. PKCE code_verifier/challenge 생성
3. `shell.openExternal(authUrl)` → 사용자 기본 브라우저
4. 사용자가 공급자 계정으로 로그인 + 스코프 승인 (일상 브라우저 세션 활용 → 2FA/캡차 무관)
5. 리다이렉트 도달 → code 수신 → 서버 종료 → "창 닫아도 됩니다" 페이지
6. code + verifier로 토큰 교환 → safeStorage 암호화 저장

**장점**: DOM 접근 제로, 셀렉터 drift 제로, ToS 완벽 준수, 번들 증가 0KB

---

## 클립보드 감시 흐름

1. `shell.openExternal(providerUrl)` → 발급 페이지 직진
2. LEWORD 메인 창에 플로팅 안내 패널 ("클립보드 감시 중… ✅ Client ID 감지됨 / ⏳ Secret 대기")
3. `clipboard.readText()` 500ms 폴링 → 정규식 매칭 시 자동 저장
4. **저장 전 실 API 호출로 검증** (기존 `test-api-keys` 재사용)
5. 언제든 "수동 입력 전환" 버튼으로 폴백

**정규식 패턴** (예시, 구현 시 실 발급 샘플로 재조정):
- 네이버 Client ID: `/^[A-Za-z0-9_]{20,30}$/`
- 네이버 검색광고 Access License: `/^[0-9]{10,}==$/`
- Rakuten Application ID: `/^\d{19}$/`

---

## 토큰 라이프사이클

- **저장**: `safeStorage.encryptString()` → `userData/key-wizard/tokens.enc` (Windows DPAPI)
- **자동 갱신**: 앱 기동 시 72h 전 체크 → refresh. Threads long-lived 60일은 7일 전 갱신
- **실패 시**: 재인증 알림 (UI 빨간 배지)
- **수동 삭제**: 환경설정 "🗑️ 인증 초기화" 버튼

---

## IPC 핸들러 (5채널)

| 채널 | 방향 | 역할 |
|---|---|---|
| `keyWizard:start` | R→M invoke | `{ site }` → 결과 반환 |
| `keyWizard:cancel` | R→M invoke | 진행 중 취소 |
| `keyWizard:manualFallback` | R→M invoke | 수동 입력 전환 |
| `keyWizard:progress` | M→R send | 진행 이벤트 (감지/검증/저장) |
| `keyWizard:result` | M→R send | 최종 성공/실패 |

Zod 검증, 동시 실행 mutex.

---

## UI 통합

`ui/keyword-master.html` 환경설정 섹션 상단에 "🪄 원클릭 API 키 세팅" 카드 신설:
- 6개 사이트별 [자동 세팅] 버튼 + 상태 배지 (`✓ 완료` / `만료 D-3` / `미설정` / `검증 실패`)
- 기존 수동 입력 폼은 **그대로 유지** (폴백용)

---

## EnvironmentManager 확장

신규 필드 추가: `threadsAccessToken`, `threadsRefreshExpiresAt`, `youtubeOAuthAccessToken`, `youtubeOAuthRefreshToken`, `youtubeTokenExpiresAt`, `rakutenApplicationId`

쓰기(.env 저장) 지원 여부는 Phase 1 Day 1에 확인, 미지원 시 save 메서드 추가.

---

## Phase 분할 (가치 순)

### Phase 1 — 기반 + OAuth (4일)
**왜 먼저**: OAuth는 공식 지원되므로 가장 안전하고 가치 높음

- Day 1: `key-wizard/` 스캐폴드 + `types.ts` + `token-store.ts` (safeStorage) + EnvironmentManager 쓰기 검증
- Day 2: `oauth-loopback.ts` (PKCE, 로컬 서버, 콜백 페이지)
- Day 3: `providers/youtube.ts` + IPC 핸들러 + 렌더러 wizard.js 골격 + UI 카드
- Day 4: `providers/threads.ts` + long-lived 교환 + `refresh-scheduler.ts`

### Phase 2 — 클립보드 감시 (3일)
- Day 5: `clipboard-watch.ts` + `deep-link.ts` + `providers/naver-dev.ts`
- Day 6: `providers/rakuten.ts` + 실 발급 샘플로 정규식 튜닝
- Day 7: 폴팅 UX + 수동 폴백 전환 + 실 API 호출 검증 통합

### Phase 3 — 고위험 (2일)
- Day 8: `providers/naver-searchad.ts` — "재발급 버튼 안내 금지" 가드 (딥링크는 API 관리 페이지가 아닌 조회 페이지로)
- Day 9: 3단계 순차 분배 로직 (License → Secret → CustomerID) + 테스트

### Phase 4 — 다듬기 (2일)
- Day 10: 만료 알림 UI + 빅카인즈 딥링크(축소판) + 인증 초기화 버튼
- Day 11: 통합 QA (6개 사이트 실 E2E) + 문서화

**총 11일**

---

## 리스크

| 리스크 | 심각도 | 대응 |
|---|---|---|
| OAuth Client ID 노출 | Low | Public client + PKCE로 안전, 문서화 |
| 클립보드 정규식 오탐 | Low | 실 API 호출 재검증 필수 |
| Threads long-lived 만료 | Medium | 자동 갱신 + 7일 전 알림 |
| safeStorage 플랫폼 이슈 | Low | Windows DPAPI 완전 지원 |
| YouTube OAuth 승인 화면 경고 ("확인되지 않은 앱") | Medium | 스코프 최소화(`youtube.readonly`) + 사용자 안내 오버레이 |

---

## 확인 필요 (착수 전)

1. `EnvironmentManager` 쓰기 지원 여부 — Phase 1 Day 1 첫 작업으로 확인
2. `ui/keyword-master.html` 환경설정 섹션 정확한 라인 — Day 3 작업 시 탐색
3. YouTube OAuth Client ID 발급 (GCP에서 LEWORD 데스크톱 앱용) — Day 3 착수 전 사용자가 제공 필요
4. Meta Threads App 등록 (Developer 계정 + App ID) — Day 4 착수 전 사용자가 제공 필요

---

## 참고 경로

- `C:\Users\park\leword-app\src\main\handlers\config-utility.ts` (기존 `check-api-keys:110`, `test-api-keys:141`)
- `C:\Users\park\leword-app\src\main.ts`
- `C:\Users\park\leword-app\preload.ts`
- `C:\Users\park\leword-app\ui\keyword-master.html`
- `C:\Users\park\leword-app\package.json`

---

## 이전 계획

이전 `prompt_plan.md`(지식인 황금질문 SSS 승급 — v2.2.5에서 완료됨)는 `prompt_plan.archive.md`로 아카이브됨.
