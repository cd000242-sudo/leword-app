import { describe, expect, it } from 'vitest';
const { recentHistory, updateHistory, candidatePools, selectRows, completeRound, normalizeKeyword } = require('../../../scripts/today-picks-selection');
const now = Date.parse('2026-09-28T10:30:00Z');
const date = (days: number) => new Date(now - days * 86400000).toISOString();
const row = (keyword: string, ratio = 0.5) => ({ keyword, searchVolume: 1000, documentCount: 2000, ratio });
const board = (keywords: string[], days = 1) => ({builtAt:date(days),topics:[{topic:'경제',rows:keywords.map(k=>row(k))}]});

describe('추천키워드 7일 이력과 30개 선정', () => {
 it('직전 회차뿐 아니라 두 회차 전 키워드도 기억해 A/B/A 반복을 막는다', () => {
  const previous = {...board(['어제']), history:updateHistory(board(['그제'],2), [], date(2))};
  const history = recentHistory(previous,now);
  expect(selectRows([row('그제',10),row('어제',9),row('새로운말')],history,1)[0].keyword).toBe('새로운말');
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
 it('재추천 황금이 신규 일반 후보를 밀어내지 않는다', () => {
  const history = recentHistory(board(['재추천']),now);
  const rows = selectRows([row('재추천',50),row('신규',0.1)],history,1);
  expect(rows[0]).toMatchObject({keyword:'신규',freshness:{status:'new'}});
 });
 it('신규가 부족할 때만 오래전에 추천한 순으로 채우고 실제 마지막 추천일을 표시한다', () => {
  const history = new Map([['최근',date(1)],['오래전',date(5)]]);
  const rows = selectRows([row('최근',100),row('오래전',1),row('신규')],history,3);
  expect(rows.map((r:any)=>r.keyword)).toEqual(['신규','오래전','최근']);
  expect(rows[1].freshness).toEqual({status:'repeated',lastShownAt:date(5)});
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
