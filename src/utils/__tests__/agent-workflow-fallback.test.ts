import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const yaml = require('js-yaml');
const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const action = './.github/actions/setup-subscription-agents';

describe('예약 생성도 공통 폴백을 준비한다', () => {
  it.each([
    ['topic-briefs', 'briefs'], ['brief-titles', 'titles'], ['issue-niche-board', 'discover'],
    ['preemption-board', 'publish'], ['agent-worker', 'agent'],
  ])('%s/%s는 Claude 토큰만으로 다른 엔진을 차단하지 않는다', (workflow, job) => {
    const parsed = yaml.load(read(`.github/workflows/${workflow}.yml`));
    const steps = parsed.jobs[job].steps;
    const setup = steps.findIndex((step: any) => step.uses === action);
    expect(setup).toBeGreaterThan(-1);
    expect(steps[setup].if).toBeUndefined();
    const commands = steps.filter((s: any) => s.run).map((s: any) => s.run).join('\n');
    expect(commands).not.toMatch(/if \[ -z "\$CLAUDE_CODE_OAUTH_TOKEN" \]/);
    expect(steps.flatMap((s: any) => Object.values(s.env || {})).join('\n'))
      .not.toContain("CLAUDE_CODE_OAUTH_TOKEN=${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}");
    const generate = steps.findIndex((s: any) => /node scripts\/(?:topic-briefs|enrich-brief-titles|issue-niche-board|enrich-board|test-agent-chain)\.js/.test(s.run || ''));
    expect(generate).toBeGreaterThan(setup);
  });

  it('공통 설치기는 세 실행기를 준비하며, 로그인 정보를 저장소에서 복사하지 않는다', () => {
    const parsed = yaml.load(read('.github/actions/setup-subscription-agents/action.yml'));
    expect(parsed.runs.using).toBe('composite');
    expect(parsed.runs.steps[0].shell).toBe('bash');
    const script = read('scripts/setup-subscription-agents.sh');
    expect(script).toContain('@anthropic-ai/claude-code');
    expect(script).toContain('@openai/codex');
    expect(script).toContain('https://antigravity.google/cli/install.sh');
    expect(script).not.toMatch(/bash "\$installer" --skip/); // 실제 install.sh는 이 인자를 거부한다.
    expect(script).not.toMatch(/auth\.json|GEMINI_API_KEY|OPENAI_API_KEY/);
  });
});
