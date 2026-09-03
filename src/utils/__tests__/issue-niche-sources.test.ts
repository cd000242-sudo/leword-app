import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/issue-niche-sources.json';
import {
  isNounPhraseToken,
  hasTrailingParticle,
  looksLikeVerbForm,
  collapseVariants,
} from '../keyword-shape';
import { inspectPolicyKeyword, sanitizePolicyKeywords } from '../policy-keyword-sanitizer';
import { extractTechSubject, extractQuotedProductNames } from '../tech-issue-keywords';
import { cleanSubject } from '../issue-niche-hunter';

const POLICY: string[] = fixtures.policyKeywords;
const TITLES: string[] = fixtures.techTitles;

describe('keyword-shape — 문장 조각 판별', () => {
  it('조사가 붙은 채 잘린 토큰을 잡는다', () => {
    expect(hasTrailingParticle('취약계층을')).toBe(true);
    expect(hasTrailingParticle('아동보호전문기관의')).toBe(true);
    expect(hasTrailingParticle('재외동포청은')).toBe(true);
  });

  // 짧은 낱말은 조사와 형태가 겹친다 — 여기서 오탐이 나면 멀쩡한 키워드가 죽는다.
  it('조사처럼 끝나는 짧은 명사는 살린다', () => {
    expect(hasTrailingParticle('물가')).toBe(false);
    expect(hasTrailingParticle('회의')).toBe(false);
  });

  it('용언 활용형을 잡되 명사 어미는 살린다', () => {
    expect(looksLikeVerbForm('따른')).toBe(true);
    expect(looksLikeVerbForm('오르고')).toBe(true);
    // '서'는 어미(-서)와 서류 명사(증명서)가 겹쳐 오탐이 잦았던 자리
    expect(looksLikeVerbForm('가족관계증명서')).toBe(false);
    expect(looksLikeVerbForm('청년농업인')).toBe(false);
    expect(looksLikeVerbForm('소상공인')).toBe(false);
  });

  it('명사구 토큰만 통과시킨다', () => {
    expect(isNounPhraseToken('아동수당')).toBe(true);
    expect(isNounPhraseToken('등')).toBe(false);
    expect(isNounPhraseToken('에')).toBe(false);
  });

  it('접두가 겹치는 변형을 하나로 접는다', () => {
    const out = collapseVariants(['아동수당 지급', '아동수당', '아동수당 신청']);
    expect(out).toEqual(['아동수당']);
  });

  it('접두가 정확히 겹칠 때만 접는다 — 다른 제도는 살린다', () => {
    const out = collapseVariants(['참전수당', '참전명예수당', '무공수당']);
    expect(out).toEqual(['참전수당', '참전명예수당', '무공수당']);
  });
});

describe('policy-keyword-sanitizer — 실표본 회귀', () => {
  it('제도명은 통과시킨다', () => {
    for (const k of ['아동수당', '온누리상품권 환급', '유가연동보조금', '참전명예수당', '국민성장펀드']) {
      expect(inspectPolicyKeyword(k).ok, k).toBe(true);
    }
  });

  // 아래는 전부 2026-09-02 정책브리핑이 실제로 뱉은 문장 조각이다.
  it('기사에서 잘려 나온 조각을 떨군다', () => {
    for (const k of ['에 따른 급여', '취약계층 등 대상', '오르고 참전명예수당', '학생들 때문이다', 'AI를 활용하는 시행']) {
      expect(inspectPolicyKeyword(k).ok, k).toBe(false);
    }
  });

  it('제도 도메인 명사가 없으면 제도명이 아니다', () => {
    expect(inspectPolicyKeyword('아동학대사례관리대상').ok).toBe(false);
    expect(inspectPolicyKeyword('총괄보건복지부 아동학대대응과').ok).toBe(false);
  });

  it('일반어로만 이뤄진 구는 버린다', () => {
    expect(inspectPolicyKeyword('지원 신청').ok).toBe(false);
    expect(inspectPolicyKeyword('지원 신청 접수').ok).toBe(false);
  });

  it('검색량 실측이 불가능한 4어절 이상은 버린다', () => {
    expect(inspectPolicyKeyword('아동보호전문기관의 합동점검 시 점검 대상').ok).toBe(false);
  });

  // 통과율이 크게 흔들리면 게이트가 무너졌거나 지나치게 조여진 것이다.
  it('실표본 60건에서 제도명만 남는다', () => {
    const out = sanitizePolicyKeywords(POLICY);
    expect(out.length).toBeGreaterThanOrEqual(12);
    expect(out.length).toBeLessThanOrEqual(24);
    expect(out).toContain('아동수당');
    expect(out).not.toContain('아동수당 지급');
    for (const k of out) expect(k.split(/\s+/).length).toBeLessThanOrEqual(3);
  });
});

describe('tech-issue-keywords — 주체 추출', () => {
  it('"주체, 서술" 꼴에서 주체를 뽑는다', () => {
    expect(extractTechSubject('오픈AI, 애플 소송에 정면 반박...')).toBe('오픈AI');
    expect(extractTechSubject('한미반도체, 대만 파운드리 기업에 패키징 장비 대량 공급')).toBe('한미반도체');
  });

  // 따옴표·말줄임으로 시작하는 제목은 주체가 앞에 없다 — 앞부분을 취하면 문장 조각이 나온다.
  it('인용으로 시작하는 제목은 통째로 버린다', () => {
    expect(extractTechSubject('"20명 동시 대화도 단숨에"… 메타, 실시간 음성 AI 공개')).toBeNull();
    expect(extractTechSubject("AI 경쟁 넘어 '사회적 합의'로…국가AI전략위, 유럽과 정책 방향 논의")).toBeNull();
  });

  it('IT·AI 기사가 아니면 버린다', () => {
    expect(extractTechSubject("신세계, 청담동에 하이엔드 호텔 '아만 서울' 짓는다")).toBeNull();
  });

  it('나라·매체 자신처럼 너무 일반적인 주체는 버린다', () => {
    expect(extractTechSubject('미국, G20 회의서 AI 규제 신설 반대')).toBeNull();
    expect(extractTechSubject('중국, 리튬이온 배터리 소비세 부과…AI 반도체 영향')).toBeNull();
  });

  it('사람 직함으로 끝나면 인물 기사라 버린다', () => {
    expect(extractTechSubject('이홍석 뉴로클 대표, "AI 표준 툴킷을 제공하면"')).toBeNull();
  });
});

describe('tech-issue-keywords — 제품·모델명 추출', () => {
  // 사장님 사례: 새 AI 모델 출시가 이 탭이 노리는 자리다.
  it('따옴표 안 제품명을 버전째로 뽑는다', () => {
    const out = extractQuotedProductNames("\"싸고 강력해졌다\"… 앤트로픽, 차세대 AI '페이블·미토스 5.1' 기습 공개");
    expect(out).toContain('페이블·미토스 5.1');
  });

  it('출시 동사가 따라오는 따옴표만 제품명으로 본다', () => {
    expect(extractQuotedProductNames("월드랩스, 옴니 월드모델 '아틀라스' 공개...사진 한 장으로 3D 공간 추론")).toContain('아틀라스');
    // 인용·강조 따옴표는 제품명이 아니다
    expect(extractQuotedProductNames("애플 vs 오픈AI 소송의 진짜 쟁점은 '영업비밀'이 아니라 '이직의 자유'다")).toEqual([]);
  });

  it('2자짜리 강조 인용은 제품명으로 보지 않는다', () => {
    expect(extractQuotedProductNames('AI 시대 고성능 조건은 ‘냉각’…레노버가 내놓은 해법은')).toEqual([]);
  });

  it('실표본 170건에서 뽑힌 이름은 전부 3어절 이하다', () => {
    const names = TITLES.flatMap((t) => extractQuotedProductNames(t));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.split(/\s+/).length).toBeLessThanOrEqual(3);
  });
});

describe('cleanSubject — 실검 문구에서 주체 뽑기', () => {
  // 아래는 전부 2026-09-03 Signal.bz 가 실제로 준 문구다.
  it('"주체, 서술" 꼴에서 주체만 남긴다', () => {
    expect(cleanSubject('박재홍, 뇌경색 진단')).toBe('박재홍');
    expect(cleanSubject('이다영, 아제르바이잔 이적')).toBe('이다영');
  });

  it('하트·따옴표 같은 장식을 걷어낸다', () => {
    expect(cleanSubject('지예은♥바타, 결혼 소감')).not.toContain('♥');
    expect(cleanSubject('지예은♥바타, 결혼 소감')).not.toContain(',');
  });

  it('한 글자 꼬리 조각을 떨군다', () => {
    expect(cleanSubject('vfl 오스나브뤼크 대')).toBe('vfl 오스나브뤼크');
  });

  it('숫자 수량 토큰을 떨군다', () => {
    expect(cleanSubject('부산 예인선 전복 2명 구조')).not.toContain('2명');
  });

  it('잘린 문구의 꼬리 조사(에/에서/으로…)를 떼되, 이름 끝 글자는 건드리지 않는다', () => {
    // 12차 실측(2026-09-03): "용혜인 논란에" 가 이슈 머리로 그대로 실렸다.
    expect(cleanSubject('용혜인 논란에')).toBe('용혜인 논란');
    expect(cleanSubject('삼성전자 주총에서')).toBe('삼성전자 주총');
    // '은/는/이/가' 는 이름 끝 글자와 구분이 안 되므로 떼지 않는다.
    expect(cleanSubject('지예은 결혼 소감')).toBe('지예은 결혼 소감');
    expect(cleanSubject('용혜인')).toBe('용혜인');
  });

  it('멀쩡한 실검은 그대로 둔다', () => {
    expect(cleanSubject('해병대 제2사단')).toBe('해병대 제2사단');
    expect(cleanSubject('오늘의 운세')).toBe('오늘의 운세');
  });

  it('3어절을 넘지 않는다 — 4어절 이상은 검색량 실측이 안 된다', () => {
    for (const raw of ['키아프 프리즈 서울 개막', '이재명 민주평통 회의 개최', '부산 예인선 전복 2명 구조']) {
      expect(cleanSubject(raw).split(/\s+/).length, raw).toBeLessThanOrEqual(3);
    }
  });
});
