; ============================================================
; LEWORD NSIS Installer Custom Hooks
;
; 목적: 자동 업데이트 시 NSIS가 "files in use" 다이얼로그 띄우는 것 방지.
; 주요 매크로 (electron-builder가 NSIS 빌드 중 호출):
;   - customInit       : 설치 시작 직전 (인스톨러 GUI 보이기 전)
;   - customInstall    : 파일 복사 완료 직후
;   - customUnInstall  : 언인스톨 시작 시
;
; taskkill로 LEWORD.exe + 헬퍼 프로세스 모두 강제 종료한 후 짧은 대기.
; /F (force) /T (tree — 자식 프로세스 포함) 사용으로 Electron의 멀티프로세스 트리 정리.
; ============================================================

; v2.43.69: 사용자 보고 "사용자환경에서는 계속 안뜬다고하는데"
;   원인 추정: NSIS silent install 시 ExecShell이 일부 Windows 환경에서 차단됨
;   해결: isForceRunAfter=true (electron-updater 측 자동 spawn) + ExecShell (이중 안전망)
;        + main.ts lock 재시도(v2.43.66)가 두 인스턴스 충돌 처리

!macro customInit
  ; v2.47.2 강화: file lock 충돌 차단 — v2.43.84 사용자가 self-heal 시 "install 안 뜸" 보고 대응
  ;   원인: LEWORD.exe 자식 chrome.exe 좀비가 install 파일 lock 잡음 → NSIS hang
  ;   강화:
  ;     1) LEWORD.exe + 자식 트리 강제 종료 (기존)
  ;     2) LEWORD 번들 chromium 경로 chrome.exe 별도 정리 (사용자 일반 Chrome 안전)
  ;     3) Sleep 2000ms로 OS handle 해제 보장
  ;     4) 진행 메시지로 사용자에게 install 진행 안내
  DetailPrint "기존 LEWORD 프로세스 종료 중..."
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'

  ; v2.47.2: LEWORD 번들 chromium chrome.exe 좀비 정리 (PowerShell, 사용자 일반 Chrome 안전)
  DetailPrint "좀비 chrome.exe 정리 중..."
  nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like ''*leword*chromium*'' -or $_.Path -like ''*LEWORD*chromium*'') } | Stop-Process -Force -ErrorAction SilentlyContinue"'

  ; OS handle 해제 대기 (chrome 좀비 정리 후 file lock 해제 보장)
  DetailPrint "파일 락 해제 대기..."
  Sleep 2000
!macroend

!macro customInstall
  ; v2.43.78: 자동 install 모드 복귀 — 사용자 요청 "전처럼 자동업데이트 빠르고 안정적으로 바로 열려야"
  ;   이중 안전망 spawn:
  ;     1) ExecShell (NSIS detached, 검증된 환경에서 신뢰성 높음)
  ;     2) electron-updater isForceRunAfter=true (대체)
  ;   두 spawn 동시 충돌은 main.ts requestSingleInstanceLock 재시도(v2.43.66)가 처리
  Sleep 200
  ExecShell "" "$INSTDIR\LEWORD.exe"
!macroend

!macro customUnInstall
  ; 언인스톨 시에도 동일하게 실행 중 프로세스 종료
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500
!macroend
