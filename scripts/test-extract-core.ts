// v2.42.83 휴리스틱 검증
function extractCoreKeywords(title: string, maxCandidates = 3): string[] {
  if (!title) return [];
  let clean = title
    .replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\{[^}]*\}/g, ' ')
    .replace(/["""''『』「」<>《》]/g, ' ').replace(/[…⋯—–]/g, ' ')
    .replace(/[^ 가-힣a-zA-Z0-9% ]/g, ' ').replace(/\s+/g, ' ').trim();
  const STOPS = new Set(['단독','종합','속보','경향','뉴스','취재','인터뷰','화보','추천','리뷰','후기','소식','공개','발표','경악','충격','폭로','주목','왜','어떻게','무엇','내가','내','그','이','저','나의','우리','오늘','어제','내일','지금','드디어','결국','바로','진짜','정말','갑자기','함께','먼저','방법','이유','결과','비밀','주의','필독','필수','관련','대상','분들','여러분','직접','실제','여전히','예전','에서','으로','에게','한테','부터','까지']);
  const ENDING_JOSA = /(는|은|이|가|을|를|와|과|에|의|도|만|로|으로|이라|이라고|에서|에게|부터|까지|일까|할까|것|까)$/;
  const ENDING_VERB = /(했다|한다|됐다|된다|있다|없다|이다|아니다|줍니다|입니다|했어|놓친|않은|어요|에요|예요)$/;
  const isMeaningful = (t: string) => {
    if (t.length < 2 || t.length > 12) return false;
    if (STOPS.has(t)) return false;
    if (/^\d+%?$/.test(t)) return false;
    if (/^\d+(분|시간|일|초|월|년|만원|원|배)$/.test(t)) return false;
    if (ENDING_VERB.test(t)) return false;
    if (t.length >= 3 && ENDING_JOSA.test(t)) return false;
    return true;
  };
  const tokens = clean.split(/\s+/).filter(isMeaningful);
  if (tokens.length === 0) return [];
  const candidates: string[] = [];
  for (let len = 3; len >= 2; len--) for (let i = 0; i + len <= tokens.length; i++) candidates.push(tokens.slice(i, i + len).join(' '));
  for (const t of tokens) if (t.length >= 4) candidates.push(t);
  const seen = new Set<string>();
  const unique = candidates.filter(c => { if (seen.has(c)) return false; seen.add(c); return c.replace(/\s+/g, '').length >= 5; });
  const DOMAIN_BIAS = /(지원금|혜택|신청|조회|방법|기준|대상|결과|비교|순위|추천|후기|레시피|증상|치료|예방|관리|효과|가격|할인|쿠폰|이벤트|시세|매물|투자|수익|재테크|면접|자격증|연봉|이직|취업)/;
  const scored = unique.map(c => {
    let s = 0; if (DOMAIN_BIAS.test(c)) s += 10;
    const tk = c.split(/\s+/).length;
    if (tk === 2) s += 3; if (tk === 3) s += 1;
    const len = c.replace(/\s+/g, '').length;
    if (len >= 7 && len <= 14) s += 2;
    return { c, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, maxCandidates).map(x => x.c);
}

const samples = [
  '내가 하위 70% 일까… 고유가 피해지원금 건강보험료 기준 1분 자가진단',
  '5월 18일부터 통장에 25만원… 고유가 피해지원금 2차 신청 대상과 신청방법',
  '고유가 피해지원금 2차 신청 대상자 조회 방법 2차, 내가 대상자인지 몰랐던 이유',
  '"부모급여 신청 놓친 분들 주목"… 어린이날 전에 꼭 확인할 신청 기한',
  '[단독] 김동성 양육비 미지급 6월 다시 법정으로',
  '나이키 마인드001 디시 후기',
  '뉴발란스 530 화이트 코디 추천',
];

for (const s of samples) {
  console.log(`\n📝 ${s}`);
  extractCoreKeywords(s, 3).forEach((k, i) => console.log(`   ${i + 1}. ${k}`));
}
