import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 실검 틈새 보드 워크플로가 **실제로 돌 수 있는지**를 파일만 보고 가른다.
 * 선점 보드 워크플로 테스트와 같은 이유다 — 자격증명 이름 하나가 어긋나면
 * 예외 없이 빈 문자열이 되어 회차가 조용히 죽는다.
 */

const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'issue-niche-board.yml'), 'utf8');
const environmentManager = fs.readFileSync(path.join(root, 'src', 'utils', 'environment-manager.ts'), 'utf8');

function naverEnvKeysInWorkflow(): string[] {
  const matches = workflow.matchAll(/^\s+(NAVER_[A-Z_]+):\s*\$\{\{\s*secrets\./gm);
  return [...new Set([...matches].map((m) => m[1] as string))];
}

function envKeysReadByManager(): Set<string> {
  const matches = environmentManager.matchAll(/process\.env\['([A-Za-z0-9_]+)'\]/g);
  return new Set([...matches].map((m) => m[1] as string));
}

function stepIndex(name: string): number {
  const idx = workflow.indexOf(`- name: ${name}`);
  expect(idx, `스텝 없음: ${name}`).toBeGreaterThanOrEqual(0);
  return idx;
}

describe('실검 틈새 보드 워크플로', () => {
  it('하루 3회 — 한국 07·13·19시(UTC 22·4·10)', () => {
    expect(workflow).toMatch(/cron:\s*'0 22,4,10 \* \* \*'/);
  });

  it('워크플로가 넘기는 네이버 키 이름을 EnvironmentManager 가 전부 읽는다', () => {
    const readable = envKeysReadByManager();
    const passed = naverEnvKeysInWorkflow();
    expect(passed).toEqual(expect.arrayContaining(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']));
    expect(passed.filter((key) => !readable.has(key))).toEqual([]);
  });

  it('검색광고 키 셋을 회차에 넘긴다 — 없으면 보드 전 행의 검색량이 null 이다(첫 발행이 그랬다)', () => {
    const hunt = workflow.slice(stepIndex('실검 틈새 회차'), stepIndex('보드 원장 보관'));
    for (const key of ['NAVER_SEARCH_AD_ACCESS_LICENSE', 'NAVER_SEARCH_AD_SECRET_KEY', 'NAVER_SEARCH_AD_CUSTOMER_ID']) {
      expect(hunt).toContain(`${key}: \${{ secrets.${key} }}`);
    }
    const check = workflow.slice(stepIndex('필수 시크릿 확인'), stepIndex('구독 에이전트 CLI 설치'));
    expect(check).toContain("NAVER_SEARCH_AD_ACCESS_LICENSE=${{ secrets.NAVER_SEARCH_AD_ACCESS_LICENSE != '' }}");
  });

  it('밑줄 빠진 옛 이름을 쓰지 않는다', () => {
    expect(/NAVER_SEARCHAD_/.test(workflow)).toBe(false);
  });

  it('사이트 발행은 개인 토큰이 아니라 배포키로 한다', () => {
    expect(/ssh-key:\s*\$\{\{\s*secrets\.SITE_REPO_SSH_KEY\s*\}\}/.test(workflow)).toBe(true);
    expect(/SITE_REPO_TOKEN/.test(workflow)).toBe(false);
  });

  it('AI 는 API 키가 아니라 구독 토큰(claude CLI)이다', () => {
    expect(workflow).toMatch(/CLAUDE_CODE_OAUTH_TOKEN:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN\s*\}\}/);
    expect(workflow).toContain('npm install -g @anthropic-ai/claude-code');
    expect(/ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY/.test(workflow)).toBe(false);
  });

  it('CLI 설치는 토큰이 있을 때만 한다', () => {
    const install = workflow.slice(stepIndex('구독 에이전트 CLI 설치'), stepIndex('실검 틈새 회차'));
    expect(install).toMatch(/if \[ -z "\$CLAUDE_CODE_OAUTH_TOKEN" \]/);
  });

  it('시크릿 확인이 회차보다 앞에 있고, 회차 스텝이 시크릿을 받는다', () => {
    expect(stepIndex('필수 시크릿 확인')).toBeLessThan(stepIndex('실검 틈새 회차'));
    const hunt = workflow.slice(stepIndex('실검 틈새 회차'), stepIndex('보드 원장 보관'));
    expect(hunt).toContain('NAVER_CLIENT_ID: ${{ secrets.NAVER_CLIENT_ID }}');
    expect(hunt).toContain('CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}');
    expect(hunt).toContain('scripts/issue-niche-board.js');
  });

  it('회차 → 황금 보강 → 발행 입력 고르기 → 발행 순서다 — 황금키워드보드와 같은 보강기를 쓴다', () => {
    expect(stepIndex('실검 틈새 회차')).toBeLessThan(stepIndex('황금 보강 (지식인·연관 풀·제목·추세·수익)'));
    expect(stepIndex('황금 보강 (지식인·연관 풀·제목·추세·수익)')).toBeLessThan(stepIndex('발행 입력 고르기'));
    expect(stepIndex('발행 입력 고르기')).toBeLessThan(stepIndex('보드 발행'));
    const hunt = workflow.slice(stepIndex('실검 틈새 회차'), stepIndex('황금 보강 (지식인·연관 풀·제목·추세·수익)'));
    expect(hunt).toContain('--picksOut=issue-board-picks.json');
    const enrich = workflow.slice(stepIndex('황금 보강 (지식인·연관 풀·제목·추세·수익)'), stepIndex('발행 입력 고르기'));
    expect(enrich).toContain('scripts/enrich-board.js');
    expect(enrich).toContain('--in=issue-board-picks.json');
    expect(enrich).toContain('--out=issue-board-enriched.json');
    // 보강은 실패해도 회차를 죽이지 않는다 — 실측 행만으로 발행한다.
    expect(enrich).toMatch(/continue-on-error:\s*true/);
    expect(enrich).toMatch(/timeout-minutes:\s*\d+/);
    expect(enrich).toContain('CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}');
    expect(enrich).toContain('NAVER_SEARCH_AD_ACCESS_LICENSE: ${{ secrets.NAVER_SEARCH_AD_ACCESS_LICENSE }}');
    const choose = workflow.slice(stepIndex('발행 입력 고르기'), stepIndex('보드 원장 보관'));
    expect(choose).toContain('cp issue-board-enriched.json issue-board-publish.json');
    expect(choose).toContain('cp issue-board-picks.json issue-board-publish.json');
    const publish = workflow.slice(stepIndex('보드 발행'), stepIndex('커밋·푸시'));
    expect(publish).toContain('--in=issue-board-publish.json');
  });

  it('발행 경로와 커밋 경로가 같은 파일이다', () => {
    expect(workflow).toContain('--dest=site/spa/public/data/issue-niche-board.json');
    expect(workflow).toContain('git add spa/public/data/issue-niche-board.json');
  });

  it('실을 행이 0 이면(exit 4) 회차를 죽이지 않는다', () => {
    const publish = workflow.slice(stepIndex('보드 발행'), stepIndex('커밋·푸시'));
    expect(publish).toMatch(/\|\| \[ \$\? -eq 4 \]/);
  });

  it('푸시 전에 사이트 레포를 당겨 재시도한다 — 15분 크론이 낡은 체크아웃을 밀어낸다', () => {
    const push = workflow.slice(stepIndex('커밋·푸시'));
    expect(push).toMatch(/git pull --rebase origin main && git push && exit 0/);
    expect(push).toMatch(/for i in 1 2 3; do/);
  });

  it('회차 스크립트는 끝나면 명시적으로 종료한다 — 첫 CI 회차가 152초에 끝나고도 30분을 매달렸다', () => {
    const script = fs.readFileSync(path.join(root, 'scripts', 'issue-niche-board.js'), 'utf8');
    expect(script).toMatch(/main\(\)\s*\.then\(\(\)\s*=>\s*process\.exit\(0\)\)/);
  });

  // 실사고 2026-09-03 '지예은 남편': 첫 회차엔 키워드도구가 몰라 검색량 null, 48시간
  // 이월되는 동안 아무도 다시 안 재서 도구가 알게 된 뒤에도 화면은 '—'. 그래프도 같다.
  it('발행 → 이월 행 재측정(검색량·추세) → 이월 행 재보강 순서다 — 재보강은 그래프 있는 행을 건너뛴다', () => {
    expect(stepIndex('보드 발행')).toBeLessThan(stepIndex('이월 행 재측정(검색량·추세)'));
    expect(stepIndex('이월 행 재측정(검색량·추세)')).toBeLessThan(stepIndex('이월 행 재보강'));
    expect(stepIndex('이월 행 재보강')).toBeLessThan(stepIndex('커밋·푸시'));
  });

  it('재측정은 실측 API 둘(검색광고·오픈API)만 받고, 실패해도 회차를 죽이지 않으며, JSON 이 온전할 때만 발행본에 덮는다', () => {
    const remeasure = workflow.slice(stepIndex('이월 행 재측정(검색량·추세)'), stepIndex('이월 행 재보강'));
    expect(remeasure).toContain('scripts/remeasure-issue-board.js');
    expect(remeasure).toContain('continue-on-error: true');
    expect(remeasure).toMatch(/timeout-minutes: \d+/);
    for (const key of ['NAVER_SEARCH_AD_ACCESS_LICENSE', 'NAVER_SEARCH_AD_SECRET_KEY', 'NAVER_SEARCH_AD_CUSTOMER_ID', 'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']) {
      expect(remeasure).toContain(`${key}: \${{ secrets.${key} }}`);
    }
    // AI 호출이 없는 단계다 — 구독 토큰을 넘기지 않는다.
    expect(remeasure).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(remeasure).toMatch(/JSON\.parse\([^\n]*issue-board-remeasured\.json[^\n]*\n\s*&& cp issue-board-remeasured\.json "\$DEST"/);
  });

  it('재측정 스크립트도 끝나면 명시적으로 종료한다', () => {
    const script = fs.readFileSync(path.join(root, 'scripts', 'remeasure-issue-board.js'), 'utf8');
    expect(script).toMatch(/main\(\)\s*\.then\(\(\)\s*=>\s*process\.exit\(0\)\)/);
  });
});
