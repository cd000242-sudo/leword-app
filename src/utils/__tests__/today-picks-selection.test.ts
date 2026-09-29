import { describe, expect, it } from 'vitest';
const { recentHistory, updateHistory, candidatePools, selectRows, completeRound, normalizeKeyword, priorGoldenRows } = require('../../../scripts/today-picks-selection');
const now = Date.parse('2026-09-28T10:30:00Z');
const date = (days: number) => new Date(now - days * 86400000).toISOString();
const row = (keyword: string, ratio = 0.5) => ({ keyword, searchVolume: 1000, documentCount: 2000, ratio });
const board = (keywords: string[], days = 1) => ({builtAt:date(days),topics:[{topic:'경제',rows:keywords.map(k=>row(k))}]});

describe('추천키워드 7일 이력과 30개 선정', () => {
 it('일반 후보는 직전 회차뿐 아니라 두 회차 전 키워드도 기억해 A/B/A 반복을 막는다', () => {
  const previous = {...board(['어제']), history:updateHistory(board(['그제'],2), [], date(2))};
  const history = recentHistory(previous,now);
  expect(selectRows([row('그제',0.9),row('어제',0.8),row('새로운말')],history,1)[0].keyword).toBe('새로운말');
 });
 it('7일 이상 지난 이력과 미래·잘못된 시각은 추천 제외에 쓰지 않는다', () => {
  const history = recentHistory({history:{entries:[{keyword:'지난말',lastShownAt:date(7)},{keyword:'최근말',lastShownAt:date(6)},{keyword:'미래말',lastShownAt:date(-1)},{keyword:'오류말',lastShownAt:'bad'}]}},now);
  expect([...history.keys()]).toEqual(['최근말']);
 });
 it('공백·대소문자·전각만 다른 후보는 한 번만 재고 30개를 고른다', () => {
  const seeds = Array.from({length:40},(_,i)=>row(`후보 ${i}`));
  const pools = candidatePools([row('ＡＢＣ'),row('abc'),row('후보0'),...seeds],new Map(),120);
  expect(normalizeKeyword('Ａ ＢＣ')).toBe('abc');
  const selected = selectRows(pools.fresh,new Map(),30);
  expect(selected).toHaveLength(30);
  expect(new Set(selected.map((r:any)=>normalizeKeyword(r.keyword))).size).toBe(30);
 });
 it('황금은 7일 이력 예외 — 어제 추천한 황금이라도 신규 일반 후보보다 앞에 두고 재추천 표시는 남긴다(사장님 2026-09-29 "황금 비중")', () => {
  const history = recentHistory(board(['재추천']),now);
  const rows = selectRows([row('재추천',50),row('신규',0.1)],history,2);
  expect(rows.map((r:any)=>r.keyword)).toEqual(['재추천','신규']);
  expect(rows[0].freshness).toEqual({status:'repeated',lastShownAt:date(1)});
 });
 it('일반 후보는 신규를 먼저, 부족할 때만 오래전에 추천한 순으로 채우고 실제 마지막 추천일을 표시한다', () => {
  const history = new Map([['최근',date(1)],['오래전',date(5)]]);
  const rows = selectRows([row('최근',0.9),row('오래전',0.8),row('신규')],history,3);
  expect(rows.map((r:any)=>r.keyword)).toEqual(['신규','오래전','최근']);
  expect(rows[1].freshness).toEqual({status:'repeated',lastShownAt:date(5)});
 });
 it('직전 판의 황금과 선점 보드의 황금(비율 1+)을 주제별 선측정 후보로 모은다 — 직전 판이 먼저, 같은 말은 한 번', () => {
  const carried = {builtAt:date(1),topics:[{topic:'경제',rows:[
   {keyword:'어제황금',searchVolume:3000,documentCount:1000,ratio:3,measuredAt:date(1),depth:2,comp:'중간',source:'biztp',money:{value:500}},
   {keyword:'어제채움',searchVolume:3000,documentCount:90000,ratio:0.03,measuredAt:date(1),source:'biztp'},
  ]},{topic:'맛집',rows:[{keyword:'딴주제',searchVolume:3000,documentCount:10,ratio:300,measuredAt:date(1)}]}]};
  const goldenBoard = {publishedAt:date(3),rows:[
   {keyword:'보드황금',topic:'경제',searchVolume:2000,documentCount:500,tier:'golden-ratio'},
   {keyword:'어제 황금',topic:'경제',searchVolume:3000,documentCount:1000},
   {keyword:'보드레드',topic:'경제',searchVolume:2000,documentCount:20000},
   {keyword:'문서수없음',topic:'경제',searchVolume:2000,documentCount:0},
  ]};
  const rows = priorGoldenRows(carried,goldenBoard,'경제',1);
  expect(rows.map((r:any)=>r.keyword)).toEqual(['어제황금','보드황금']);
  expect(rows[0]).toEqual({keyword:'어제황금',searchVolume:3000,documentCount:1000,measuredAt:date(1),depth:2,comp:'중간',source:'biztp'});
  expect(rows[1]).toEqual({keyword:'보드황금',searchVolume:2000,documentCount:500,measuredAt:date(3),depth:null,comp:null,source:'preemption'});
  expect(priorGoldenRows(null,null,'경제',1)).toEqual([]);
 });
 it('발행 이력은 기존 추천일을 보존하고 이번 추천만 현재 시각으로 갱신한다', () => {
  const updated = updateHistory(board(['이전'],1),[row('신규')],date(0));
  expect(updated).toEqual({windowDays:7,entries:[{keyword:'신규',lastShownAt:date(0)},{keyword:'이전',lastShownAt:date(1)}]});
 });
 it('신규 후보와 재추천 후보 예산을 분리해 신규 실측 실패 시 보충할 수 있다', () => {
  const history = recentHistory(board(['기존']),now);
  const pools = candidatePools([...Array.from({length:150},(_,i)=>row(`신규${i}`)),row('기존')],history,120);
  expect(pools.fresh).toHaveLength(120);
  expect(pools.repeated.map((r:any)=>r.keyword)).toEqual(['기존']);
 });
 it('구형 10개 또는 이력 없는 같은 회차는 30개 완료로 처리하지 않는다', () => {
  const old = {...board(['기존']), round:{id:'now'},keep:10};
  expect(completeRound(old,'now',30)).toBe(false);
  expect(completeRound({...old,keep:30},'now',30)).toBe(false);
  const done = {...old,keep:30,selectionVersion:2,history:{windowDays:7,entries:[]}};
  expect(completeRound(done,'now',30)).toBe(true);
  expect(completeRound(done,'next',30)).toBe(false);
 });
 it('워크플로 사전 검사도 구형 회차·통신 실패를 완료로 오인하지 않는다', async () => {
  const {readCompletedRound}=require('../../../scripts/today-picks-done');
  const {roundAt}=require('../../../scripts/today-picks-rounds');
  const old={...board(['기존']),round:roundAt(now),keep:10};
  expect(await readCompletedRound('https://example.com/picks',30,async()=>({ok:true,json:async()=>old}),now)).toBe(false);
  const current={...old,keep:30,selectionVersion:2,history:{windowDays:7,entries:[]}};
  expect(await readCompletedRound('https://example.com/picks',30,async()=>({ok:true,json:async()=>current}),now)).toBe(true);
  expect(await readCompletedRound('https://example.com/picks',30,async()=>{throw new Error('offline')},now)).toBe(false);
 });
});
