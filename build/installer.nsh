; ═══════════════════════════════════════════════════════════════
; LEWORD NSIS 설치/업데이트 매크로
; ═══════════════════════════════════════════════════════════════
; 목적은 하나다: 업데이트 설치 때 "파일이 사용 중" 으로 막히지 않게
; 실행 중인 앱을 확실히 끄고, 파일 핸들이 풀릴 짧은 시간을 준다.
;
; ── 이 파일을 고칠 사람에게 (2026-08-20 전면 정리) ─────────────────
; 예전 판은 같은 목적의 코드가 다섯 겹으로 쌓여 있었고, 그 안에 자동
; 업데이트를 통째로 죽이던 자살 코드가 둘 있었다(실측 확인):
;
;   1) "경로에 leword 가 든 프로세스를 전부 죽여라"(PowerShell)
;      → 이 설치 프로그램의 경로가
;        %LOCALAPPDATA%\leword-updater\pending\LEWORD-x.y.z.exe 라서
;        **자기 자신이 걸려 즉사**했다.
;   2) taskkill /T (프로세스 트리 종료)
;      → 설치 프로그램은 앱이 띄운 자식이라 트리에 함께 죽었다.
;
;   증상: "지금 재시작" 을 눌러도 앱만 꺼지고 아무 일도 안 일어남.
;         (updater.log 에 설치 실행 3회, 설치본은 2.49.88 그대로)
;   같은 사고를 옆 프로젝트(Better Life Naver)도 겪고 v2.10.105 에서
;   같은 결론(/T 제거)에 도달했다. 그 판의 검증된 세부를 여기에 맞췄다.
;
; 규칙 셋 — 지키면 이 사고는 다시 안 난다:
;   • 프로세스는 **이미지 이름으로만** 끈다. 경로 문자열로 찾지 마라
;     — 설치 프로그램·업데이터 캐시가 같이 걸린다.
;   • **/T 금지.** 설치 프로그램이 앱의 자식이라 자기가 죽는다.
;   • 대기는 짧고 유한하게. 예전의 10초 ping 은 근거 없는 주술이었다.
; ─────────────────────────────────────────────────────────────
;
; taskkill 은 $SYSDIR 절대경로로 부른다(PATH 오염 환경에서도 확실).
; nsExec::Exec 뒤의 Pop $0 은 반환값을 스택에서 비우는 것 — 안 비우면
; 뒤 매크로가 스택을 잘못 읽는다.
; ═══════════════════════════════════════════════════════════════

!macro LewordKillRunningApp
  ; 메인 exe. Electron 의 렌더러·GPU 자식도 같은 이름이라 함께 닫힌다.
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "LEWORD.exe"'
  Pop $0
  ; 일부 빌드에서 분리되어 나오는 헬퍼·부수 프로세스(있을 때만 잡힌다).
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "LEWORD Helper.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "LEWORD Helper (GPU).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "LEWORD Helper (Renderer).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "crashpad_handler.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "elevate.exe"'
  Pop $0
!macroend

!macro customInit
  DetailPrint "[1/3] 실행 중인 LEWORD 종료 중..."
  !insertmacro LewordKillRunningApp

  DetailPrint "[2/3] 파일 잠금 해제 대기 (2.5초)..."
  Sleep 2500

  DetailPrint "[3/3] 잔존 프로세스 재확인..."
  !insertmacro LewordKillRunningApp
  Sleep 800
  DetailPrint "종료 완료 — 설치를 시작합니다."
!macroend

; ═══════════════════════════════════════════════════════════════
; customUnInstallCheck — 옛 버전 제거가 실패해도 설치는 계속한다.
;
; electron-builder 기본 동작은 옛 언인스톨러가 0 이 아닌 코드로 끝나면
; "Failed to uninstall old application files" 를 띄우고 설치를 중단한다.
; 잠긴 파일 하나 때문에 업데이트 전체가 멈추는 것보다 계속하는 편이 낫다
; — NSIS 는 잠긴 파일을 재부팅 후 교체로 자동 처리한다.
; ═══════════════════════════════════════════════════════════════
!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint "옛 버전 제거가 코드 $R0 로 끝남 — 정리 후 설치를 계속합니다"
    !insertmacro LewordKillRunningApp
    Sleep 1200
    ClearErrors
  ${endif}
!macroend

!macro customInstall
  ; 설치 후 자동 실행은 하지 않는다(v2.49.39 결정) — electron-updater 가
  ; 필요할 때 직접 띄운다. 사용자의 작업을 끊지 않는 쪽이 낫다.
  Sleep 200
!macroend

!macro customUnInit
  DetailPrint "앱 제거 전 프로세스 종료 중..."
  !insertmacro LewordKillRunningApp
  Sleep 1500
!macroend

!macro customUnInstall
  !insertmacro LewordKillRunningApp
!macroend
