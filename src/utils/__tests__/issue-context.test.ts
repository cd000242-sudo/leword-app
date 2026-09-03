import { describe, expect, it } from 'vitest';
import {
  collectIssueContexts,
  filterIssueKeywords,
  parseNewsHeadlines,
  searchAdHintFor,
  stripNewsMarkup,
  topRelatedKeywords,
} from '../issue-context';

/**
 * 이슈 재료 수집 — 추론 계층의 입력이다. 여기서 새는 것은 전부 화면까지 간다:
 * 뉴스 제목의 <b> 태그, 자동완성의 쇼핑 변형, 15자를 넘겨 잘린 검색광고 힌트.
 */

const NEWS_JSON = {
  items: [
    { title: '<b>박재홍</b>, 뇌경색 진단…&quot;회복 중&quot;', originallink: 'https://www.press-a.co.kr/a/1', link: 'https://n.news.naver.com/1', pubDate: 'Wed, 03 Sep 2026 10:12:00 +0900' },
    { title: '박재홍 뇌경색 진단 &lt;속보&gt;', originallink: 'https://press-b.com/2', link: 'https://n.news.naver.com/2', pubDate: 'Wed, 03 Sep 2026 09:50:00 +0900' },
    // 같은 제목이 다른 매체로 또 온다 — 하나로 접는다.
    { title: '<b>박재홍</b>, 뇌경색 진단…&quot;회복 중&quot;', originallink: 'https://press-c.com/3', link: 'https://n.news.naver.com/3', pubDate: 'Wed, 03 Sep 2026 09:40:00 +0900' },
    { title: '&amp; 기호 &#39;따옴표&#39; 제목', originallink: '', link: 'https://n.news.naver.com/4', pubDate: 'bad date' },
  ],
};

describe('stripNewsMarkup — 오픈API 제목 정제', () => {
  it('강조 태그와 HTML 엔티티를 걷어낸다', () => {
    expect(stripNewsMarkup('<b>박재홍</b>, 뇌경색 진단…&quot;회복 중&quot;')).toBe('박재홍, 뇌경색 진단…"회복 중"');
    expect(stripNewsMarkup('&amp; 기호 &#39;따옴표&#39; &lt;속보&gt;')).toBe("& 기호 '따옴표' <속보>");
  });
});

describe('parseNewsHeadlines', () => {
  it('제목을 정제하고 중복을 접으며 매체 도메인·시각을 남긴다', () => {
    const rows = parseNewsHeadlines(NEWS_JSON, 6);
    expect(rows.map((r) => r.title)).toEqual([
      '박재홍, 뇌경색 진단…"회복 중"',
      '박재홍 뇌경색 진단 <속보>',
      "& 기호 '따옴표' 제목",
    ]);
    expect(rows[0].press).toBe('press-a.co.kr');
    expect(rows[0].link).toBe('https://n.news.naver.com/1');
    expect(rows[0].publishedAt).toBe('2026-09-03T01:12:00.000Z');
    // 날짜를 못 읽으면 비워 둔다 — 지어내지 않는다.
    expect(rows[2].publishedAt).toBeNull();
    expect(rows[2].press).toBeNull();
  });

  it('상한을 지킨다', () => {
    expect(parseNewsHeadlines(NEWS_JSON, 2)).toHaveLength(2);
  });

  it('깨진 응답은 빈 배열이다', () => {
    expect(parseNewsHeadlines(null, 5)).toEqual([]);
    expect(parseNewsHeadlines({ items: 'x' }, 5)).toEqual([]);
  });
});

describe('filterIssueKeywords — 자동완성·연관어 정제', () => {
  it('이슈 자신·쇼핑 변형·4어절 이상·중복을 뺀다', () => {
    const out = filterIssueKeywords(
      ['박재홍', '박재홍 뇌경색', '박재홍 뇌경색 최저가', '박재홍 뇌경색 진단 이유 영상', '박재홍  뇌경색', '박재홍 아내', ''],
      '박재홍',
    );
    expect(out).toEqual(['박재홍 뇌경색', '박재홍 아내']);
  });

  it('상한을 지킨다', () => {
    expect(filterIssueKeywords(['a1 b', 'a2 b', 'a3 b'], 'zzz', 2)).toHaveLength(2);
  });
});

describe('searchAdHintFor — 15자 힌트 규칙', () => {
  it('15자 이내면 그대로 쓴다', () => {
    expect(searchAdHintFor('프리즈 서울')).toBe('프리즈 서울');
  });

  it('넘기면 앞 어절부터 15자 안에 드는 만큼만 쓴다 — 잘린 힌트는 다른 키워드의 연관어다', () => {
    // 공백 뺀 글자수로 센다(검색광고가 공백을 지워 보낸다): '마운자로국내출시가격인하발표'=14자 통과, '논란'을 더하면 16자.
    expect(searchAdHintFor('마운자로 국내 출시 가격 인하 발표 논란')).toBe('마운자로 국내 출시 가격 인하 발표');
    expect(searchAdHintFor('대한민국 해병대 신병 수료식 일정 안내')).toBe('대한민국 해병대 신병 수료식 일정');
  });

  it('첫 어절부터 넘기면 힌트 없음', () => {
    expect(searchAdHintFor('가나다라마바사아자차카타파하가나')).toBeNull();
  });
});

describe('topRelatedKeywords — 검색광고 연관어에서 재료 고르기', () => {
  const sugg = [
    { keyword: '박재홍 뇌경색', totalSearchVolume: 3200 },
    { keyword: '박재홍', totalSearchVolume: 90000 },
    { keyword: '박재홍 아내', totalSearchVolume: 1500 },
    { keyword: '박재홍 굿즈 최저가', totalSearchVolume: 8000 },
    { keyword: '박재홍 근황', totalSearchVolume: null },
    { keyword: '박재홍 해설', totalSearchVolume: 700 },
  ];

  it('이슈 자신과 쇼핑 변형을 빼고 검색량 내림차순, null 은 뒤로', () => {
    expect(topRelatedKeywords(sugg as any, '박재홍', 3)).toEqual([
      { keyword: '박재홍 뇌경색', monthlyVolume: 3200 },
      { keyword: '박재홍 아내', monthlyVolume: 1500 },
      { keyword: '박재홍 해설', monthlyVolume: 700 },
    ]);
  });
});

describe('collectIssueContexts — 소스를 갈아끼워 조립을 확인', () => {
  it('이슈마다 헤드라인·자동완성·연관어를 모으고, 한 소스가 죽어도 나머지는 산다', async () => {
    const calls: string[] = [];
    const contexts = await collectIssueContexts(['박재홍', '마운자로'], {
      config: { clientId: 'id', clientSecret: 'secret' },
      searchAd: { accessLicense: 'lic', secretKey: 'sec' },
      sources: {
        fetchNews: async (issue) => {
          calls.push(`news:${issue}`);
          if (issue === '마운자로') throw new Error('news down');
          return NEWS_JSON;
        },
        fetchAutocomplete: async (issue) => {
          calls.push(`ac:${issue}`);
          return [`${issue} 뇌경색`, `${issue} 최저가`, `${issue}`];
        },
        fetchRelated: async (hint) => {
          calls.push(`rel:${hint}`);
          return [{ keyword: `${hint} 아내`, totalSearchVolume: 100 }] as any;
        },
      },
    });

    expect(contexts).toHaveLength(2);
    expect(contexts[0].issue).toBe('박재홍');
    expect(contexts[0].headlines).toHaveLength(3);
    expect(contexts[0].autocomplete).toEqual(['박재홍 뇌경색']);
    expect(contexts[0].related).toEqual([{ keyword: '박재홍 아내', monthlyVolume: 100 }]);
    // 뉴스가 죽은 이슈 — 헤드라인만 비고 나머지는 그대로다.
    expect(contexts[1].headlines).toEqual([]);
    expect(contexts[1].autocomplete).toEqual(['마운자로 뇌경색']);
    expect(calls).toEqual(expect.arrayContaining(['news:박재홍', 'ac:박재홍', 'rel:박재홍', 'news:마운자로']));
  });

  it('검색광고 자격이 없으면 연관어를 부르지 않는다', async () => {
    let related = 0;
    const contexts = await collectIssueContexts(['박재홍'], {
      config: { clientId: 'id', clientSecret: 'secret' },
      searchAd: null,
      sources: {
        fetchNews: async () => NEWS_JSON,
        fetchAutocomplete: async () => [],
        fetchRelated: async () => { related += 1; return []; },
      },
    });
    expect(related).toBe(0);
    expect(contexts[0].related).toEqual([]);
  });

  it('진행 콜백으로 어느 이슈까지 모았는지 알린다', async () => {
    const seen: number[] = [];
    await collectIssueContexts(['a1', 'b2', 'c3'], {
      config: { clientId: 'id', clientSecret: 'secret' },
      searchAd: null,
      sources: { fetchNews: async () => NEWS_JSON, fetchAutocomplete: async () => [], fetchRelated: async () => [] },
      onProgress: (current) => { seen.push(current); },
    });
    expect(seen).toEqual([1, 2, 3]);
  });
});
