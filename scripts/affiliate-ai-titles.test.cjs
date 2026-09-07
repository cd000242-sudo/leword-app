const test = require('node:test');
const assert = require('node:assert/strict');
const { attachAiTitles, buildPrompt } = require('./affiliate-ai-titles');
test('no official body evidence means no AI call and no legacy title promotion', async () => {
  let calls = 0;
  const result = await attachAiTitles([{name:'테스트 제품',keyword:'테스트 제품',aiTitle:{text:'써보니 효과 최고'}}],{log:()=>{},runAI:async()=>{calls++;throw Error('must not call');}});
  assert.equal(calls,0);
  assert.equal(result.attached,0);
  assert.equal(result.items[0].aiTitle,undefined);
});
test('only excerpt-backed claims survive AI output', async () => {
  const item = {name:'테스트 제품',keyword:'테스트 제품',productEvidence:[{id:'spec',sourceType:'official-product',sourceUrl:'https://example.com/p',verifiedAt:new Date().toISOString(),excerpt:'배터리 최대 10시간 표기'}]};
  const reply = JSON.stringify([{index:0,title:'테스트 제품 최대 10시간 표기 확인',claims:[{text:'최대 10시간',quote:'최대 10시간',evidenceId:'spec'}]}]);
  const result = await attachAiTitles([item],{log:()=>{},runAI:async()=>({reply,provider:'fixture'})});
  assert.equal(result.attached,1);
  assert.equal(result.items[0].aiTitle.status,'verified');
  assert.match(buildPrompt([item]),/evidenceId/);
  assert.equal(item.aiTitle,undefined);
});
test('invalid, duplicated and failed AI responses never preserve unsupported titles', async () => {
  const item = {name:'테스트 제품',keyword:'테스트 제품',productEvidence:[{id:'spec',sourceType:'official-product',sourceUrl:'https://example.com/p',verifiedAt:new Date().toISOString(),excerpt:'배터리 최대 10시간 표기'}]};
  for (const reply of ['invalid JSON','{}',JSON.stringify([{index:20,title:'부당한 제목'},{index:0,title:'효과를 직접 확인했다'}])]) {
    const result = await attachAiTitles([item],{log:()=>{},runAI:async()=>({reply,provider:'fixture'})});
    assert.equal(result.attached,0);
    assert.equal(result.items[0].aiTitle,undefined);
  }
});
