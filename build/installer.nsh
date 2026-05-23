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
  ; v2.48.4 추가 강화: "Failed to uninstall old application files. Code 2" 에러 대응
  ;   원인: taskkill 후에도 OS file handle 미해제 (자식 helper 프로세스 잔존)
  ;   강화:
  ;     1) LEWORD.exe + leword.exe taskkill (3회 반복 — 새 자식 spawn 차단)
  ;     2) LEWORD 번들 chromium chrome.exe 좀비 정리 (PowerShell, 일반 Chrome 안전)
  ;     3) Sleep 2000 → 5000ms (OS handle 해제 보장)
  ;     4) ping으로 추가 동기 대기 (busy-wait 없이)
  ;     5) DetailPrint로 사용자에게 진행 메시지 표시

  DetailPrint "기존 LEWORD 프로세스 종료 중... (1/3)"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500

  DetailPrint "기존 LEWORD 프로세스 종료 중... (2/3)"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500

  DetailPrint "좀비 chrome.exe 정리 중..."
  ; PowerShell: LEWORD 번들 chromium 경로 chrome.exe만 식별 + 종료 (사용자 일반 Chrome 안전)
  ; NSIS $_ 변수 충돌 회피: $$ = literal $ (PowerShell에는 $_로 전달됨)
  nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and ($$_.Path -like ''*leword*chromium*'' -or $$_.Path -like ''*LEWORD*chromium*'') } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 500

  DetailPrint "기존 LEWORD 프로세스 종료 중... (3/3 — 최종 확인)"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'

  ; OS file handle 완전 해제 대기 — ping으로 5초 동기 대기
  DetailPrint "파일 락 해제 대기 중... (5초)"
  nsExec::Exec 'ping -n 6 127.0.0.1'
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
