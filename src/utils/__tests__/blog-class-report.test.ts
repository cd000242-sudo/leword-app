import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 못 쟀을 때 무엇을 쟀는지 말한다(2026-09-11).
 *
 * 사장님 "내블로그를 분석한다면 좀 구체적이면서 제대로 분석해야되지않나".
 *
 * 실측(2026-09-10T16:06Z, leadernam-, 최근 30개):
 *   candidates 88 → withVolume 8 → ranked 8 → won 0
 *   순위는 17·18·24위였고 나머지 5개는 상위 목록에서 아예 못 찾았다.
 * 그런데 화면이 한 말은 "아직 첫 페이지에 든 글이 없어요" 한 줄뿐이었다.
 *
 * 그 한 줄은 **8개를 재고 내린 말인데 452개짜리 블로그 전체에 대한 판결처럼 읽힌다.**
 * 잰 범위(글 30개)·거른 이유(88개 중 80개는 사람들이 안 치는 말)·가장 가까웠던 자리(17위)를
 * 같이 보여야 초보자가 다음에 뭘 할지 안다. 전부 잰 값이라 지어낼 것이 없다.
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
// blogRangeOf 는 발굴 거르개가 4천 줄 위에서 먼저 부른다 — 정의부로 끊어야 슬라이스가 안 뒤집힌다.
const fn = html.slice(html.indexOf('function blogEnvelopeHtml(record)'), html.indexOf('window.blogRangeOf = function'));

describe('봉투를 못 만들었을 때', () => {
  it('깔때기 네 숫자를 그대로 보여준다 — 뽑은 말 / 치는 말 / 잰 것 / 첫 페이지', () => {
    for (const key of ['candidates', 'withVolume', 'ranked', 'won']) {
      expect(fn, `깔때기에 ${key} 가 없다`).toContain(`sum.${key}`);
    }
  });

  it('몇 개를 재고 한 말인지 밝힌다 — 블로그 전체 판결처럼 읽히지 않게', () => {
    expect(fn).not.toContain('아직 첫 페이지에 든 글이 없어요. 검색어 ');
    expect(fn).toContain('sampledPosts');
  });

  it('가장 가까웠던 자리를 순위 순으로 보여준다', () => {
    expect(fn).toContain('wonRows');
    expect(fn).toContain('blogRank');
    // 순위를 못 찾은 행(null)이 0위로 앞에 서면 안 된다
    expect(fn).toContain("typeof r.blogRank === 'number'");
  });

  it('순위를 아예 못 찾은 것은 따로 센다 — 17위와 "못 찾음"은 다른 사실이다', () => {
    expect(fn).toMatch(/못 찾|안 보였/);
  });

  it('다음에 뭘 하면 되는지 한 줄로 말한다', () => {
    expect(fn).toMatch(/최근 100개|더 재|늘려/);
  });
});

describe('봉투가 있을 때는 그대로', () => {
  it('이겨본 크기·정면·잘 이기는 이야기를 그대로 보여준다', () => {
    expect(fn).toContain('이겨본 가장 큰 자리');
    expect(fn).toContain('env.facingMax');
    expect(fn).toContain('잘 이기는 이야기');
  });
});

describe('두 화면이 같은 판을 쓴다', () => {
  it('오늘 쓸 한 편에서도 같은 함수로 그린다 — 두 화면이 다른 말을 하면 둘 다 못 믿는다', () => {
    expect(html).toContain('window.blogEnvelopeHtml');
    const dp = html.slice(html.indexOf('window.dpMeasureMyBlog'), html.indexOf('window.loadDailyPick'));
    expect(dp).toContain('window.blogEnvelopeHtml(');
    expect(dp).toContain('dpBlogResult');
  });
});
