#!/usr/bin/env node
/**
 * 벤치마크 작성 안내 회차 요약 · 판정 (2026-11-08).
 *
 * 안내 작업과 제목 작업은 같은 Claude 구독 주간 한도를 쓴다. 제목 작업이 한도를 먹으면 안내 작업은
 * rate_limited 로 0건을 만들면서도 '성공'으로 끝나 3일간 아무도 몰랐다(안내가 있는 카드 1,000장 중 33장).
 * 제목 작업의 stalled 검사(enrich-benchmark-titles.js runSummary)와 같은 방식으로, 회차 요약을 남기고
 * 워크플로 마지막 단계가 0건이면 빨간불 · 중간에 한도가 닿았으면 경고로 끝낸다.
 *
 * 다른 엔진으로 넘어가지 않는다 — 사장님 원칙(자동 폴백 금지). 한도면 멈추고 알린다.
 *
 * 사용: node scripts/benchmark-run-summary.cjs <summary.json>   (요약 파일이 없으면 아무 말 없이 통과)
 */
'use strict';

const fs = require('fs');

/**
 * 구독 한도 소진 판별. 두 문구가 실제 CI 로그에 찍힌다:
 *  - 첫 실패:   "… (원인 코드: rate_limited). 현재 구독 사용 한도가 소진되었습니다 …"
 *  - 쉬는 중:   "… claude: 건너뜀: 사용 한도 초과 — 30분 뒤 다시 시도 …" (engineHealth 가 막은 엔진을 기억)
 */
const RATE_LIMIT_RE = /rate_limited|사용 한도 초과|사용 한도가 소진|weekly limit|usage limit|rate limit/i;
function isRateLimitError(error) {
  if (error == null) return false;
  const text = typeof error === 'string' ? error : String((error && error.message) || error);
  return RATE_LIMIT_RE.test(text);
}

const count = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

/** 요청했는데 새 안내가 0건이고 실패한 배치가 있으면 stalled. 답은 왔는데 거르개가 전부 버린 경우(실패 0)는 아니다. */
function guideRunSummary({ asked, made, missed, failed, rateLimited, skipped } = {}) {
  const a = count(asked); const m = count(made); const f = count(failed);
  return { asked: a, made: m, missed: count(missed), failed: f, rateLimited: rateLimited === true, skipped: count(skipped), stalled: a > 0 && m === 0 && f > 0 };
}

/** 요약 → { level: 'ok' | 'warning' | 'error', message }. 요약이 없으면(AI 단계를 건너뜀) 말하지 않는다. */
function summaryVerdict(summary) {
  if (!summary || typeof summary !== 'object') return { level: 'ok', message: '' };
  const { asked, made, failed, rateLimited, skipped, stalled } = guideRunSummary(summary);
  if (stalled && rateLimited) return { level: 'error', message: `작성 안내 0건(요청 ${asked}장) — 구독 한도 소진(rate_limited)입니다. 한도가 풀린 뒤 다음 회차에 위쪽 카드부터 다시 채웁니다.` };
  if (stalled) return { level: 'error', message: `작성 안내 0건(요청 ${asked}장, 실패 배치 ${failed}개) — 구독 CLI 상태를 확인하세요.` };
  if (rateLimited) return { level: 'warning', message: `작성 안내 ${made}/${asked}장 — 중간에 구독 한도가 소진돼 멈췄습니다(시작 못 한 배치 ${skipped}개). 위쪽 카드부터 채웠습니다.` };
  if (asked === 0) return { level: 'ok', message: '작성 안내를 새로 지을 카드가 없습니다.' };
  return { level: 'ok', message: `작성 안내 ${made}/${asked}장` };
}

function main(argv) {
  const file = argv[2];
  if (!file || !fs.existsSync(file)) return 0;
  let summary;
  try { summary = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.log(`::warning::작성 안내 요약 파일을 읽지 못했습니다: ${file}`); return 0; }
  const { level, message } = summaryVerdict(summary);
  if (level === 'error') { console.log(`::error::${message}`); return 1; }
  if (level === 'warning') { console.log(`::warning::${message}`); return 0; }
  if (message) console.log(message);
  return 0;
}

module.exports = { isRateLimitError, guideRunSummary, summaryVerdict };

if (require.main === module) process.exit(main(process.argv));
