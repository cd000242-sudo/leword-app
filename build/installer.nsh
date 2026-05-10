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
  ; 설치 시작 전 실행 중인 모든 LEWORD 프로세스 강제 종료
  ; nsExec::Exec — 콘솔 출력 안 보이게, 동기 실행
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 800
  ; OS가 핸들 정리할 시간 추가 부여
!macroend

!macro customUnInstall
  ; 언인스톨 시에도 동일하게 실행 중 프로세스 종료
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500
!macroend
