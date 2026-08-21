/**
 * 외부유입 판 대장 — 링크를 달거나 뿌릴 수 있는 곳의 지도.
 *
 * 왜 필요한가(사장님 지시 2026-08-21): 레이더가 지식인·카페만 보고 있었다.
 * 실측해 보니 네이버 검색으로는 **네이버 밖 커뮤니티가 하나도 안 잡힌다** —
 * 6개 주제로 360건을 훑었더니 180건이 cafe.naver.com 이고 나머지는 정부·기업
 * 사이트였다. 디시·에펨·클리앙·더쿠는 단 한 건도 없었다. 네이버는 자기 판을
 * 보여주지, 남의 판을 보여주지 않는다.
 *
 * 그래서 구글로 훑는다(실측: 호출 1건에 `site:` 15개를 OR 로 묶어 arca.live 6건
 * · a-ha.io 4건 · bobaedream 1건을 잡았다). 이 파일은 그 `site:` 목록이자,
 * **거기서 링크를 달아도 되는가**의 대장이다.
 *
 * 링크 정책은 확인된 것만 적는다. 모르면 'unknown' 이다 — 지어내면 사장님이
 * 계정을 잃는다. 근거(why)가 없는 정책은 이 파일에 들어올 수 없다.
 */

export type LinkPolicy =
  /** 링크를 달아도 되는 판. 다만 어디든 홍보 티가 나면 지워진다. */
  | 'ok'
  /** 달 수는 있으나 조심해야 하는 판(자주 지워지거나 제재 이력). */
  | 'careful'
  /** 링크가 막혀 있거나 곧바로 삭제·차단되는 판. */
  | 'banned'
  /** 아직 확인하지 못했다. 확인 전에는 사람이 직접 판단한다. */
  | 'unknown';

export type CommunitySite = {
  /** 검색에 쓰는 도메인. `site:` 뒤에 그대로 들어간다. */
  domain: string;
  name: string;
  /** 무슨 판인가 — 화면에서 묶어 보여주고, 주제에 맞는 판만 고를 때 쓴다. */
  kind: 'qna' | 'general' | 'hobby' | 'life' | 'deal' | 'tech' | 'car' | 'game' | 'women' | 'parenting' | 'finance';
  /** 이 판의 성격 한 줄 — 사장님이 처음 보는 판일 때 판단 재료. */
  note: string;
  linkPolicy: LinkPolicy;
  /** 정책의 근거. 'unknown' 이 아니면 반드시 있어야 한다. */
  policyWhy?: string;
  /** 답글·댓글을 남길 수 있는가(글 없이도 참여 가능한가). */
  canReply: boolean;
  /** 가입 없이는 못 쓰는 판인가. */
  needsJoin: boolean;
};

/*
 * 방문자 규모 순(2026-08 공개 순위 기준)으로 담되, 글감이 나오는 판만 담는다.
 * 순위표를 그대로 베끼지 않는다 — 답글을 달 수 없는 곳은 유입 자리가 아니다.
 */
export const COMMUNITY_SITES: CommunitySite[] = [
  // ── 질문이 모이는 판 — 답변 자리가 곧 유입구다 ──
  {
    domain: 'a-ha.io', name: '아하 Q&A', kind: 'qna',
    note: '전문가 답변형 Q&A. 답변에 보상이 붙어 질문이 꾸준히 올라온다.',
    linkPolicy: 'careful',
    policyWhy: '답변 본문에 링크를 넣을 수 있으나, 홍보성으로 판단되면 답변이 내려간다.',
    canReply: true, needsJoin: true,
  },
  {
    domain: 'okky.kr', name: 'OKKY', kind: 'tech',
    note: '개발자 Q&A·커뮤니티. 기술 질문이 모인다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },

  // ── 종합 커뮤니티 ──
  {
    domain: 'dcinside.com', name: '디시인사이드', kind: 'general',
    note: '갤러리별로 주제가 갈린다. 국내 최대 규모.',
    linkPolicy: 'banned',
    policyWhy: '외부 링크 삽입이 삭제·차단 사유였던 이력이 길고, 네이버 블로그 링크는 지금도 곧바로 지워진다(나무위키 운영 문제 항목).',
    canReply: true, needsJoin: false,
  },
  {
    domain: 'fmkorea.com', name: '에펨코리아', kind: 'general',
    note: '축구·게임·유머 중심의 대형 종합판. 20대 남성 비중이 높다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'theqoo.net', name: '더쿠', kind: 'women',
    note: '여성 이용자 중심 대형 종합판. 연예·생활 주제가 활발하다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'arca.live', name: '아카라이브', kind: 'hobby',
    note: '채널별로 주제가 갈린다. 취미·서브컬처가 강하다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: false,
  },
  {
    domain: 'pann.nate.com', name: '네이트 판', kind: 'life',
    note: '사연·고민 글이 모인다. 생활 주제 유입이 크다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'instiz.net', name: '인스티즈', kind: 'women',
    note: '10~20대 여성 이용자 중심. 익명 게시판이 활발하다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: false,
  },
  {
    domain: 'todayhumor.co.kr', name: '오늘의유머', kind: 'general',
    note: '종합 게시판. 시사·생활 글도 많다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'humoruniv.com', name: '웃긴대학', kind: 'general',
    note: '오래된 종합 유머판.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },

  // ── 취미·전문 ──
  {
    domain: 'clien.net', name: '클리앙', kind: 'tech',
    note: 'IT·전자제품 실사용 후기가 강하다. 구매 전 검색 유입이 많다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'ruliweb.com', name: '루리웹', kind: 'game',
    note: '게임·애니 중심. 정보 게시판이 크다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'inven.co.kr', name: '인벤', kind: 'game',
    note: '게임별 공략·정보. 게임 키워드 유입구.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'mlbpark.donga.com', name: 'MLBPARK', kind: 'general',
    note: '야구에서 출발했지만 잡담·시사판이 더 크다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'bobaedream.co.kr', name: '보배드림', kind: 'car',
    note: '자동차 중심. 사고·정비·구매 질문이 모인다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'ppomppu.co.kr', name: '뽐뿌', kind: 'deal',
    note: '핫딜·쇼핑 정보. 제휴 상품 주제와 맞물린다.',
    linkPolicy: 'careful',
    policyWhy: '핫딜 게시판은 링크가 본문인 판이지만, 제휴·추적 링크는 별도 규정이 있어 확인이 필요하다.',
    canReply: true, needsJoin: true,
  },
  {
    domain: 'quasarzone.com', name: '퀘이사존', kind: 'tech',
    note: '하드웨어·PC 견적. 구매 직전 검색이 많다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'damoang.net', name: '다모앙', kind: 'general',
    note: '클리앙에서 갈라져 나온 종합판.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },

  // ── 생활·가정·재테크 ──
  {
    domain: '82cook.com', name: '82쿡', kind: 'life',
    note: '살림·요리에서 출발한 여성 생활판. 자유게시판이 매우 활발하다.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'missycoupons.com', name: '미시쿠폰', kind: 'deal',
    note: '주부 대상 핫딜·생활 정보.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
  {
    domain: 'ruliweb.com/community', name: '루리웹 유머·이슈', kind: 'general',
    note: '루리웹 안에서도 유입이 큰 구획.',
    linkPolicy: 'unknown', canReply: true, needsJoin: true,
  },
];

/** `site:` OR 묶음을 만든다 — 호출 1건으로 여러 판을 훑는 열쇠다. */
export function siteFilterFor(sites: CommunitySite[]): string {
  return sites.map((site) => `site:${site.domain}`).join(' OR ');
}

/** 도메인으로 판을 찾는다. 우리가 모르는 판이면 null — '발견된 판'으로 따로 센다. */
export function siteOf(domain: string): CommunitySite | null {
  const host = String(domain).replace(/^www\./, '').toLowerCase();
  return COMMUNITY_SITES.find((site) => host === site.domain || host.endsWith(`.${site.domain}`)) || null;
}

export const LINK_POLICY_LABEL: Record<LinkPolicy, string> = {
  ok: '링크 가능',
  careful: '링크 조심',
  banned: '링크 막힘',
  unknown: '정책 미확인',
};
