import { writeTitles, findUnsupportedNumbers, normalizeKoreanNumerals } from '../llm-title-writer';

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

const FALLBACK = { seoTitle: '폴백 제목 총정리', homeTitle: '폴백, 지금 무슨 일인가' };
const ok = (seo: string, home: string) => async () => `검색제목: ${seo}\n홈판제목: ${home}`;

// ── 한국어 수 표기 정규화 ────────────────────────────────────────────
// "1천8백원" 과 "1800원" 은 같은 값인데 문자열로는 안 겹친다.
// 정규화하지 않으면 멀쩡한 출력이 환각으로 기각된다(실제로 그랬다).
assert('1천8백 → 1800', normalizeKoreanNumerals('1천8백원').includes('1800'));
assert('2천 → 2000', normalizeKoreanNumerals('2천원').includes('2000'));
assert('3만 → 30000', normalizeKoreanNumerals('3만원').includes('30000'));
assert('쉼표 제거', normalizeKoreanNumerals('1,866원').includes('1866'));

// ── 환각 검사 ────────────────────────────────────────────────────────
{
  const facts = ['휘발유 평균 가격은 1천8백원 대를 유지했다.'];
  assert('표기만 다른 같은 수는 통과',
    findUnsupportedNumbers('기름값 1800원대 유지', facts).length === 0,
    findUnsupportedNumbers('기름값 1800원대 유지', facts).join(','));
  assert('원문에 없는 수는 잡는다',
    findUnsupportedNumbers('기름값 2500원 돌파', facts).includes('2500'));
}

void (async () => {
  // ── 정상 채택 ──────────────────────────────────────────────────────
  {
    const facts = ['낮 최고 기온이 33도 안팎을 기록하며 무더위가 이어지겠다.'];
    const r = await writeTitles('전국 무더위', facts, FALLBACK, {
      generate: ok('전국 무더위, 낮 최고 33도 안팎 지속', '33도 무더위 언제까지 이어지나'),
    });
    assert('사실에 근거하면 채택', r.source === 'llm', JSON.stringify(r));
    assert('제목이 그대로 온다', r.seoTitle === '전국 무더위, 낮 최고 33도 안팎 지속');
  }

  // ── 환각이면 기각하고 폴백 ─────────────────────────────────────────
  // 여기가 이 모듈의 존재 이유다. 초보자는 나온 숫자를 사실로 믿고 글을 쓴다.
  {
    const facts = ['낮 최고 기온이 33도 안팎을 기록하겠다.'];
    const r = await writeTitles('전국 무더위', facts, FALLBACK, {
      generate: ok('전국 무더위, 낮 최고 41도 폭염 경보', '41도 기록 무슨 일인가'),
    });
    assert('없는 숫자가 나오면 기각', r.source === 'fallback', JSON.stringify(r));
    assert('폴백 제목으로 대체', r.seoTitle === FALLBACK.seoTitle);
    assert('기각 사유를 남긴다', String(r.rejectedReason).includes('41'), String(r.rejectedReason));
  }

  // ── Ollama 가 없어도 배치가 죽지 않아야 한다 ───────────────────────
  {
    const r = await writeTitles('아무거나', ['사실 문장입니다.'], FALLBACK, {
      generate: async () => { throw new Error('ECONNREFUSED'); },
    });
    assert('모델이 없으면 폴백', r.source === 'fallback');
    assert('사유에 원인을 남긴다', String(r.rejectedReason).includes('unavailable'));
  }

  // ── 형식이 깨지면 기각 ─────────────────────────────────────────────
  {
    const r = await writeTitles('아무거나', ['사실 문장입니다.'], FALLBACK, {
      generate: async () => '제목을 만들어 드리겠습니다. 무엇을 도와드릴까요?',
    });
    assert('파싱 실패는 폴백', r.source === 'fallback' && r.rejectedReason === 'unparsable',
      JSON.stringify(r));
  }

  // ── 사실이 없으면 부르지도 않는다 ──────────────────────────────────
  {
    let called = 0;
    const r = await writeTitles('아무거나', [], FALLBACK, {
      generate: async () => { called++; return ''; },
    });
    assert('사실 없으면 호출 안 함', called === 0);
    assert('사실 없으면 폴백', r.source === 'fallback' && r.rejectedReason === 'no_facts');
  }

  // ── 너무 긴 출력 기각 ──────────────────────────────────────────────
  {
    const r = await writeTitles('키워드', ['사실 문장입니다.'], FALLBACK, {
      generate: ok('가'.repeat(80), '나'.repeat(80)),
    });
    assert('과도하게 길면 기각', r.source === 'fallback' && r.rejectedReason === 'too_long');
  }

  console.log(`\n[llm-title-writer.test] passed: ${passed} / failed: ${failed}`);
  if (failed > 0) {
    failures.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  process.exit(0);
})();
