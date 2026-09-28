import type { FactCard } from './topic-briefs';
import { claimIssue } from './topic-brief-evidence';

export interface BriefWritingGuide {
  version: 1;
  direction: string;
  mustInclude: string[];
  avoid: string[];
  seoTitles: string[];
  homeTitles: string[];
  /** Editorial vocabulary suggestions, not measured search keywords. */
  relatedTerms: string[];
  /** Links are cited pages to inspect, never inferred image asset URLs or reuse licenses. */
  images: Array<{ sourceId: string; url: string; kind: 'reference' | 'capture'; description: string; captureArea: string }>;
}

const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
const safeUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? value : ''; } catch { return ''; }
};

/** Structural and factual gate; semantic entailment is also checked by the independent reviewer. */
export function validateWritingGuide(raw: unknown, facts: FactCard[], anchor: Date, coreKeyword = ''): { guide?: BriefWritingGuide; issues: string[] } {
  if (raw === undefined) return { issues: [] };
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1) return { issues: ['작성 가이드 형식을 확인해야 합니다.'] };
  const input = raw as Partial<BriefWritingGuide>;
  const issues: string[] = [];
  const check = (value: unknown, label: string, max = 500): string => {
    const clean = text(value);
    const problem = claimIssue(clean, facts, anchor);
    if (!clean || clean.length > max || problem) { issues.push(`${label}: ${problem || '내용과 길이를 확인해야 합니다.'}`); return ''; }
    return clean;
  };
  const list = (value: unknown, label: string, max = 6, length = 300) => {
    if (!Array.isArray(value)) { issues.push(`${label} 목록을 확인해야 합니다.`); return []; }
    return [...new Set(value.slice(0, max).map(item => check(item, label, length)).filter(Boolean))];
  };
  const direction = check(input.direction, '작성 방향');
  const mustInclude = list(input.mustInclude, '필수 내용');
  const avoid = list(input.avoid, '제외할 내용');
  const seoTitles = list(input.seoTitles, '검색 제목', 3, 70).filter(title => {
    if (!coreKeyword || title.replace(/\s/g, '').startsWith(coreKeyword.replace(/\s/g, ''))) return true;
    issues.push('검색 제목은 핵심 검색어로 시작해야 합니다.'); return false;
  });
  const homeTitles = list(input.homeTitles, '홈판 제목', 3, 80).filter(title => {
    if (/^["“][^"”]{2,32}["”]\s*\S/.test(title)) return true;
    issues.push('홈판 제목 앞부분의 따옴표 후킹 문구를 확인해야 합니다.'); return false;
  });
  const relatedTerms = list(input.relatedTerms, '함께 넣을 말', 8, 60);
  const images: BriefWritingGuide['images'] = [];
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  for (const image of Array.isArray(input.images) ? input.images.slice(0, 3) : []) {
    const sourceId = text(image?.sourceId);
    const source = byId.get(sourceId);
    const url = safeUrl(image?.url);
    const kind = image?.kind;
    const description = check(image?.description, '이미지 참고 설명', 300);
    const captureArea = kind === 'capture' || text(image?.captureArea) ? check(image?.captureArea, '캡처 위치', 300) : '';
    if (!source || !url || url !== safeUrl(source.link) || !['reference', 'capture'].includes(kind) || !description || (kind === 'capture' && !captureArea)
      || /저작권\s*없|자유(?:롭게)?\s*(?:사용|재사용)|(?:무단|상업적|무료)\s*(?:사용|재사용)\s*가능/.test(`${description} ${captureArea}`)) {
      issues.push('이미지 참고는 인용 출처 페이지와 확인할 위치만 제공해야 합니다.'); continue;
    }
    images.push({sourceId,url,kind,description,captureArea});
  }
  if (!Array.isArray(input.images)) issues.push('이미지 참고 목록을 확인해야 합니다.');
  return { guide: {version:1,direction,mustInclude,avoid,seoTitles,homeTitles,relatedTerms,images}, issues: [...new Set(issues)] };
}
