/**
 * youtube-trend-keywords.test.ts
 *
 * Guards YouTube trend keyword extraction for LEWORD discovery:
 * English-only title noise must not become a golden keyword seed.
 */

import { extractYouTubeTrendKeywordCandidates } from '../youtube-data-api';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const noisyMusicTitle = 'Knew It You LEMONADE 감정없는 사이코패스 RESCENE 리센느 LOVE ATTACK';
const noisyMusicCandidates = extractYouTubeTrendKeywordCandidates(noisyMusicTitle);

assert(
  'drops english-only tokens from YouTube trend titles',
  ['Knew', 'It', 'You', 'LEMONADE', 'RESCENE', 'LOVE', 'ATTACK'].every(keyword => !noisyMusicCandidates.includes(keyword)),
  noisyMusicCandidates.join('|')
);

assert(
  'keeps Korean issue terms from the same title',
  ['감정없는', '사이코패스', '리센느', '감정없는 사이코패스'].every(keyword => noisyMusicCandidates.includes(keyword)),
  noisyMusicCandidates.join('|')
);

assert(
  'does not glue unrelated English artist tokens to Korean keywords',
  !noisyMusicCandidates.some(keyword => /RESCENE|LOVE|ATTACK|LEMONADE/i.test(keyword)),
  noisyMusicCandidates.join('|')
);

const examTitle = '2027 6모 등급컷 공개 정답 답지 확인';
const examCandidates = extractYouTubeTrendKeywordCandidates(examTitle);

assert(
  'keeps fast issue exam keywords',
  ['6모', '등급컷', '정답', '답지', '2027 6모', '6모 등급컷'].every(keyword => examCandidates.includes(keyword)),
  examCandidates.join('|')
);

const sportsTitle = 'KBO 올스타전 티켓팅 일정 중계 시간 총정리';
const sportsCandidates = extractYouTubeTrendKeywordCandidates(sportsTitle);

assert(
  'keeps Korean sports issue phrases with allowed acronyms',
  ['올스타전', '티켓팅', '일정', 'KBO 올스타전', '올스타전 티켓팅', '티켓팅 일정'].every(keyword => sportsCandidates.includes(keyword)),
  sportsCandidates.join('|')
);

assert(
  'still blocks acronym-only keywords',
  !sportsCandidates.includes('KBO'),
  sportsCandidates.join('|')
);

console.log(`\n[youtube-trend-keywords.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
