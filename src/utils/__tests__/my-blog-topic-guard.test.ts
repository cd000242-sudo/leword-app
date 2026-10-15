import { describe, expect, it } from 'vitest';
import { buildProfile, fitsBlogTopic } from '../blog-class/my-blog-lane';
import { gateWithStats, type Candidate } from '../../main/handlers/daily-pick';

const profile = buildProfile({ snapshot: { declaredTopic: '스타·연예인' }, topicProfile: { words: [{ word: '박나래' }, { word: '논란' }, { word: '공개' }, { word: '충격' }] } })!;
const candidate = (keyword: string, topic = '', source: Candidate['source'] = '홈판 벤치마크'): Candidate => ({ keyword, topic, source, titles: [], related: [], facts: [], why: '', searchVolume: 500, documentCount: null, facing: null, vacancy: null });
describe('selected blog topic at every recommendation stage', () => {
  it('keeps a topic profile even before search rankings are available', () => {
    expect(profile.declaredTopic).toBe('스타·연예인');
    expect(profile.band).toBeNull();
    expect(profile.vocabulary).toEqual(['박나래']);
  });
  it('rejects broad culture theatre and car topics despite generic headline overlap', () => {
    for (const c of [candidate('뮤지컬 알라딘 티켓 공개', '문화·연예'), candidate('GV80 하이브리드 충격 가격', '자동차'), candidate('자동차 출시 소식', '스타·연예인', '내 블로그')]) {
      expect(fitsBlogTopic(c, profile)).toBe(false);
      expect(gateWithStats([c], profile, new Set()).gated).toHaveLength(0);
    }
  });
  it('accepts relevant new celebrities and an existing celebrity in an adjacent category', () => {
    expect(fitsBlogTopic(candidate('새 배우 드라마 출연', '문화·연예'), profile)).toBe(true);
    expect(fitsBlogTopic(candidate('박나래 뮤지컬 출연 소감', '공연·전시'), profile)).toBe(true);
    expect(fitsBlogTopic(candidate('박나래 방송 복귀'), profile)).toBe(true);
  });
  it('does not label an unknown topic a personal match', () => {
    expect(fitsBlogTopic(candidate('누군가 새로운 소식', '문화·연예'), profile)).toBe(false);
  });
});
