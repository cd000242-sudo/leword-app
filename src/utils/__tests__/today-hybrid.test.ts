import { describe, expect, it } from 'vitest';
import {
  benchmarkCategoryOf,
  coverageGap,
  isNotWritable,
  pickAngles,
  whyNowLine,
} from '../today-hybrid';

/**
 * 오늘 쓸 한 편 하이브리드(2026-10-06) — 사장님 "내 블로그를 분석했으면 내 주제와 내 체급에 맞는 황금키워드를 담아
 * 추천해야 정상 · 누가 김민 배우 프로필로 홈판 글을 쓰냐 · 남들이 안 건드린 영역을 건드리면 확률이 높다".
 */
describe('isNotWritable — 블로그 글이 설 자리가 없는 말', () => {
  it('카드 답(프로필 · 날씨 · 시세)과 인물 사실(필모그래피 · 작품활동)은 뺀다', () => {
    for (const k of ['김민 배우 프로필', '김민 필모그래피', '김민 작품활동', '서울 날씨', '리플시세', '김민 나이']) {
      expect(isNotWritable(k), k).not.toBeNull();
    }
  });
  it('뒤에 궁금증이 붙은 말은 글감이다', () => {
    for (const k of ['신형 투싼 하이브리드 실연비', '김민 나혼산 집 인테리어', '날씨 옷차림 추천']) {
      expect(isNotWritable(k), k).toBeNull();
    }
  });
});

describe('pickAngles — 사람들이 실제로 묻는 각도', () => {
  const band = { volumeMin: 100, volumeMax: 3000 } as const;
  const volumes = new Map<string, number | null>([
    ['신형 투싼 하이브리드 실연비', 1240],
    ['신형 투싼 가격', 98000],
    ['신형 투싼 출시일', 2100],
    ['신형 투싼 단점', 880],
    ['신형 투싼 색상', 60],
    ['신형 투싼 프로필', 500],
  ]);
  const suggestions = [...volumes.keys(), '아반떼 연비'];

  it('머리말을 품은 긴 말 중 내 크기 안 · 질문형을 먼저, 머리말당 2개까지', () => {
    const angles = pickAngles('신형 투싼', suggestions, volumes, band, 2);
    expect(angles.map((a) => a.keyword)).toEqual(['신형 투싼 단점', '신형 투싼 하이브리드 실연비']);
    expect(angles[0].question).toBe('단점');
  });
  it('내 크기를 넘는 말 · 너무 작은 말 · 카드 답 · 머리말이 없는 말은 안 고른다', () => {
    const angles = pickAngles('신형 투싼', suggestions, volumes, band, 10).map((a) => a.keyword);
    expect(angles).not.toContain('신형 투싼 가격');
    expect(angles).not.toContain('신형 투싼 색상');
    expect(angles).not.toContain('신형 투싼 프로필');
    expect(angles).not.toContain('아반떼 연비');
  });
  it('내 크기를 모르면(블로그 안 잼) 검색량 100 이상이면 고른다', () => {
    const angles = pickAngles('신형 투싼', suggestions, volumes, null, 10).map((a) => a.keyword);
    expect(angles).toContain('신형 투싼 가격');
  });
});

describe('coverageGap — 상위 10개 글이 그 궁금증을 다뤘나', () => {
  it('각도 낱말을 다룬 상위 글 수를 센다', () => {
    const gap = coverageGap('신형 투싼 하이브리드 실연비', '신형 투싼', [
      '신형 투싼 출시 가격 총정리', '투싼 하이브리드 실내 공개', '신형 투싼 색상 고민', '투싼 풀체인지 사전계약',
    ]);
    expect(gap.terms).toEqual(['하이브리드', '실연비']);
    expect(gap.covered).toEqual({ 하이브리드: 1, 실연비: 0 });
    expect(gap.uncovered).toEqual(['실연비']);
    expect(gap.sampled).toBe(4);
  });
  it('띄어쓰기 없는 말은 머리말을 떼고 남은 말을 각도로 본다', () => {
    const gap = coverageGap('가수주현미별세이유', '가수주현미별세', ['주현미 별세 소식', '가수 주현미 별세 이유는']);
    expect(gap.terms).toEqual(['이유']);
    expect(gap.covered).toEqual({ 이유: 1 });
  });
  it('상위 제목을 못 읽었으면 판정하지 않는다', () => {
    expect(coverageGap('신형 투싼 단점', '신형 투싼', []).uncovered).toEqual([]);
  });
});

describe('benchmarkCategoryOf — 네이버 32주제 → 벤치마크 분야', () => {
  it('내 블로그 주제를 벤치마크 판의 분야로 옮긴다', () => {
    expect(benchmarkCategoryOf('자동차')).toBe('자동차·IT');
    expect(benchmarkCategoryOf('IT·컴퓨터')).toBe('자동차·IT');
    expect(benchmarkCategoryOf('스포츠')).toBe('스포츠·게임');
    expect(benchmarkCategoryOf('드라마')).toBe('문화·연예');
    expect(benchmarkCategoryOf('패션·미용')).toBe('패션·뷰티');
    expect(benchmarkCategoryOf('맛집')).toBe('여행·생활');
    expect(benchmarkCategoryOf('없는 주제')).toBeNull();
  });
});

describe('whyNowLine — 왜 지금인지 잰 사실로', () => {
  it('벤치마크 채널 · 실제 홈판 · 트렌드 순위 상승을 이어 붙인다', () => {
    expect(whyNowLine({ channels: 6, homefeedRank: 3, homefeedDay: '2026-10-05', rankChange: 12 }))
      .toBe('벤치마크 블로그 6곳이 같이 다루는 소재 · 10/5 실제 홈판 3위 · 트렌드 순위 ↑12');
  });
  it('근거가 없으면 빈 줄', () => {
    expect(whyNowLine({})).toBe('');
  });
});
