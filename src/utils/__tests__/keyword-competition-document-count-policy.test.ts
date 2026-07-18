import fs from 'fs';
import path from 'path';
import { normalizeNaverBlogBroadQuery } from '../naver-blog-api';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const spaced = normalizeNaverBlogBroadQuery('  “제주 렌터카”  가격 비교  ');
const unspaced = normalizeNaverBlogBroadQuery('제주렌터카 가격비교');
assert('competition analyzer broad normalization removes quote operators',
  spaced === '제주 렌터카 가격 비교', spaced);
assert('competition analyzer broad normalization preserves actual query spacing',
  spaced.normalize('NFKC').toLowerCase()
    !== unspaced.normalize('NFKC').toLowerCase(),
  `${spaced} / ${unspaced}`);

const source = fs.readFileSync(
  path.join(__dirname, '..', 'keyword-competition', 'competition-analyzer.ts'),
  'utf8',
);
assert('competition analyzer imports the shared Blog document client',
  /import\s*\{[\s\S]*?getNaverBlogDocumentCount,[\s\S]*?normalizeNaverBlogBroadQuery,[\s\S]*?\}\s*from '\.\.\/naver-blog-api'/.test(source));
assert('direct publish-volume lookup sends the normalized broad query unchanged',
  /const broadQuery = normalizeNaverBlogBroadQuery\(keyword\)[\s\S]{0,180}getNaverBlogDocumentCount\(broadQuery,/.test(source));
assert('direct competition analysis requires a fresh official Blog total',
  /getNaverBlogDocumentCount\(broadQuery,[\s\S]{0,800}forceFresh:\s*true/.test(source));
assert('direct competition analysis has a finite shared-client timeout',
  /getNaverBlogDocumentCount\(broadQuery,[\s\S]{0,900}timeoutMs:\s*8_000/.test(source));
assert('competition analyzer contains no direct Blog OpenAPI axios/fetch path',
  !/axios[\s\S]{0,300}(?:v1\/search\/blog|openapi\.naver\.com)/i.test(source)
    && !/openapi\.naver\.com\/v1\/search\/blog/i.test(source));

console.log('[keyword-competition-document-count-policy.test] passed');
process.exit(0);
