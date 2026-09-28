import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const rounds = require('../../../scripts/today-picks-rounds');
const source = fs.readFileSync(path.resolve(__dirname, '../../../scripts/today-picks.js'), 'utf8');

function harness(documentCount: number | null, cache: Record<string, unknown> = {}, carry: unknown = null, extraArgs: string[] = [], seeds = [{ keyword: '테스트', searchVolume: 1000, source: 'hint' }], keepArg = '--keep=1') {
  const files = new Map<string, string>();
  const file = (name: string) => path.resolve(name);
  files.set(file('warehouse.json'), JSON.stringify({ seeds }));
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
    if (id.includes('today-picks-selection')) return require('../../../scripts/today-picks-selection');
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
    process: { argv: ['node', 'today-picks.js', '--warehouse=warehouse.json', '--out=output.json', '--carry=carry.json', '--measurementCache=cache.json', keepArg, ...extraArgs].filter(Boolean), env: {}, exit: () => {} },
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
    const carry = { builtAt: '2026-09-28T00:00:00.000Z', round: rounds.roundAt(), keep:1, selectionVersion:2, history:{windowDays:7,entries:[]}, topics: [{ topic: '경제', rows: [{ keyword: '원본' }] }] };
    const h = harness(null, {}, carry, ['--respectDone=true']);
    await h.run();
    expect(h.calls()).toBe(0);
    expect(JSON.parse(h.output())).toEqual(carry);
  });
  it('기본 생성은 중복 없는 30개이며 7일 이력을 함께 발행한다', async () => {
    const seeds = Array.from({length:40},(_,i)=>({keyword:`후보${i}`,searchVolume:1000,source:'hint'}));
    const h = harness(100,{},null,[],seeds,'');
    await h.run();
    const payload=JSON.parse(h.output());
    expect(payload.keep).toBe(30);
    expect(payload.topics[0].rows).toHaveLength(30);
    expect(payload.novelty).toEqual({windowDays:7,newCount:30,repeatedCount:0});
    expect(payload.history.entries).toHaveLength(30);
  });
  it('새 회차가 지난 7일 이력을 이어받고 신규를 재추천 황금보다 먼저 선정한다', async () => {
    const oldDate=new Date(Date.now()-2*86400000).toISOString();
    const carry={builtAt:new Date(Date.now()-86400000).toISOString(),topics:[{topic:'경제',rows:[{keyword:'직전말'}]}],history:{windowDays:7,entries:[{keyword:'그제말',lastShownAt:oldDate}]}};
    const h=harness(2000,{},carry,[],[{keyword:'그제말',searchVolume:10000,source:'hint'},{keyword:'새말',searchVolume:1000,source:'hint'}]);
    await h.run();
    const result=JSON.parse(h.output());
    expect(result.topics[0].rows[0].keyword).toBe('새말');
    expect(result.history.entries.find((e:any)=>e.keyword==='그제말').lastShownAt).toBe(oldDate);
  });
  it('후보 부족 시 목표 미달과 재추천을 숨기지 않는다', async () => {
    const carry={builtAt:new Date(Date.now()-86400000).toISOString(),topics:[{topic:'경제',rows:[{keyword:'테스트'}]}]};
    const h=harness(100,{},carry,[],undefined,'');
    await h.run();
    const result=JSON.parse(h.output());
    expect(result.topics[0]).toMatchObject({targetCount:30,shortfall:29});
    expect(result.novelty).toEqual({windowDays:7,newCount:0,repeatedCount:1});
  });
});
