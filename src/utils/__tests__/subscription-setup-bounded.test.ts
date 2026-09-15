import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 구독 CLI 설치 단계가 네트워크에 매달려 회차를 통째로 잃지 않는다 (2026-09-15).
 *
 * 워크플로 5개(글감·실검 틈새·제목 창고·황금 발행·재보강)가 같은 설치 스크립트를 쓴다. 이 단계에는
 * 단계 시간 제한도 continue-on-error 도 없어서, 설치가 멈추면 잡 제한(글감 90분·실검 50분·제목 30분)까지
 * 붙잡고 그 회차가 사라진다. 옛 워크플로는 npm 설치만 했는데, 새 스크립트는 Gemini 설치 스크립트를
 * 외부에서 받아 실행한다 — 새로 생긴 멈춤 지점이다.
 *
 * 설치 실패는 이미 경고로 넘어가게 짜여 있으니, 멈춤도 실패로 바꿔 같은 길로 보낸다. 여기서 잠그는 것:
 *   ① npm 설치와 Gemini 설치 스크립트 받기·실행이 모두 시간 제한 안에서 돈다
 *   ② timeout 명령이 없는 러너에서는 제한 없이 예전처럼 돈다(없는 명령 탓에 설치 실패로 치지 않는다)
 *   ③ 멈춤·실패는 경고로 넘어가고, 셋 다 없을 때만 잡을 멈춘다
 */
const script = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'scripts', 'setup-subscription-agents.sh'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('구독 CLI 설치는 시간이 묶여 있다', () => {
  it('npm 설치는 시간 제한 안에서 돈다', () => {
    expect(script).toContain('run_limited 600 npm install -g "$package"');
    expect(script).not.toMatch(/if ! npm install -g/);
  });

  it('Gemini 설치 스크립트는 받기·실행 둘 다 시간 제한이 있다', () => {
    expect(script).toMatch(/curl -fsSL --max-time \d+ https:\/\/antigravity\.google\/cli\/install\.sh/);
    expect(script).toContain('run_limited 600 bash "$installer"');
  });

  it('timeout 이 없는 러너에서는 제한 없이 그대로 돈다', () => {
    expect(script).toContain('if command -v timeout >/dev/null 2>&1; then timeout "$seconds" "$@"; else "$@"; fi');
  });

  it('멈춤·실패는 경고로 넘어가고, 셋 다 없을 때만 잡을 멈춘다', () => {
    expect(script).toContain('::warning::$command installation failed; remaining providers will still be tried.');
    expect(script).toContain('::warning::Gemini CLI installation failed; remaining providers will still be tried.');
    expect(script).toContain(`if [ "$found" -eq 0 ]; then echo '::error::No subscription CLI is installed.'; exit 1; fi`);
  });
});
