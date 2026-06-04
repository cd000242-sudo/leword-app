import { isKeywordMatchingCategory } from './categories';

export interface GoldenKeywordPrecisionInput {
  keyword: string;
  grade?: string;
  score?: number | null;
  searchVolume?: number | null;
  documentCount?: number | null;
  goldenRatio?: number | null;
  categoryIds?: string[];
  categoryStrict?: boolean;
  measurementOnly?: boolean;
}

export interface GoldenKeywordPrecisionResult {
  ok: boolean;
  reason: string;
}

const POLICY_RE = /(지원금|보조금|장려금|바우처|급여|수당|환급|감면|면제|정책|복지|대출|청년|소상공인|육아|출산|근로|고용|정부24|보조금24|정책브리핑)/;
const INCIDENT_RE = /(정보\s*유출|개인정보|유출|해킹|보안\s*사고|침해|피싱|스미싱|랜섬웨어|도용|사칭|2차\s*피해|피해\s*확인|보상|환불|장애|먹통|오류|중단)/;
const ENTERTAINMENT_RE = /(아이돌|배우|가수|연예인|스타|걸그룹|보이그룹|컴백|신곡|앨범|티저|쇼케이스|공식입장|팬미팅|콘서트|시상식|드라마|예능|출연|공항패션|열애|결혼|논란|해명)/;
const BROAD_NOISE_RE = /^(뉴스|실시간|속보|오늘|연예|스포츠|정치|경제|사회|날씨|환율|주식|코인|로또|운세|유튜브|네이버)$/;
const BROAD_COMBO_RE = /^(뉴스|실시간|속보|오늘|연예|스포츠|정치|경제|사회|날씨)(뉴스|실시간|속보|오늘|이슈|핫이슈|순위|검색어)?$/;
const GENERIC_POLICY_RE = /^(지원금|보조금|장려금|바우처|급여|수당|환급|복지|정책)(신청|대상|자격|조회|방법|기간|혜택)?$/;
const GENERIC_INCIDENT_RE = /^(정보유출|개인정보유출|해킹|보안사고|먹통|오류|장애)(확인|조회|보상|방법)?$/;
const GENERIC_ENTERTAINMENT_TERMS = [
  '아이돌', '배우', '가수', '연예인', '스타', '걸그룹', '보이그룹', '드라마', '예능',
  '컴백', '공식입장', '팬미팅', '콘서트', '시상식', '출연', '공항패션', '열애', '결혼',
  '논란', '해명', '일정', '방송시간', '예매', '라인업', '반응', '근황', '인스타',
  '프로필', '다시보기', '컴백날짜', '날짜', '출연진', '주연', '신곡', '앨범', '티저',
  '공개일', '공개', '방송', '시즌', '티켓팅', '좌석', '장소',
];

function compact(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function hasMeasuredSssData(input: GoldenKeywordPrecisionInput): boolean {
  const volume = Number(input.searchVolume || 0);
  const docs = Number(input.documentCount || 0);
  const ratio = Number(input.goldenRatio || 0);
  const score = Number(input.score || 0);
  return score >= 85 && volume >= 1000 && docs > 0 && docs <= 5000 && ratio >= 5;
}

function hasConcreteEntertainmentSubject(keyword: string): boolean {
  let value = compact(keyword);
  for (const term of GENERIC_ENTERTAINMENT_TERMS) {
    value = value.replace(new RegExp(term, 'g'), '');
  }
  value = value.replace(/202[0-9]|[0-9]+월|[0-9]+일|[0-9]+차/g, '');
  return /[가-힣]{2,}|[a-z0-9]{2,}/i.test(value);
}

function categoryPrecisionOk(keyword: string, categoryIds: string[]): boolean {
  if (categoryIds.length === 0) return true;
  return categoryIds.some(id => isKeywordMatchingCategory(keyword, id));
}

export function assessGoldenKeywordPrecision(input: GoldenKeywordPrecisionInput): GoldenKeywordPrecisionResult {
  const keyword = String(input.keyword || '').replace(/\s+/g, ' ').trim();
  const key = compact(keyword);
  const grade = String(input.grade || '').toUpperCase();
  const categoryIds = Array.from(new Set((input.categoryIds || []).map(id => String(id || '').trim()).filter(Boolean)));

  if (!keyword || key.length < 3) return { ok: false, reason: 'empty-or-too-short' };
  if (BROAD_NOISE_RE.test(key) || BROAD_COMBO_RE.test(key)) return { ok: false, reason: 'broad-noise' };
  if (input.categoryStrict && !categoryPrecisionOk(keyword, categoryIds)) {
    return { ok: false, reason: 'category-mismatch' };
  }

  if (grade !== 'SSS') return { ok: true, reason: 'non-sss' };
  if (input.measurementOnly) return { ok: false, reason: 'measurement-only' };
  if (!hasMeasuredSssData(input)) return { ok: false, reason: 'sss-data-gate-failed' };

  if (ENTERTAINMENT_RE.test(keyword) && !hasConcreteEntertainmentSubject(keyword)) {
    return { ok: false, reason: 'entertainment-without-subject' };
  }
  if (POLICY_RE.test(keyword) && GENERIC_POLICY_RE.test(key)) {
    return { ok: false, reason: 'generic-policy' };
  }
  if (INCIDENT_RE.test(keyword) && GENERIC_INCIDENT_RE.test(key)) {
    return { ok: false, reason: 'generic-incident' };
  }

  return { ok: true, reason: 'precise' };
}

export function isPreciseGoldenKeywordCandidate(input: GoldenKeywordPrecisionInput): boolean {
  return assessGoldenKeywordPrecision(input).ok;
}
