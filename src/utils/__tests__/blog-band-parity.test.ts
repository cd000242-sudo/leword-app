import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { BAND_FLOOR } from '../blog-class/envelope';

/**
 * 화면과 메인이 같은 '내 크기' 기준을 쓴다(2026-09-15).
 *
 * 판정은 메인(envelope.ts judgeRange — 오늘 쓸 한 편)과 화면(blogRangeOf — 황금 발굴의 '내 크기' 배지·
 * [내 크기만] 거르개)에 한 벌씩 있다. 렌더러가 TS 를 못 불러와 규칙을 옮겨 적었으니,
 * 바닥 숫자나 기준이 갈라지면 두 화면이 같은 말에 다른 말을 한다.
 */
const root = path.join(__dirname, '..', '..', '..');
const html = fs.readFileSync(path.join(root, 'ui', 'keyword-master.html'), 'utf8');
const rangeOf = html.slice(html.indexOf('window.blogRangeOf = function blogRangeOf'), html.indexOf('window.blogRangeBadge = function blogRangeBadge'));
const badge = html.slice(html.indexOf('window.blogRangeBadge = function blogRangeBadge'), html.indexOf('window.renderBlogClass = function renderBlogClass'));

describe('화면과 메인이 같은 기준을 쓴다', () => {
  it('바닥 검색량이 같다', () => {
    expect(rangeOf.length).toBeGreaterThan(100);
    expect(rangeOf).toContain(`const BAND_FLOOR = ${BAND_FLOOR};`);
    expect(badge).toContain(`(${BAND_FLOOR} 이상)`);
  });

  it('화면도 문서수 최대치로 거르지 않는다 — 169만짜리 넓은 말 하나가 기준을 무너뜨렸다', () => {
    expect(rangeOf).not.toContain('docMax');
    expect(badge).not.toContain('docMax');
  });

  it('범위는 메인이 만든 값을 받는다 — 화면이 새로 계산하지 않는다', () => {
    const shared = html.slice(html.indexOf('function blogEnvelopeHtml(record)'), html.indexOf('window.blogRangeOf = function'));
    expect(shared).toContain('window.__blogBand = band;');
    const handler = fs.readFileSync(path.join(root, 'src', 'main', 'handlers', 'blog-class.ts'), 'utf8');
    expect(handler).toContain('band: buildNearBand(');
  });

  it('황금 발굴 줄이 검색량을 넘긴다 — 경쟁 글 수가 아니라', () => {
    expect(html).toContain('window.blogRangeOf(hasTotalVol ? totalVol : null)');
    expect(html).toContain('window.blogRangeBadge(hasTotalVol ? totalVol : null)');
    expect(html).not.toContain('window.blogRangeOf(docCount, row.facing)');
  });
});
