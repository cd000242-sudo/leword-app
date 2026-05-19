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
  ; v2.43.68: 빈 화면 시간 단축 — Sleep 1500 → 800ms
  ;   electron 측에서 browserPool.destroy() 선행 호출하므로 1500ms 불필요
  ;   사용자 보고 "처음 업데이트 창이뜨고나서 바로떠야되는데 이거마저 좀있다가 뜨네"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  nsExec::Exec 'taskkill /F /IM "chrome.exe" /FI "WINDOWTITLE eq leword*"'
  Sleep 800
!macroend

!macro customInstall
  ; v2.43.68: ExecShell 전 대기시간 1000 → 200ms (빠른 spawn)
  ;   installer가 완전 detach 되는 데 200ms 충분 (Windows ExecShell 동작 검증)
  Sleep 200
  ExecShell "" "$INSTDIR\LEWORD.exe"
!macroend

!macro customUnInstall
  ; 언인스톨 시에도 동일하게 실행 중 프로세스 종료
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500
!macroend
