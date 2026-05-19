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

!macro customInit
  ; v2.43.66: 업데이트 후 leftover 프로세스로 인한 실행 실패 차단
  ;   기존 800ms 대기는 일부 Windows 환경에서 부족
  ;   Puppeteer/Chromium 헬퍼 자식 프로세스까지 완전 정리되도록 1500ms
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  ; Chromium/Puppeteer 헬퍼도 명시적 종료 (LEWORD 자식이지만 분리되어 살아남는 경우 대비)
  nsExec::Exec 'taskkill /F /IM "chrome.exe" /FI "WINDOWTITLE eq leword*"'
  Sleep 1500
!macroend

!macro customInstall
  ; v2.43.66: 자동 업데이트 후 단일 자동 실행 메커니즘 (electron-updater 측 isForceRunAfter=false)
  ;   - electron-updater의 isForceRunAfter는 silent 모드에서 Windows에서 자주 실패
  ;   - 인스톨러가 직접 LEWORD.exe를 spawn하면 silent/non-silent 무관 동작
  ;   - ExecShell은 비동기 → 인스톨러 즉시 종료, 앱은 detached로 시작
  ;   - 1초 대기 후 spawn → installer가 완전히 detach 되도록
  Sleep 1000
  ExecShell "" "$INSTDIR\LEWORD.exe"
!macroend

!macro customUnInstall
  ; 언인스톨 시에도 동일하게 실행 중 프로세스 종료
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500
!macroend
