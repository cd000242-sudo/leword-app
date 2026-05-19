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
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  nsExec::Exec 'taskkill /F /IM "chrome.exe" /FI "WINDOWTITLE eq leword*"'
  Sleep 800
!macroend

!macro customInstall
  ; 이중 안전망 — 둘 중 하나라도 성공하면 새 LEWORD 시작 보장
  ;   1) ExecShell (NSIS detached spawn) — 일부 silent 환경에서 차단 가능
  ;   2) electron-updater isForceRunAfter=true — quitAndInstall 측 재실행
  ; 충돌 시 main.ts requestSingleInstanceLock 재시도(v2.43.66)로 한쪽만 살아남음
  Sleep 200
  ExecShell "" "$INSTDIR\LEWORD.exe"
!macroend

!macro customUnInstall
  ; 언인스톨 시에도 동일하게 실행 중 프로세스 종료
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500
!macroend
