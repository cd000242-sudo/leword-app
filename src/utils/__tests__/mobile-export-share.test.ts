import {
  buildMobileKeywordExportArtifact,
} from '../../mobile/export-share';
import type { MobileKeywordMetric } from '../../mobile/contracts';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-export-share] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const keywords: MobileKeywordMetric[] = [
  {
    keyword: '원피스 추천',
    grade: 'SSS',
    pcSearchVolume: 360,
    mobileSearchVolume: 180,
    totalSearchVolume: 540,
    documentCount: 1611294,
    goldenRatio: 0.0003,
    cpc: 120,
    category: 'fashion',
    source: 'fixture',
    intent: 'commercial',
    evidence: ['title: 여름 원피스 추천'],
    isMeasured: true,
  },
  {
    keyword: '린넨 "롱" 원피스',
    grade: 'S',
    pcSearchVolume: null,
    mobileSearchVolume: 90,
    totalSearchVolume: 90,
    documentCount: 1200,
    goldenRatio: 7.5,
    cpc: null,
    category: 'fashion',
    source: 'fixture',
    intent: 'shopping',
    evidence: [],
    isMeasured: true,
  },
];

const csv = buildMobileKeywordExportArtifact({
  format: 'csv',
  title: '여름 원피스 / 추천',
  keywords,
  now: () => new Date('2026-06-06T02:00:00.000Z'),
});

assert('csv export keeps PC-compatible keyword columns',
  csv.format === 'csv'
    && csv.mimeType === 'text/csv;charset=utf-8'
    && csv.filename === '여름_원피스_추천_2026-06-06.csv'
    && csv.itemCount === 2
    && csv.content.startsWith('\uFEFF키워드,등급,PC 검색량,모바일 검색량,월간 총 검색량,문서수,황금비율,CPC,카테고리,의도,소스,측정여부'));
assert('csv export escapes double quotes',
  csv.content.includes('"린넨 ""롱"" 원피스"'));
assert('csv export exposes share text with item count',
  csv.shareText.includes('LEWORD 키워드 내보내기')
    && csv.shareText.includes('2개')
    && csv.byteLength > csv.content.length);

const text = buildMobileKeywordExportArtifact({
  format: 'text',
  title: '원피스 추천',
  keywords,
  now: () => new Date('2026-06-06T02:00:00.000Z'),
});

assert('text export is mobile share friendly',
  text.format === 'text'
    && text.mimeType === 'text/plain;charset=utf-8'
    && text.filename === '원피스_추천_2026-06-06.txt'
    && text.content.includes('1. [SSS] 원피스 추천')
    && text.content.includes('검색 540'));

const json = buildMobileKeywordExportArtifact({
  format: 'json',
  title: '원피스 추천',
  keywords,
  now: () => new Date('2026-06-06T02:00:00.000Z'),
});
const parsed = JSON.parse(json.content);

assert('json export preserves raw keyword metrics',
  json.format === 'json'
    && json.mimeType === 'application/json;charset=utf-8'
    && parsed.keywords[0].keyword === '원피스 추천'
    && parsed.summary.itemCount === 2);

try {
  buildMobileKeywordExportArtifact({
    format: 'csv',
    keywords: [],
  });
  assert('empty export should fail', false);
} catch (err) {
  assert('empty export fails with a useful error',
    (err as Error).message.includes('keywords are required'));
}

console.log('[mobile-export-share] passed');
