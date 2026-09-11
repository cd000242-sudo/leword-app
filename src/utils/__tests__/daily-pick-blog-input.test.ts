import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * '오늘 쓸 한 편' 화면에서 내 블로그를 바로 넣는다(2026-09-11).
 *
 * 사장님 "내크기를 보려면 여기에 내블로그를 넣을수있게해줘야되지않나요".
 * 이 판의 첫 관문이 '내 크기'인데 그걸 재는 칸이 다른 화면에만 있었다.
 * 그래서 실주행 두 번 모두 envelope: null 로 돌았고, 예산 14칸 중 4칸을
 * 문서수 34만~700만짜리(삼성전자·코스피·SK하이닉스·챗지피티)에 썼다.
 */
const root = path.join(__dirname, '..', '..', '..');
const html = fs.readFileSync(path.join(root, 'ui', 'keyword-master.html'), 'utf8');
const screen = html.slice(html.indexOf('data-screen="today"'), html.indexOf('id="dpFunnel"'));

describe('칸이 이 화면에 있다', () => {
  it('주소 칸·표본 선택·버튼이 오늘 쓸 한 편 화면 안에 있다', () => {
    expect(screen).toContain('id="dpBlogInput"');
    expect(screen).toContain('id="dpBlogSample"');
    expect(screen).toContain('onclick="dpMeasureMyBlog()"');
  });

  it('다른 화면으로 가라고 하지 않는다 — 칸이 여기 있으니까', () => {
    const render = html.slice(html.indexOf('window.renderDailyPick'), html.indexOf('window.dpSyncBlogRow'));
    expect(render).not.toContain('[자리 실측기] 화면의 내 블로그에서');
  });
});

describe('판정을 두 갈래로 만들지 않는다', () => {
  it('자리 실측기와 같은 창구를 쓴다 — 여기서 봉투를 새로 만들지 않는다', () => {
    const fn = html.slice(html.indexOf('window.dpMeasureMyBlog'), html.indexOf('window.loadDailyPick'));
    expect(fn).toContain("invoke('blog-class-measure'");
    expect(fn).not.toContain('buildEnvelope');
    expect(fn).not.toContain('docMax =');
  });

  it('다 재고 나면 이미 골라 둔 판이 옛 봉투로 고른 것임을 알린다', () => {
    const fn = html.slice(html.indexOf('window.dpMeasureMyBlog'), html.indexOf('window.loadDailyPick'));
    expect(fn).toContain('다시 누르면');
  });

  /*
   * 이 말은 dpMeasureMyBlog 안에 있지 않다. 두 화면(자리 실측기·오늘 쓸 한 편)이 같이 쓰는
   * blogEnvelopeHtml 안에 있고, dpMeasureMyBlog 는 그 함수로 보낸다. 화면마다 다른 말을
   * 하지 않게 하려는 것이니, 검사도 사는 곳에서 하고 배선만 따로 확인한다.
   */
  it('못 잰 경우를 뭉뚱그리지 않는다 — 이긴 글이 있는데 크기를 못 센 것과 이긴 글이 없는 것은 다르다', () => {
    const shared = html.slice(html.indexOf('window.blogEnvelopeHtml'), html.indexOf('window.dpMeasureMyBlog'));
    expect(shared).toContain('rankSummary');
    // 두 갈래가 실제로 갈라져 있어야 한다 — 자리를 못 센 것과, 첫 페이지에 못 든 것.
    expect(shared).toContain('그 자리의 경쟁 글 수를 못 셌어요');
    expect(shared).toContain('첫 페이지(10위 안)에 든 글은 없었어요');
  });

  it('오늘 쓸 한 편도 그 공용 상자로 그린다 — 제 것을 따로 만들지 않는다', () => {
    const fn = html.slice(html.indexOf('window.dpMeasureMyBlog'), html.indexOf('window.loadDailyPick'));
    expect(fn).toContain('window.blogEnvelopeHtml(res.record)');
  });
});

describe('아는 것을 다시 묻지 않는다', () => {
  it('전에 넣은 주소를 채워 둔다', () => {
    const load = html.slice(html.indexOf('window.loadDailyPick'), html.indexOf('window.runDailyPick'));
    expect(load).toContain("invoke('blog-class-get')");
    expect(load).toContain("input.value = 'blog.naver.com/' + id");
  });

  it('봉투가 있어도 칸을 감추지 않는다', () => {
    /*
     * 감췄다가 사장님께 지적받았다(2026-09-11 "오늘 쓸 한편 내블로그 크기 넣는 필드 아직안넣었다니까").
     * 봉투가 이미 있으면 칸을 접고 11px 짜리 [다시 재기] 버튼 하나만 남겼는데,
     * 찾는 사람 눈에는 **필드가 없는 것**이다. 이미 안다고 감추면 안 넣은 것과 같다.
     * 상태는 바로 위 '내 크기' 줄이 이미 말해 준다 — 칸은 늘 자리에 둔다.
     */
    expect(html, '접는 코드가 남아 있다').not.toContain('window.dpSyncBlogRow');
    expect(html, '접는 호출이 남아 있다').not.toContain('dpSyncBlogRow(Boolean(env))');
    const screen2 = html.slice(html.indexOf('data-screen="today"'), html.indexOf('id="dpFunnel"'));
    expect(screen2, '칸이 숨겨진 채로 시작한다').not.toMatch(/id="dpBlogRow"[^>]*display:\s*none/);
  });
});
