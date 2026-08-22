#!/usr/bin/env node
/**
 * 후보 파일을 BD 예산에 맞춰 잘라낸다.
 *
 * 왜 필요한가: 후보는 무료(검색광고·자동완성)로 얼마든지 뽑히지만, 자리 확인은
 * 키워드당 Bright Data 2건이 든다. 후보를 뽑은 만큼 그대로 넘기면 예산을 넘긴다.
 * 실제로 한 번 그렇게 태웠다 — 승인받은 액수 안에서 돌도록 여기서 자른다.
 *
 * 자리가 안 나왔던 주제는 더 많이 남긴다. 같은 수만 남기면 그 주제는 또 0건이 된다.
 *
 * 사용:
 *   node scripts/trim-candidates.js --in=후보.json --out=잘린것.json \
 *     --keep=6 --boost=육아·결혼,반려동물,인테리어·DIY --boostKeep=10
 */
'use strict';

const fs = require('fs');

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function main() {
  const inPath = arg('in');
  const outPath = arg('out');
  if (!inPath || !outPath) { console.error('--in 과 --out 이 필요합니다.'); process.exit(2); }

  const keep = Number(arg('keep')) || 6;
  const boostKeep = Number(arg('boostKeep')) || keep;
  const boost = new Set(arg('boost').split(',').map((s) => s.trim()).filter(Boolean));

  const file = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  /*
   * 후보 발굴기가 실어 보낸 굶은 주제는 자동으로 보강 대상이다(2026-08-22).
   *
   * 앞 단계에서 무료 선별 문턱을 올려 어렵게 살려 낸 후보가, 여기서 주제당
   * 상한에 걸려 그대로 다시 잘려 나가면 아무 일도 안 한 것이 된다.
   * 워크플로에 주제 이름을 손으로 적어 넣지 않아도 되도록 파일에서 받는다.
   */
  for (const topic of (Array.isArray(file.starvedTopics) ? file.starvedTopics : [])) {
    if (topic) boost.add(String(topic));
  }
  const topics = file.topics || {};

  let before = 0;
  let after = 0;
  const trimmed = {};
  for (const [topic, value] of Object.entries(topics)) {
    // 후보 배열은 파일 세대에 따라 통째로 오기도 하고 candidates 아래 오기도 한다.
    const list = Array.isArray(value) ? value : (value.candidates || []);
    const limit = boost.has(topic) ? boostKeep : keep;
    // 앞에서부터 자른다 — 후보 생성기가 이미 순위대로 넣어 두었다.
    const cut = list.slice(0, limit);
    before += list.length;
    after += cut.length;
    trimmed[topic] = Array.isArray(value) ? cut : { ...value, candidates: cut };
  }

  fs.writeFileSync(outPath, JSON.stringify({ ...file, topics: trimmed }, null, 0), 'utf8');

  console.log(`후보 ${before} → ${after}건 (주제당 ${keep}${boost.size > 0 ? `, 보강 ${[...boost].join('·')} ${boostKeep}` : ''})`);
  console.log(`BD 예상 소요 ${after * 2}건 (AI 브리핑 실측 포함 키워드당 2건)`);
  console.log(`저장: ${outPath}`);
}

main();
