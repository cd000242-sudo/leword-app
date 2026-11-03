import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { isGoldenSss } from '../grade';

const rounds = require('../../../scripts/today-picks-rounds');
const source = fs.readFileSync(path.resolve(__dirname, '../../../scripts/today-picks.js'), 'utf8');

function harness(documentCount: number | null, cache: Record<string, unknown> = {}, carry: unknown = null, extraArgs: string[] = [], seeds = [{ keyword: '테스트', searchVolume: 1000, source: 'hint' }], keepArg = '--keep=1', goldenBoard: unknown = null, extraFiles: Record<string, string> = {}, overrides: Record<string, unknown> = {}) {
  const files = new Map<string, string>();
  const file = (name: string) => path.resolve(name);
  files.set(file('warehouse.json'), JSON.stringify({ seeds }));
  files.set(file('cache.json'), JSON.stringify(cache));
  if (carry) files.set(file('carry.json'), JSON.stringify(carry));
  if (goldenBoard) files.set(file('golden.json'), JSON.stringify(goldenBoard));
  files.set(file('output.json'), 'LAST_GOOD_OUTPUT');
  for (const [name, value] of Object.entries(extraFiles)) files.set(file(name), value);
  let calls = 0;
  const fakeFs = {
    existsSync: (p: string) => files.has(p),
    readdirSync: (dir: string) => [...files.keys()].filter((p) => path.dirname(p) === path.resolve(dir)).map((p) => path.basename(p)),
    readFileSync: (p: string) => files.get(p),
    writeFileSync: (p: string, value: string) => files.set(p, value),
    mkdirSync: () => {},
    renameSync: (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); },
  };
  const fakeRequire: any = (id: string) => {
    for (const [fragment, value] of Object.entries(overrides)) if (id.includes(fragment)) return value;
    if (id === 'fs') return fakeFs;
    if (id === 'path') return path;
    if (id.includes('load-project-env')) return { loadProjectEnv: () => {} };
    if (id.includes('today-picks-rounds')) return rounds;
    if (id.includes('today-picks-selection')) return require('../../../scripts/today-picks-selection');
    if (id.includes('today-picks-expand')) return require('../../../scripts/today-picks-expand');
    if (id.includes('today-picks-inventory')) return require('../../../scripts/today-picks-inventory');
    if (id.includes('today-picks-related')) return require('../../../scripts/today-picks-related');
    if (id === '../src/utils/grade') return { isGoldenSss };
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
    process: { argv: ['node', 'today-picks.js', '--warehouse=warehouse.json', '--out=output.json', '--carry=carry.json', '--measurementCache=cache.json', goldenBoard ? '--goldenBoard=golden.json' : '', keepArg, ...extraArgs].filter(Boolean), env: {}, exit: () => {} },
  });
  return { run: () => mod.exports.main(), output: () => files.get(file('output.json'))!, calls: () => calls, file: (name: string) => files.get(file(name))! };
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
    expect(payload.novelty).toMatchObject({windowDays:7,newCount:30,repeatedCount:0});
    expect(payload.history.entries).toHaveLength(30);
  });
  it('새 회차가 지난 7일 이력을 이어받는다 — 이력에만 있고 직전 판 행이 아닌 말은 신규가 차면 재지 않는다', async () => {
    const oldDate=new Date(Date.now()-2*86400000).toISOString();
    const carry={builtAt:new Date(Date.now()-86400000).toISOString(),topics:[{topic:'경제',rows:[{keyword:'직전말'}]}],history:{windowDays:7,entries:[{keyword:'그제말',lastShownAt:oldDate}]}};
    const h=harness(2000,{},carry,[],[{keyword:'그제말',searchVolume:10000,source:'hint'},{keyword:'새말',searchVolume:1000,source:'hint'}]);
    await h.run();
    const result=JSON.parse(h.output());
    expect(result.topics[0].rows[0].keyword).toBe('새말');
    expect(result.history.entries.find((e:any)=>e.keyword==='그제말').lastShownAt).toBe(oldDate);
  });
  it('직전 판 황금과 선점 보드 황금을 먼저 잰다 — 24시간 안 실측은 재사용, 오래된 것은 다시 재고, 황금이 차면 창고 후보는 안 잰다(2026-09-29)', async () => {
    const fresh=new Date(Date.now()-3600000).toISOString();
    const stale=new Date(Date.now()-3*86400000).toISOString();
    // 직전 판은 오늘(KST) 앞 회차 — '1시간 전'으로 두면 자정 직후엔 어제 판이 되어 전날 중복 금지(2026-10-10)에 막힌다
    const carry={builtAt:new Date().toISOString(),topics:[{topic:'경제',rows:[{keyword:'어제황금',searchVolume:3000,documentCount:1000,ratio:3,measuredAt:fresh,depth:1,comp:null,source:'biztp'}]}],history:{windowDays:7,entries:[]}};
    const goldenBoard={publishedAt:stale,rows:[{keyword:'보드황금',topic:'경제',searchVolume:2000,documentCount:500}]};
    const h=harness(400,{},carry,[],[{keyword:'창고말',searchVolume:9000,source:'hint'}],'--keep=2',goldenBoard);
    await h.run();
    const result=JSON.parse(h.output());
    expect(h.calls()).toBe(1); // 보드황금만 다시 잰다(3일 전) — 어제황금은 1시간 전 실측 재사용, 창고말은 황금 2개가 차서 안 잰다
    expect(result.topics[0].rows.map((r:any)=>[r.keyword,r.documentCount,r.source])).toEqual([['보드황금',400,'preemption'],['어제황금',1000,'biztp']]);
    // 2026-10-13: 오늘 앞 회차에 실린 말은 재추천이 아니다(같은 날 회차끼리 이어 싣기) — 어제 이전에 실린 것만 재추천 표시
    expect(result.topics[0].rows[1].freshness.status).toBe('new');
    expect(result.topics[0]).toMatchObject({golden:2,priorGolden:2});
    expect(result.novelty).toMatchObject({windowDays:7,newCount:2,repeatedCount:0});
  });
  // 2026-10-13 재추천 금지 — 모자라면 재추천으로 채우지 않고 목표 미달을 그대로 보인다
  it('후보 부족 시 목표 미달을 숨기지 않는다(재추천으로 채우지 않는다)', async () => {
    // 9일 전 판 — 최근 7일 안이면 재추천 금지(2026-10-13)로 '테스트'가 아예 빠진다
    const carry={builtAt:new Date(Date.now()-9*86400000).toISOString(),topics:[{topic:'경제',rows:[{keyword:'테스트'}]}]};
    const h=harness(100,{},carry,[],undefined,'');
    await h.run();
    const result=JSON.parse(h.output());
    expect(result.topics[0]).toMatchObject({targetCount:30,shortfall:29});
    expect(result.novelty).toMatchObject({windowDays:7,newCount:1,repeatedCount:0});
  });

  // 2026-10-10 사장님 "매일 전날과 중복 없이, 매일 새롭게" · "앱에서 버튼 누르면 알아서 새롭게"
  it('어제(KST) 실린 말은 황금이어도 다시 싣지 않고, 일자별 기록을 판에 남긴다', async () => {
    const yesterday=new Date(Date.now()-86400000).toISOString();
    const carry={builtAt:yesterday,topics:[{topic:'경제',rows:[{keyword:'어제황금',searchVolume:3000,documentCount:1000,ratio:3,measuredAt:yesterday,depth:1,comp:null,source:'biztp'}]}],history:{windowDays:7,entries:[]}};
    const h=harness(400,{},carry,[],[{keyword:'어제황금',searchVolume:9000,source:'hint'},{keyword:'새말',searchVolume:1000,source:'hint'}],'--keep=2');
    await h.run();
    const result=JSON.parse(h.output());
    expect(result.topics[0].rows.map((r:any)=>r.keyword)).toEqual(['새말']);
    const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
    expect(result.history.days[today]).toEqual(['새말']);
    expect(result.novelty.blockedYesterday).toBe(1);
  });
  it('새 키워드로 다시 올리기(--fresh=true)는 오늘 이미 실린 말까지 빼고 다시 고른다', async () => {
    const now=new Date().toISOString();
    const carry={builtAt:now,topics:[{topic:'경제',rows:[{keyword:'오늘말',searchVolume:3000,documentCount:1000,ratio:3,measuredAt:now,depth:1,comp:null,source:'biztp'}]}],history:{windowDays:7,entries:[]}};
    const seeds=[{keyword:'오늘말',searchVolume:9000,source:'hint'},{keyword:'다른말',searchVolume:1000,source:'hint'}];
    const normal=harness(400,{},carry,[],seeds,'--keep=2');
    await normal.run();
    expect(JSON.parse(normal.output()).topics[0].rows.map((r:any)=>r.keyword)).toContain('오늘말');
    const fresh=harness(400,{},carry,['--fresh=true'],seeds,'--keep=2');
    await fresh.run();
    expect(JSON.parse(fresh.output()).topics[0].rows.map((r:any)=>r.keyword)).toEqual(['다른말']);
  });
  // 2026-10-11 사장님 "황금키워드는 하나도 안 보이네" → "어제만 피하고 그제 황금은 다시"
  it('보관함(--archive)의 그제 황금은 다시 재서 싣고, 어제 판의 말은 보관함에 있어도 막는다', async () => {
    const kstDayAgo = (n: number) => new Date(Date.now() + 9 * 3600000 - n * 86400000).toISOString().slice(0, 10);
    const old = new Date(Date.now() - 3 * 86400000).toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const archived = (builtAt: string, keyword: string) => JSON.stringify({ builtAt, topics: [{ topic: '경제', rows: [{ keyword, searchVolume: 2000, documentCount: 500, ratio: 4, measuredAt: builtAt }] }] });
    const carry = { builtAt: yesterday, topics: [{ topic: '경제', rows: [{ keyword: '어제말', searchVolume: 2000, documentCount: 500, ratio: 4, measuredAt: yesterday }] }], history: { windowDays: 7, entries: [] } };
    const files = { [`archive/${kstDayAgo(2)}.json`]: archived(new Date(Date.now() - 2 * 86400000).toISOString(), '그제황금'), [`archive/${kstDayAgo(1)}.json`]: archived(yesterday, '어제말'), 'archive/index.json': '{}' };
    const h = harness(400, {}, carry, ['--archive=archive'], [{ keyword: '창고말', searchVolume: 900, source: 'hint' }], '--keep=3', undefined, files);
    await h.run();
    const result = JSON.parse(h.output());
    const keywords = result.topics[0].rows.map((r: any) => r.keyword);
    expect(keywords).toContain('그제황금');
    expect(keywords).not.toContain('어제말');
    expect(result.topics[0].rows.find((r: any) => r.keyword === '그제황금')).toMatchObject({ documentCount: 400, ratio: 5 });
    void old;
  });
  // 2026-10-11 연관어 확장 — 황금이 모자라면 그날 황금(없으면 큰 후보)을 씨앗으로 검색광고 연관어를 받아 문서 수만 잰다
  it('연관어 확장(--expandSeeds) — 씨앗 낱말을 담은 연관어를 재서 황금이면 "related" 출처로 싣는다', async () => {
    const asked: string[] = [];
    const searchad = {
      getNaverSearchAdBidPairs: async () => new Map(),
      getNaverSearchAdKeywordSuggestions: async (_cfg: unknown, seed: string) => { asked.push(seed); return [
        { keyword: `${seed} 일정`, totalSearchVolume: 3000 }, { keyword: '엉뚱한말', totalSearchVolume: 9000 }, { keyword: `${seed} 후기`, totalSearchVolume: 200 },
      ]; },
    };
    const env = { EnvironmentManager: { getInstance: () => ({ getConfig: () => ({ naverClientId: 'fake', naverClientSecret: 'fake', naverSearchAdAccessLicense: 'fake', naverSearchAdSecretKey: 'fake' }) }) } };
    const h = harness(1000, {}, null, ['--expandSeeds=2', '--expandMeasure=10'], [{ keyword: '창고씨앗', searchVolume: 900, source: 'hint' }], '--keep=3', undefined, {}, { 'naver-searchad-api': searchad, 'environment-manager': env });
    await h.run();
    const rows = JSON.parse(h.output()).topics[0].rows;
    expect(asked).toEqual(['창고씨앗']);
    expect(rows.map((r: any) => [r.keyword, r.source, r.ratio])).toEqual([['창고씨앗 일정', 'related', 3], ['창고씨앗', 'hint', 0.9]]);
    expect(JSON.parse(h.output()).topics[0].expandedGolden).toBe(1);
  });
  // 2026-10-11 사장님 "황금이 많아야 돼" — 황금 재고(문서 수 14일 기억)의 황금을 다시 재서 싣고, 잰 것은 재고에 남긴다
  it('황금 재고(--inventory)의 황금은 다시 재서 싣고, 이번에 잰 것은 재고에 저장한다', async () => {
    const twoDays = new Date(Date.now() - 2 * 86400000).toISOString();
    const inventory = JSON.stringify({ entries: { 재고황금: { keyword: '재고황금', documentCount: 300, measuredAt: twoDays, searchVolume: 3000, topic: '경제', source: 'hint' } } });
    const h = harness(500, {}, null, ['--inventory=inv/inventory.json'], [{ keyword: '창고말', searchVolume: 900, source: 'hint' }], '--keep=3', undefined, { 'inv/inventory.json': inventory });
    await h.run();
    const rows = JSON.parse(h.output()).topics[0].rows;
    expect(rows.find((r: any) => r.keyword === '재고황금')).toMatchObject({ documentCount: 500, ratio: 6 });
    const saved = JSON.parse(h.file('inv/inventory.json'));
    expect(saved.entries['재고황금'].documentCount).toBe(500);
    expect(saved.entries['창고말']).toMatchObject({ documentCount: 500, topic: '경제' });
  });
});
