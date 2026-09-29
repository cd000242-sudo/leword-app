import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const { collectCurrentSeeds, reserveCurrentSeeds, prioritizeCurrentSample, exactMeasuredVolume } = require('../../../scripts/preemption-current-sources');
const now = Date.parse('2026-09-28T10:00:00Z');
const date = (days: number) => new Date(now - days * 86400000).toISOString();
const brief = (keyword: string, days = 1) => ({coreKeyword:keyword,keywords:[keyword],field:'지원금·복지',facts:[{publishedAt:date(days),link:'https://example.org/source'}]});
describe('황금 후보의 현재 이슈 공급', () => {
 it('최근 출처가 있는 실제 키워드만 받고 수치나 접미어를 생성하지 않는다', () => {
  const rows=collectCurrentSeeds({briefs:{briefs:[brief('소상공인 지원금'),brief('오래된 지원금',8),brief('미래 지원금',-1),{...brief('출처 없는 지원금'),facts:[]}]},nowMs:now});
  expect(rows).toEqual([{keyword:'소상공인 지원금',topic:'비즈니스·경제',kind:'current-brief',sourceAt:date(1),sourceUrl:'https://example.org/source'}]);
  expect(rows[0].searchVolume).toBeUndefined();
 });
 it('게시판 갱신 시각으로 오래된 기사 날짜를 덮지 않는다',()=>{
  expect(collectCurrentSeeds({briefs:{builtAt:date(0),briefs:[brief('오래된 지원금',8)]},nowMs:now})).toEqual([]);
 });
 it('손상된 소스·날짜·URL은 현재 이슈로 승격하지 않는다',()=>{
  expect(collectCurrentSeeds({nowMs:now})).toEqual([]);
  const invalid=brief('청년 지원금');
  expect(collectCurrentSeeds({briefs:{briefs:[{...invalid,facts:[{publishedAt:'bad',link:'https://example.org'}]},{...invalid,facts:[{publishedAt:date(0),link:'javascript:alert(1)'}]}]},nowMs:now})).toEqual([]);
 });
 it('15자 초과 씨앗은 잘라 다른 말로 만들지 않고 제외하며 공백 중복을 합친다',()=>{
  const rows=collectCurrentSeeds({briefs:{briefs:[brief('청년 지원금'),brief('청년지원금'),brief('가나다라마바사아자차카타파하가나')]},nowMs:now});
  expect(rows.map((r:any)=>r.keyword)).toEqual(['청년 지원금']);
 });
 it('실시간 금융 이슈는 신선한 스냅샷에서만 가져온다',()=>{
  const signals={collectedAt:date(0),source:'naver-signal.bz',lanes:[{items:[{keyword:'금리 인하'},{keyword:'연예인 이름'}]}]};
  expect(collectCurrentSeeds({signals,nowMs:now}).map((r:any)=>r.keyword)).toEqual(['금리 인하']);
  expect(collectCurrentSeeds({signals:{...signals,collectedAt:date(2)},nowMs:now})).toEqual([]);
 });
 it('동적 씨앗은 기존 씨앗에 더해지고 창고·계절 씨앗을 밀어내지 않는다(사장님 2026-09-29 정정)',()=>{
  // 09-28 판은 existing.length 로 잘라 '기존3'(꼬리의 창고·계절 씨앗)을 버렸다
  expect(reserveCurrentSeeds(['기존1','기존2','기존3'],['신규','기존1'],2)).toEqual(['신규','기존1','기존2','기존3']);
  expect(reserveCurrentSeeds(['기존1'],['신규1','신규2','신규3'],2)).toEqual(['신규1','신규2','기존1']);
  expect(reserveCurrentSeeds(['기존1','기존2'],[],12)).toEqual(['기존1','기존2']);
 });
 it('발굴 스크립트는 비즈니스·경제 창고 몫을 두 배로 파고 계절 갈래를 현재 이슈와 같은 앞줄에 세운다',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../../../scripts/preemption-candidates.js'),'utf8');
  expect(script).toContain("topic === '비즈니스·경제' ? dbSeedsPerTopic * ECONOMY_SEED_MULTIPLIER : dbSeedsPerTopic");
  expect(script).toContain('const ECONOMY_SEED_MULTIPLIER = 2;');
  expect(script).toContain("startsWith('current-') || row.seedKind === 'seasonal'");
  expect(script).toContain('.sort((a, b) => frontLane(b) - frontLane(a)');
 });
 it('지원금이 앞에 15개 있어도 경제·비즈니스·주거 후보에 측정 자리를 남긴다',()=>{
  const support=Array.from({length:15},(_,i)=>brief(`지원금 ${i}`));
  const rows=collectCurrentSeeds({briefs:{briefs:[...support,{...brief('청년창업사관학교'),field:'비즈니스·소상공인'},{...brief('은행 영업시간'),field:'경제·금융'},{...brief('전세 대출 조건'),field:'생활경제·부동산'}]},nowMs:now}).slice(0,12);
  expect(rows.map((r:any)=>r.keyword)).toEqual(expect.arrayContaining(['청년창업사관학교','은행 영업시간','전세 대출 조건']));
 });
 it('PC·모바일 정확 실측만 더하고 미측정이나 <10 범위를 0으로 바꾸지 않는다',()=>{
  expect(exactMeasuredVolume({keyword:'측정한 키워드',pcSearchVolume:120,mobileSearchVolume:880})).toBe(1000);
  expect(exactMeasuredVolume({pcSearchVolume:null,mobileSearchVolume:880})).toBeNull();
  expect(exactMeasuredVolume({pcSearchVolume:0,mobileSearchVolume:880,pcSearchVolumeLt10:true})).toBeNull();
  expect(exactMeasuredVolume({searchVolume:99999})).toBeNull();
 });
 it('동적 직접 키워드에 측정 자리를 예약하되 표본 상한과 중복 방지를 유지한다',()=>{
  const dynamic=[{keyword:'신규지원금',seed:'신규지원금'}];
  const result=prioritizeCurrentSample([{keyword:'일반'},{keyword:'신규 지원금'},{keyword:'다른말'}],dynamic,2);
  expect(result.map((r:any)=>r.keyword)).toEqual(['신규지원금','일반']);
 });
 it('워크플로가 출처를 후보 생성기에 연결하고 정기 주기와 BD 예산은 유지한다',()=>{
  const root=path.join(__dirname,'../../..');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/preemption-board.yml'),'utf8');
  expect(workflow).toContain('https://leaderspro.kr/data/topic-briefs.json --output current-briefs.json');
  expect(workflow).toContain('--currentBriefs=current-briefs.json');
  expect(workflow.match(/- cron:/g)).toHaveLength(6);
  expect(workflow).toContain('--maxPerRun=1200');
  const script=fs.readFileSync(path.join(root,'scripts/preemption-candidates.js'),'utf8');
  expect(script.indexOf('recordVolumeRows(earlyVolumeResults)')).toBeLessThan(script.indexOf('let volumeCut = 0'));
  expect(script).toContain('prioritizeCurrentSample(sample.rows, currentPhrases, sampleCap)');
  expect(script).toContain('currentSource: row.currentSource || null');
  const batch=fs.readFileSync(path.join(root,'scripts/preemption-board-batch.js'),'utf8');
  expect(batch).toContain('currentSource: row.currentSource || null');
  expect(batch.match(/currentSource: candidate\?\.currentSource \|\| null/g)).toHaveLength(2);
  const publisher=fs.readFileSync(path.join(root,'scripts/publish-preemption-board.js'),'utf8');
  expect(publisher).toContain('currentSource: row.currentSource || null');
 });
});
