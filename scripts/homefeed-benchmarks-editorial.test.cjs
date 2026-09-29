const test = require('node:test');
const assert = require('node:assert/strict');
const { applyReviewedEditorial } = require('./homefeed-benchmarks-editorial.cjs');
const now = '2026-09-28T14:00:00.000Z';
const post = {sourceId:'hitthemoney',platform:'naver-blog',name:'벤치마크',url:'https://blog.naver.com/hitthemoney/224423677591?fromRss=true',title:'장기전세 20년 만기',summary:'장기전세 만기 이후의 절차를 확인합니다.',publishedAt:'2026-09-27T01:39:53Z',capturedAt:now,eventAt:null,metrics:{views:null,likes:null,comments:null}};
const board = {status:'partial',generatedAt:now,candidates:[],sources:[{id:'hitthemoney',status:'ok'}]};
const record = {id:'review',matchUrls:[post.url.split('?')[0]],reviewedAt:'2026-09-28T13:00:00Z',expiresAt:'2026-09-29T03:00:00Z',candidate:{keyword:'장기전세 20년 만기',seoTitle:'장기전세 만기 확인할 점'},officialSources:[{title:'서울시 설명',url:'https://mediahub.seoul.go.kr/archives/2019177'}]};
test('review requires an exact observed URL and valid review window',()=>{
 const result=applyReviewedEditorial(board,[post],[record],now);
 assert.equal(result.candidates.length,1); assert.equal(result.candidates[0].recommended,true);
 assert.equal(result.candidates[0].metrics.searchVolume,null); assert.equal(result.candidates[0].homefeedExposure,'unverified');
 assert.equal(applyReviewedEditorial(board,[{...post,url:'https://blog.naver.com/other/123'}],[record],now).candidates.length,0);
 assert.equal(applyReviewedEditorial(board,[post],[{...record,expiresAt:now}],now).candidates.length,0);
 assert.equal(applyReviewedEditorial(board,[post],[{...record,reviewedAt:'2026-10-01'}],now).candidates.length,0);
});
test('failed fresh collection never upgrades a saved candidate or resets timestamps',()=>{
 const old={...board,status:'stale',generatedAt:'2026-09-27T00:00:00Z'};
 const result=applyReviewedEditorial(old,[post],[record],now);
 assert.equal(result.candidates.length,0); assert.equal(result.generatedAt,old.generatedAt);
 assert.equal(applyReviewedEditorial({...board,sources:[{id:'hitthemoney',status:'failed'}]},[post],[record],now).candidates.length,0);
});
test('expired review loses star even when old payload is retained',()=>{
 const retained={...board,status:'stale',candidates:[{id:'old',recommended:true,status:'review-now',reviewedUntil:'2026-09-28T12:00:00Z',flags:[]}]};
 const result=applyReviewedEditorial(retained,[],[],now);
 assert.equal(result.candidates[0].recommended,false); assert.equal(result.candidates[0].status,'verify');
 assert.equal(retained.candidates[0].recommended,true);
});
test('editorial cannot inject metrics, identity, unsafe sources or exposure claims',()=>{
 const result=applyReviewedEditorial(board,[post],[{...record,candidate:{...record.candidate,metrics:{searchVolume:9999},homefeedExposure:'confirmed'},officialSources:[{title:'bad',url:'javascript:alert(1)'}]}],now);
 assert.equal(result.candidates[0].metrics.searchVolume,null); assert.equal(result.candidates[0].homefeedExposure,'unverified'); assert.equal(result.candidates[0].officialSources.length,0);
});
