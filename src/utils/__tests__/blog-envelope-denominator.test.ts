import { describe, expect, it } from 'vitest';
import { buildEnvelope, type WonRow } from '../blog-class/envelope';

/**
 * 승률의 분모(2026-09-11).
 *
 * 실측(leadernam-, 최근 100개): rankSummary 는 ranked 26 · won 2 인데
 * 봉투는 measuredCount 5 였고 화면은 "최근 글 5개를 찾아봤어요. 그중 2개가 첫 페이지에 있었어요"라고 썼다.
 *   26개를 쟀고, 그중 5개에서 내 글을 찾았고, 그중 2개가 10위 안이었다.
 *   화면대로면 승률이 2/5 = 40%로 읽히지만 실제는 2/26 = 8%다.
 *
 * measuredCount 가 `blogRank 가 숫자인 행`만 세고 있었다. 그런데 순위가 null 인 행은
 * **못 잰 것이 아니라 진 것**이다 — measureMyRanks 는 검색 화면을 못 읽은 행(막힘·빈 목록)은
 * 애초에 rows 에 안 넣는다. rows 에 든 것은 전부 실제로 재 본 것이다.
 * 진 것을 분모에서 빼면 승률이 부풀고, "다섯 번 중 두 번 이겼다"는 거짓이 된다.
 */
const row = (over: Partial<WonRow> = {}): WonRow => ({
  keyword: '어떤 말', blogRank: null, searchVolume: 300, documentCount: null,
  facing: 5, postUrl: 'https://blog.naver.com/me/1', publishedOn: null, ...over,
});

describe('잰 것은 다 분모에 든다', () => {
  it('순위를 못 찾은 행도 잰 것이다 — 진 것이지 안 잰 것이 아니다', () => {
    const rows = [
      row({ keyword: '이김1', blogRank: 4, documentCount: 637916 }),
      row({ keyword: '이김2', blogRank: 10, documentCount: 1682713 }),
      row({ keyword: '짐1', blogRank: 17 }),
      ...Array.from({ length: 21 }, (_, i) => row({ keyword: `못찾음${i}`, blogRank: null })),
    ];
    const env = buildEnvelope(rows)!;
    expect(env.wonCount).toBe(2);
    expect(env.measuredCount, '분모가 진 것을 빼고 있다').toBe(24);
  });

  it('실측 회차 숫자를 그대로 못 박는다 — 26개 중 2개', () => {
    const rows = [
      row({ keyword: '베란다 청소 방법', blogRank: 4, searchVolume: 90, documentCount: 637916, facing: 8 }),
      row({ keyword: '타일 바닥 청소', blogRank: 10, searchVolume: 300, documentCount: 1682713, facing: 9 }),
      row({ keyword: '이케아 추천템 내돈내산', blogRank: 17, searchVolume: 50 }),
      row({ keyword: '주말 아이랑 실내', blogRank: 18, searchVolume: 250 }),
      row({ keyword: '오아 클린이워터B UV', blogRank: 24, searchVolume: 180 }),
      ...Array.from({ length: 21 }, (_, i) => row({ keyword: `못찾음${i}` })),
    ];
    const env = buildEnvelope(rows)!;
    expect(env.measuredCount).toBe(26);
    expect(env.wonCount).toBe(2);
  });

  it('한계선은 이긴 행에서만 나온다 — 분모가 커져도 크기는 안 변한다', () => {
    const base = [row({ blogRank: 4, documentCount: 637916, facing: 8 })];
    const withLosses = [...base, ...Array.from({ length: 40 }, () => row())];
    expect(buildEnvelope(withLosses)!.docMax).toBe(buildEnvelope(base)!.docMax);
    expect(buildEnvelope(withLosses)!.facingMax).toBe(buildEnvelope(base)!.facingMax);
  });
});

describe('화면이 분모를 검색어라고 부른다', () => {
  it('"글 N개"가 아니라 "검색어 N개"다 — 잰 것은 글이 아니라 검색어다', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
    const fn = html.slice(html.indexOf('function blogEnvelopeHtml(record)'), html.indexOf('window.blogRangeOf = function'));
    expect(fn).not.toContain('최근 글 ');
    expect(fn).toMatch(/검색어 .*measuredCount/);
    expect(fn).toContain('첫 페이지(10위 안)');
  });
});
