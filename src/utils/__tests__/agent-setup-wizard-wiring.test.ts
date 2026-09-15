import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 처음 설정 마법사 · AI 엔진 연동 창 배선(2026-09-15, 사장님 "CLI 가 설치 안 된 완전 초보들은 설치부터 완벽하게" ·
 * 결정 "처음 설정 마법사").
 *
 * 조사로 확인한 구멍: 설치 중 진행이 안 보였고, 로그인만 끝나도 "연동됐다"고 했으며(실제 답은 확인 안 함), 종량 과금 로그인에
 * "구독하러 가기"를 권했고, 키워드 수요 분석의 엔진 안내 조건(error === 'no_agent')은 서비스가 그 값을 보내지 않아 한 번도
 * 참이 된 적이 없었다. 화면 코드는 인라인 스크립트라 동작 대신 배선을 잠근다 — 문법 · 태그 균형은 ui-* 테스트가 본다.
 */
const ui = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
const between = (start: string, end: string): string => {
  const a = ui.indexOf(start);
  const b = a >= 0 ? ui.indexOf(end, a + start.length) : -1;
  return a >= 0 && b > a ? ui.slice(a, b) : '';
};

describe('처음 설정 마법사', () => {
  it('가진 계정으로 엔진을 고른다 — 구글(무료) · ChatGPT(무료 가능) · Claude(유료 구독)', () => {
    const accounts = between('const AGENT_WIZARD_ACCOUNTS = [', '];');
    expect(accounts).toContain("provider: 'gemini'");
    expect(accounts).toContain("provider: 'codex'");
    expect(accounts).toContain("provider: 'claude'");
    expect(accounts).toContain('무료');
    expect(accounts).toContain('유료');
  });

  it('엔진마다 설치(진행 조회) → 로그인 → 실제 답 확인을 AI 엔진 연동 창과 같은 IPC 로 한다', () => {
    expect(ui).toContain("sendIPCRequest('agent-cli-install-progress'");
    const one = between('async function agentWizardSetupOne(provider, runEl, alive)', 'async function agentWizardLogin(provider, slot, alive)');
    expect(one).toContain('agentInstallWithProgress(provider');
    expect(one).toContain("sendIPCRequest('agent-cli-test'");
    expect(one).toContain('status.meteredAuth');
    const login = between('async function agentWizardLogin(provider, slot, alive)', 'function agentWizardSummary(');
    expect(login).toContain("sendIPCRequest('agent-cli-login-start'");
    expect(login).toContain("sendIPCRequest('agent-cli-login-state'");
    expect(login).toContain("sendIPCRequest('agent-cli-login-code'");
    expect(login).toContain("sendIPCRequest('agent-cli-login-cancel'");
  });

  it('AI 엔진 연동 창에서 마법사를 연다', () => {
    expect(ui).toContain('data-agent-wizard');
    expect(ui).toContain("e.target.closest('[data-agent-wizard]')");
  });

  it('설정의 AI 엔진 연동 카드에서도 마법사를 바로 연다 — 카드 클릭(연동 창 열기)과 겹치지 않게', () => {
    expect(ui).toContain('data-agent-wizard-card onclick="event.stopPropagation(); window.openAgentSetupWizard && window.openAgentSetupWizard()"');
  });

  it('창을 닫거나 다시 열면 그 회차는 멈춘다 — 설치가 끝나도 닫힌 창 뒤에서 로그인 창을 띄우지 않는다', () => {
    const run = between('async function agentWizardRun(providers)', 'async function agentWizardSetupOne(');
    expect(run).toContain('const alive = () => agentWizardEl === runEl;');
    const one = between('async function agentWizardSetupOne(provider, runEl, alive)', 'async function agentWizardLogin(provider, slot, alive)');
    expect(one.split('if (!alive()) return stopped;').length - 1).toBeGreaterThanOrEqual(5);
    const login = between('async function agentWizardLogin(provider, slot, alive)', 'function agentWizardSummary(');
    expect(login).toContain('if (cancelled || !alive()) {');
    expect(login).toContain("sendIPCRequest('agent-cli-login-cancel'");
  });

  it('첫 실행에 연결된 엔진이 없으면 한 번 권하고, [나중에]를 누르면 다시 묻지 않는다', () => {
    expect(ui).toContain('window.showAgentSetupNudge = function');
    expect(ui).toContain("localStorage.setItem('leword.agentWizard.dismissed', '1')");
    const boot = between("else window.bootDefaultScreen();", 'window.showAgentSetupNudge = function');
    expect(boot).toContain("'agent-cli-status'");
  });
});

describe('AI 엔진 연동 창', () => {
  it('로그인이 끝나면 실제 답을 확인한 뒤에 결과를 쓴다', () => {
    const flow = between('async function agentCliLoginFlow(btn)', 'async function agentCliSubmitCode(btn)');
    expect(flow).toContain("sendIPCRequest('agent-cli-test'");
    expect(flow).toContain('agentInstallWithProgress(provider');
  });

  it('종량 과금(API 키) 로그인에는 "구독하러 가기"를 띄우지 않는다', () => {
    expect(ui).toContain('(s.loggedIn && !s.available && !s.meteredAuth) ? `<button data-agent-subscribe=');
  });
});

describe('키워드 수요 분석', () => {
  it('엔진이 답하지 못하면 실측 결과 위에 연결 안내를 붙인다 — 참이 된 적 없던 no_agent 조건은 뺐다', () => {
    expect(ui).not.toContain("res.agent.error === 'no_agent'");
    expect(ui).not.toContain('window.installAgentFromDemand');
    const demand = between('window.analyzeDemand = async function', '// 엑셀로 내보내기');
    expect(demand).toContain('agentNotice');
    expect(demand).toContain('openAgentSetupWizard');
  });
});
