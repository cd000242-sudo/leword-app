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
  ; v2.48.6: NSIS un.atomicRMDir Rename 실패 → "Failed to uninstall: 2" 근본 원인
  ;   원인: $INSTDIR 내 파일 핸들이 5초 안에 해제 안 됨 (Defender 실시간 스캔 등)
  ;   강화:
  ;     1) LEWORD.exe / leword.exe / Helper / utility 4종 taskkill 반복
  ;     2) chromium 좀비 + sharp 좀비 PowerShell 정리
  ;     3) Defender / Search Indexer 일시 스킵 신호 (Set-MpPreference)
  ;     4) 총 10초 대기 (5 → 10초, file handle 해제 보장 강화)

  DetailPrint "기존 LEWORD 프로세스 종료 중... (1/4)"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500

  DetailPrint "기존 LEWORD 프로세스 종료 중... (2/4)"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500

  DetailPrint "좀비 chrome.exe + helper 정리 중..."
  ; v2.48.6: LEWORD 경로 어디든 매칭 (chromium 폴더 이외에 helper 도 잡힘)
  nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and ($$_.Path -like ''*leword*'' -or $$_.Path -like ''*LEWORD*'') } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  ; v2.48.6: sharp/native binary 좀비도 정리
  nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "Get-Process | Where-Object { $$_.Path -and ($$_.Path -like ''*leword*'' -or $$_.Path -like ''*LEWORD*'') -and $$_.ProcessName -ne ''explorer'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 1000

  DetailPrint "기존 LEWORD 프로세스 종료 중... (3/4)"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'

  DetailPrint "기존 LEWORD 프로세스 종료 중... (4/4 — 최종)"
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500

  ; v2.49.38: v2.49.25 의 Get-CimInstance Win32_Process 명령 제거 — NSIS hang 원인
  ;   사용자 보고 (2026-05-28): v2.49.37 NSIS installer 실행 후 hang, NSIS 안 열림
  ;   원인: Get-CimInstance Win32_Process 가 Defender 검사 + WMI 호출로 5~60초 hang
  ;   해결: taskkill /T 가 이미 자식 process tree 정리 → CimInstance 불필요
  ;         단순 taskkill 만으로 LEWORD + chromium subprocess 모두 정리됨
  DetailPrint "Electron 자식 process 추가 정리..."
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500

  ; v2.48.6: OS file handle 완전 해제 대기 — 5초 → 10초 (Defender 스캔 종료 보장)
  DetailPrint "파일 락 해제 대기 중... (10초, 백신 스캔 종료 대기)"
  nsExec::Exec 'ping -n 11 127.0.0.1'
!macroend

; ============================================================
; v2.48.6: customUnInstallCheck — OLD uninstaller exit code 처리 가로채기
;
; electron-builder NSIS 기본 동작:
;   OLD uninstaller exit != 0 → "Failed to uninstall old application files: <code>" MessageBox + Quit
;
; 근본 원인:
;   $INSTDIR 내 일부 파일 핸들이 OLD uninstaller 의 un.atomicRMDir Rename 시점에 살아있음
;   (Defender 실시간 스캔, Windows Search Indexer, 또는 utility process 잔존)
;
; 해결:
;   1) exit code 0 → 정상 진행
;   2) exit != 0 → 추가 정리 시도 → 어쨌든 NEW install 강행 (NSIS File 명령은 reboot-on-locked 자동 처리)
;   3) Quit 안 함 → MessageBox 안 뜸 → 사용자 경험 끊김 없음
; ============================================================
!macro customUnInstallCheck
  ${if} $R0 == 0
    ; 정상 종료 — 추가 작업 없이 return (handleUninstallResult 가 자동 return)
  ${else}
    DetailPrint "[v2.48.6] OLD uninstaller exit code=$R0 — 추가 정리 시도"

    ; 추가 taskkill (OLD uninstaller 실행 중 새로 spawn 된 process 잡기)
    nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
    nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
    Sleep 1000

    ; PowerShell 강제 정리
    nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "Get-Process | Where-Object { $$_.Path -and ($$_.Path -like ''*leword*'' -or $$_.Path -like ''*LEWORD*'') } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2"'

    DetailPrint "[v2.48.6] OLD uninstaller 실패 무시 — NEW install 강행"
    DetailPrint "  ⓘ NSIS File 명령이 locked 파일은 reboot 후 교체로 자동 처리합니다"
    ClearErrors
  ${endif}
!macroend

!macro customInstall
  ; v2.49.39: 에이전트팀 토론 결론 — "다음 LEWORD 실행 시 install" 모델 전환
  ;   ExecShell 제거. 사용자가 직접 LEWORD 켤 때만 새 버전 적용.
  ;   release 직후 install 강제 → 사용자 작업 중단 0.
  Sleep 200
!macroend

!macro customUnInstall
  ; 언인스톨 시에도 동일하게 실행 중 프로세스 종료
  nsExec::Exec 'taskkill /F /IM "LEWORD.exe" /T'
  nsExec::Exec 'taskkill /F /IM "leword.exe" /T'
  Sleep 500
!macroend
