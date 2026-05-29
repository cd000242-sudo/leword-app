# LEWORD - 키워드마스터

## 빌드 & 실행

```bash
npm run build          # TypeScript 컴파일
npm run start          # 개발 모드 실행
npm run dist:win       # Windows 배포판 빌드
```

## 아키텍처

### Electron 구조
- **메인 프로세스:** `src/main.ts` → 윈도우 생성, 라이선스 체크, 자동 업데이트
- **프리로드:** `preload.ts` → contextBridge API 노출 (93개 메서드)
- **렌더러:** `ui/keyword-master.html` → 단일 페이지 UI

### IPC 핸들러 모듈 (`src/main/handlers/`)
| 모듈 | 핸들러 수 | 용도 |
|------|:---------:|------|
| `keyword-discovery.ts` | 10 | MDP 발굴, 트렌드, 실시간, 급상승 |
| `keyword-analysis.ts` | 11 | 경쟁 분석, 순위, 블로그 지수, 자동완성 |
| `premium-hunting.ts` | 8 | PRO 트래픽, 카테고리 롱테일, 연관 황금 |
| `rpm-handlers.ts` | 2 | RPM 분석, 고수익 발굴 |
| `schedule-dashboard.ts` | 13 | 스케줄, 알림, 대시보드, 그룹 |
| `config-utility.ts` | 25 | API 키, 환경설정, 내보내기, 유틸 |
| `license-handlers.ts` | 4 | 라이선스 등록/확인/갱신 |
| `shared.ts` | - | 공유 상태 (abortMap, checkUnlimitedLicense) |

### 핵심 스코어링 엔진 (`src/utils/`)
| 엔진 | 파일 | 용도 |
|------|------|------|
| **MDP v3.0** | `mdp-engine.ts` | 5차원 가중 기하평균 스코어링, SERP 반영 |
| **Profit Engine** | `profit-golden-keyword-engine.ts` | CPC/CVI/월수익/블루오션 판정 |
| **PRO Hunter** | `pro-traffic-keyword-hunter.ts` | 프리미엄 트래픽 폭발 키워드 |
| **Lite Hunter** | `lite-traffic-keyword-hunter.ts` | 무료/제한 사용자용 키워드 |
| **Rising Finder** | `rising-keyword-finder.ts` | 급상승 키워드 감지 |
| **Category Hunter** | `category-longtail-keyword-hunter.ts` | 카테고리+타겟 롱테일 |

### 등급 시스템
모든 기능에서 통일된 등급 사용:
- **SSS:** 점수 85+ AND 검색량 1000+ AND 문서수 5000↓ AND 비율 5+
- **SS:** 점수 75+ AND 검색량 500+ AND 문서수 10000↓ AND 비율 3+
- **S:** 점수 65+ AND 검색량 300+ AND 비율 2+
- **A:** 점수 55+ AND 검색량 100+
- **B:** 점수 45+
- C/D는 결과에서 필터링

### 라이선스
- 서버: Google Apps Script
- 저장: `%APPDATA%/blogger-admin-panel/license/license.json`
- 비밀번호는 메모리에만 유지, 디스크에 저장하지 않음

## 코딩 규칙

- Math.random()을 점수/등급 계산에 사용 금지 (셔플/샘플링만 허용)
- 등급은 반드시 데이터 기반 다중 게이트 (index 순서 기반 금지)
- 인라인 스타일 패턴 유지 (CSS 클래스 미사용)
- profit-golden-keyword-engine의 CPC DB를 CPC 추정의 단일 소스로 사용
