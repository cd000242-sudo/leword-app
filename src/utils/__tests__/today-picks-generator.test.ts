import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const rounds = require('../../../scripts/today-picks-rounds');
const source = fs.readFileSync(path.resolve(__dirname, '../../../scripts/today-picks.js'), 'utf8');

function harness(documentCount: number | null, cache: Record<string, unknown> = {}, carry: unknown = null, extraArgs: string[] = []) {
  const files = new Map<string, string>();
  const file = (name: string) => path.resolve(name);
  files.set(file('warehouse.json'), JSON.stringify({ seeds: [{ keyword: '테스트', searchVolume: 1000, source: 'hint' }] }));
  files.set(file('cache.json'), JSON.stringify(cache));
  if (carry) files.set(file('carry.json'), JSON.stringify(carry));
  files.set(file('output.json'), 'LAST_GOOD_OUTPUT');
  let calls = 0;
  const fakeFs = {
    existsSync: (p: string) => files.has(p),
    readFileSync: (p: string) => files.get(p),
    writeFileSync: (p: string, value: string) => files.set(p, value),
    mkdirSync: () => {},
    renameSync: (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); },
  };
  const fakeRequire: any = (id: string) => {
    if (id === 'fs') return fakeFs;
    if (id === 'path') return path;
    if (id.includes('load-project-env')) return { loadProjectEnv: () => {} };
    if (id.includes('today-picks-rounds')) return rounds;
    if (id.includes('seed-db')) return { topicOfSeed: () => '경제' };
    if (id.includes('naver-blog-topics')) return { NAVER_BLOG_TOPICS: [{ label: '경제' }] };
    if (id.includes('preemption-supply-guards')) return { judgeAnswerCardKeyword: () => ({}), judgeEphemeralKeyword: () => ({}), listedNamesFromSeeds: () => new Set(), isListedName: () => false };
    if (id.includes('naver-blog-api')) return { getNaverBlogDocumentCount: async () => { calls++; return documentCount; } };
    if (id.includes('naver-searchad-api')) return {};
    if (id.includes('money-keywords')) return { bidKey: (s: string) => s, moneyBidOf: () => null, orderGoldenByMoney: (rows: unknown[]) => rows };
    if (id.includes('environment-manager')) return { EnvironmentManager: { getInstance: () => ({ getConfig: () => ({ naverClientId: 'fake', naverClientSecret: 'fake' }) }) } };
    return {};
  };
  const mod = { exports: {} as { main: () => Promise<void> } };
  vm.runInNewContext(source, {
    require: fakeRequire, module: mod, __dirname: path.resolve('scripts'), console: { log: () => {}, error: () => {} },
    setTimeout: (fn: () => void) => fn(),
    process: { argv: ['node', 'today-picks.js', '--warehouse=warehouse.json', '--out=output.json', '--carry=carry.json', '--measurementCache=cache.json', '--keep=1', ...extraArgs], env: {}, exit: () => {} },
  });
  return { run: () => mod.exports.main(), output: () => files.get(file('output.json'))!, calls: () => calls };
}

describe('추천 생성과 발행 경계', () => {
  it('API 실패 시 직전 파일을 보존한다', async () => {
    const h = harness(null);
    await expect(h.run()).rejects.toThrow('직전 발행본');
    expect(h.output()).toBe('LAST_GOOD_OUTPUT');
  });
  it('재사용 가능한 실측은 네이버를 재호출하지 않고 시각을 보존한다', async () => {
    const measuredAt = new Date(Date.now() - 3600000).toISOString();
    const h = harness(null, { 테스트: { count: 100, measuredAt } });
    await h.run();
    const payload = JSON.parse(h.output());
    expect(h.calls()).toBe(0);
    expect(payload.topics[0].rows[0].measuredAt).toBe(measuredAt);
    expect(payload.measurements.reused).toBe(1);
    expect(payload.round.id).toBe(rounds.roundAt().id);
  });
  it('완료한 동일 회차 재실행은 기존 본문·시각을 그대로 반환한다', async () => {
    const carry = { builtAt: '2026-09-28T00:00:00.000Z', round: rounds.roundAt(), topics: [{ topic: '경제', rows: [{ keyword: '원본' }] }] };
    const h = harness(null, {}, carry, ['--respectDone=true']);
    await h.run();
    expect(h.calls()).toBe(0);
    expect(JSON.parse(h.output())).toEqual(carry);
  });
});
