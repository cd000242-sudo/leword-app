const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chooseDailyCandidates, measureDailyCandidates, applyDailyRejections } = require('./preemption-daily-candidates');
const now = Date.parse('2026-10-03T00:00:00Z');
const old = index => ({ keyword: `기존키워드${index}`, topic: index < 50 ? '비즈니스·경제' : '국내여행', measuredAt: '2026-09-01T00:00:00Z' });

test('reserves existing and fresh terms, caps 50, prioritizes finance without hiding other categories', () => {
  const board = { rows: Array.from({length: 100}, (_, index) => old(index)) };
  const briefs = { briefs: Array.from({length: 40}, (_, index) => ({coreKeyword:`새지원금${index}`,field:'지원금·복지',facts:[{publishedAt:'2026-10-02T00:00:00Z',link:'https://example.com/source'}]})) };
  const selected = chooseDailyCandidates(board, {briefs}, {}, now, 200);
  assert.equal(selected.length, 50);
  assert.equal(selected.filter(row => row.keyword.startsWith('새')).length, 20);
  assert.equal(selected.filter(row => row.topic === '국내여행').length, 9);
});
test('attempt ledger rotates rejected and failed old candidates instead of retrying same 30 forever', () => {
  const board = {rows:[old(1),old(2)]};
  assert.deepEqual(chooseDailyCandidates(board, {}, {'기존키워드1':'2026-10-02T23:00:00Z'}, now).map(row=>row.keyword),['기존키워드2']);
});
test('measurement failure, unrelated response, censored volume and missing documents never reuse old numbers', async () => {
  for (const volume of [async()=>{throw Error('quota');}, async()=>[{keyword:'different',pcSearchVolume:50,mobileSearchVolume:50}], async()=>[{keyword:'기존키워드1',pcSearchVolume:0,mobileSearchVolume:50,pcSearchVolumeLt10:true}]]) {
    const source = old(1);
    const result = await measureDailyCandidates([source], {volume,documents:async()=>100}, {},()=>now);
    assert.deepEqual(result.rows,[]);
    assert.equal(source.measuredAt,'2026-09-01T00:00:00Z');
  }
  const result = await measureDailyCandidates([old(1)],{volume:async()=>[{keyword:'기존키워드1',pcSearchVolume:100,mobileSearchVolume:50}],documents:async()=>null},{},()=>now);
  assert.deepEqual(result.rows,[]);
});
test('fresh candidate contains only new metrics, never old SERP or old seasonal claims', async () => {
  const source = {...old(1),serp:{exactTitleHits:0},tier:'SSS',timing:'지금 신청',demandAsOf:'2025-01'};
  const result = await measureDailyCandidates([source],{volume:async()=>[{keyword:source.keyword,pcSearchVolume:100,mobileSearchVolume:50}],documents:async()=>70},{},()=>now);
  assert.equal(result.rows[0].searchVolume,150);
  assert.equal(result.rows[0].measuredAt,new Date(now).toISOString());
  assert.equal(result.rows[0].searchVolumeMeasuredAt,new Date(now).toISOString());
  assert.equal(result.rows[0].documentCountMeasuredAt,new Date(now).toISOString());
  assert.equal(result.rows[0].serp,undefined);
  assert.equal(result.rows[0].tier,undefined);
  assert.equal(result.rows[0].timing,undefined);
  assert.equal(source.measuredAt,'2026-09-01T00:00:00Z');
});
test('confirmed insufficient demand is recorded even when no SERP candidate survives', async () => {
  const result = await measureDailyCandidates([old(1)],{minVolume:500,
    volume:async()=>[{keyword:'기존키워드1',pcSearchVolume:0,mobileSearchVolume:0}],
    documents:async()=>{throw Error('must not query documents');}},{},()=>now);
  assert.equal(result.rows.length,0);
  assert.equal(result.rejected[0].keyword,'기존키워드1');
});
test('reject only confirmed current evidence; preserve timestamps and later successful measurements', () => {
  const board = {publishedAt:'2026-09-01T00:00:00Z',rows:[old(1),old(2),{...old(3),measuredAt:'2026-10-03T00:00:00Z'},old(4)]};
  const reviews = [{keyword:'기존키워드1',checkedAt:'2026-10-02T23:00:00Z',reason:'수요 미달'},
    {keyword:'기존키워드3',checkedAt:'2026-10-02T23:00:00Z',reason:'과거 거절'}];
  const batch = {rejections:[{keyword:'기존키워드2',measuredAt:'2026-10-02T23:00:00Z',undetermined:true,serp:{sampledTitles:10,exactTitleHits:10}},
    {keyword:'기존키워드4',measuredAt:'2026-10-02T23:00:00Z',undetermined:false,serp:{sampledTitles:10,exactTitleHits:10}}]};
  const result = applyDailyRejections(board,reviews,batch,now);
  assert.equal(result.changed,2);
  assert.equal(result.board.rows[0].revalidation.status,'rejected');
  assert.equal(result.board.rows[1].revalidation,undefined);
  assert.equal(result.board.rows[2].revalidation,undefined);
  assert.equal(result.board.rows[3].revalidation.status,'rejected');
  assert.equal(result.board.publishedAt,board.publishedAt);
  assert.equal(result.board.revalidatedAt,'2026-10-02T23:00:00.000Z');
  assert.equal(result.board.rows[0].measuredAt,board.rows[0].measuredAt);
  assert.equal(board.rows[0].revalidation,undefined);
  const unchanged = applyDailyRejections(board,[],{rejections:[batch.rejections[0]]},now);
  assert.equal(unchanged.changed,0);
  assert.equal(unchanged.board.revalidatedAt,undefined);
  assert.equal(unchanged.board,board);
});
test('daily workflow serializes with full publication and shares existing paid cap and ledger', () => {
  const fs = require('node:fs');
  const workflow = fs.readFileSync(require('node:path').join(__dirname,'../.github/workflows/preemption-daily.yml'),'utf8');
  const full = fs.readFileSync(require('node:path').join(__dirname,'../.github/workflows/preemption-board.yml'),'utf8');
  for (const key of ['group', 'LEWORD_BRIGHTDATA_FREE_CEILING', 'LEWORD_BRIGHTDATA_PAID_OVERAGE', 'LEWORD_BRIGHTDATA_FEATURE_CAPS', 'LEWORD_BRIGHTDATA_QUOTA_STATE_FILE']) {
    const pattern = new RegExp(`^\\s*${key}:\\s*(.+)$`,'m');
    assert.equal(workflow.match(pattern)?.[1],full.match(pattern)?.[1]);
  }
  assert.match(workflow,/--maxPerRun=100/);
  assert.match(workflow,/if: always\(\)[\s\S]*data\/brightdata-quota-state.json/);
  const script = fs.readFileSync(require('node:path').join(__dirname,'preemption-daily-candidates.js'),'utf8');
  assert.match(script,/getNaverSearchAdKeywordVolume\(searchAd, \[keyword\], \{ forceFresh: true \}\)/);
  assert.match(script,/getNaverBlogDocumentCount\(keyword, \{ config: openApi, forceFresh: true \}\)/);
});
test('daily empty verification leaves last successful publication byte-for-byte unchanged', () => {
  const fs = require('node:fs'), path = require('node:path');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'leword-daily-'));
  const input = path.join(dir,'input.json'), output = path.join(dir,'board.json');
  const previous = JSON.stringify({publishedAt:'2026-09-01T00:00:00Z',rows:[old(1)]});
  try {
    fs.writeFileSync(input,JSON.stringify({generator:'preemption-board-batch',rows:[],rejections:[]}));
    fs.writeFileSync(output,previous);
    const result = require('node:child_process').spawnSync(process.execPath,
      [path.join(__dirname,'publish-preemption-board.js'),`--in=${input}`,`--dest=${output}`,'--requireFreshRows'],
      {encoding:'utf8',timeout:15000,cwd:path.join(__dirname,'..')});
    assert.equal(result.status,4,result.stderr);
    assert.equal(fs.readFileSync(output,'utf8'),previous);
  } finally {
    for (const file of [input,output]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});
test('public projection preserves full-round legacy fallback and explicit unknown dates', () => {
  const {toPublicRow} = require('./publish-preemption-board');
  const legacy = {keyword:'지원금 신청',topic:'비즈니스·경제',measuredAt:'2026-10-03T00:00:00Z',searchVolume:1000,documentCount:100};
  const publicLegacy = JSON.parse(JSON.stringify(toPublicRow(legacy)));
  assert.equal(Object.hasOwn(publicLegacy,'searchVolumeMeasuredAt'),false);
  assert.equal(Object.hasOwn(publicLegacy,'documentCountMeasuredAt'),false);
  assert.equal(publicLegacy.measuredAt,legacy.measuredAt);
  const publicUnknown = JSON.parse(JSON.stringify(toPublicRow({...legacy,searchVolumeMeasuredAt:null,documentCountMeasuredAt:null})));
  assert.equal(publicUnknown.searchVolumeMeasuredAt,null);
  assert.equal(publicUnknown.documentCountMeasuredAt,null);
  const publicDaily = toPublicRow({...legacy,searchVolumeMeasuredAt:legacy.measuredAt,documentCountMeasuredAt:legacy.measuredAt});
  assert.equal(publicDaily.searchVolumeMeasuredAt,legacy.measuredAt);
  assert.equal(publicDaily.documentCountMeasuredAt,legacy.measuredAt);
});
test('daily publication cannot mask the scheduled full round; legacy boards still work', async () => {
  const {publicationMetadata} = require('./publish-preemption-board');
  const {readPublishedAt,roundAlreadyDone} = require('./board-round-done');
  const fullAt = '2026-10-01T23:00:00Z', dailyAt = '2026-10-02T00:00:00Z';
  const daily = publicationMetadata({publishedAt:fullAt},dailyAt,'daily');
  assert.equal(daily.lastFullPublishedAt,fullAt);
  assert.equal(publicationMetadata(daily,'2026-10-03T00:00:00Z','daily').lastFullPublishedAt,fullAt);
  assert.equal(publicationMetadata(daily,dailyAt,'full').lastFullPublishedAt,dailyAt);
  const read = data => readPublishedAt('https://example.com/board','lastFullPublishedAt',async()=>({ok:true,json:async()=>data}));
  assert.equal((await read({publishedAt:fullAt})).value,fullAt);
  assert.equal((await read({publicationMode:'daily',publishedAt:dailyAt})).value,null);
  assert.equal((await read(daily)).value,fullAt);
  const delayedMonday = publicationMetadata({publishedAt:'2026-10-01T23:00:00Z'},'2026-10-04T23:00:00Z','daily');
  assert.equal(roundAlreadyDone((await read(delayedMonday)).value,['04:23'],Date.parse('2026-10-05T00:00:00Z')),false);
});
