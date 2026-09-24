import { describe, expect, it, vi } from 'vitest';
import { buildTopicBriefReviewPrompt, enrichBriefFacts, reviewTopicBriefs, normalizeBriefBoard } from '../../main/topic-brief-pipeline';

const facts: any[] = [{ id: 'f1', field: '생활', title: '지역 축제 사전등록 안내', snippet: '사전등록은 무료다.', newsUrl: 'https://n.news.naver.com/mnews/article/001/0010000000', link: 'https://example.test/news', press: '보도', publishedAt: '2026-09-17T00:00:00Z', dates: [] }];
const brief = (): any => ({ title: '지역 축제 사전등록 안내', titles: [], timing: 'NOW', types: ['가이드형'], value: '사전등록은 무료다.', primaryIntent: '사전등록 비용 확인', experience: '', differentiation: '비용부터 확인', coreKeyword: '지역 축제', keywords: ['지역 축제'], factIds: ['f1'], field: '생활', facts, searchVolume: 500, serpFacing: 1, serpVacancy: 1, serpFit: '높음', star: false, editorial: { version: 2, status: 'supported', summary: '사전등록은 무료다.', audience: '축제 방문을 준비하는 사람', angle: '등록 비용 확인', outline: ['등록 비용'], missing: [], answers: [{ question: '등록 비용은?', answer: '사전등록은 무료다.', factIds: ['f1'], excerpts: [{ factId: 'f1', text: '사전등록은 무료다.' }] }] } });

describe('글감 본문과 독립 검토 연결', () => {
  it('검토자는 화면에 표시할 경험과 구성 주장도 원문과 대조할 수 있다', () => {
    const input = brief(); input.experience = '직접 경험 미확인'; input.differentiation = '다른 글에는 없는 정보를 제공한다';
    const payload = JSON.parse(buildTopicBriefReviewPrompt([input], facts).split('\n').pop()!);
    expect(payload.briefs[0].experience).toBe(input.experience);
    expect(payload.briefs[0].differentiation).toBe(input.differentiation);
  });
  it('기사 본문을 제한적으로 읽고 원래 요약은 보존한다', async () => {
    const text = '지역 축제 사전등록은 무료다. 공식 누리집에서 방문일을 고른 뒤 신청할 수 있다. 등록 확인서를 보관한 방문객은 입구에서 확인받으면 된다. 방문 전에 공식 안내문에서 운영 시간과 변경 사항을 확인할 수 있다.';
    const fetchImpl = vi.fn(async () => new Response(`<div id="dic_area">${text}</div>`, { headers: { 'content-type': 'text/html' } }));
    const result = await enrichBriefFacts(facts, { fetchImpl });
    expect(result[0].snippet).toBe(facts[0].snippet);
    expect(result[0].body).toContain(text);
    expect(result[0].sourceLevel).toBe('body');
    expect(facts[0].body).toBeUndefined();
  });
  it('검토가 질문과 근거의 불일치를 발견하면 추천 가능 상태를 내린다', async () => {
    const run = vi.fn(async () => JSON.stringify([{ index: 0, passed: false, issues: ['무료라는 사실은 있지만 등록 절차는 확인되지 않았습니다.'] }]));
    const [result] = await reviewTopicBriefs([brief()], facts, run);
    expect(result.editorial.status).toBe('needs_research');
    expect(result.editorial.review.passed).toBe(false);
    expect(result.editorial.missing.join(' ')).toContain('등록 절차');
    expect(run).toHaveBeenCalledOnce();
  });
  it('누락·중복·문자열 true 응답과 검토 실패를 승인으로 취급하지 않는다', async () => {
    for (const reply of ['[]', '[{"index":0,"passed":"true","issues":[]}]', '[{"index":0,"passed":true,"issues":[]},{"index":0,"passed":true,"issues":[]}]']) {
      const [result] = await reviewTopicBriefs([brief()], facts, async () => reply);
      expect(result.editorial.review.passed).toBe(false);
      expect(result.star).toBe(false);
    }
    const [failed] = await reviewTopicBriefs([brief()], facts, async () => { throw new Error('provider timeout'); });
    expect(failed.editorial.status).toBe('needs_research');
  });
  it('독립 검토를 통과해도 기존 근거 부족을 지우지 않는다', async () => {
    const input = brief(); input.editorial.status = 'needs_research'; input.editorial.missing = ['마감일 확인 필요'];
    const [result] = await reviewTopicBriefs([input], facts, async () => '[{"index":0,"passed":true,"issues":[]}]');
    expect(result.editorial.status).toBe('needs_research');
    expect(result.editorial.missing).toContain('마감일 확인 필요');
  });
  it('옛 저장판의 별표와 경험형 제목을 앱 반환 시 바로 정리한다', () => {
    const legacy = brief(); delete legacy.editorial; legacy.title = '지역 축제 다녀왔더니 좋더라고요'; legacy.star = true;
    const original = { builtAt: '2026-09-17T00:00:00Z', briefs: [legacy], rounds: [{ slot: '아침', briefs: [legacy] }] };
    const result = normalizeBriefBoard(original);
    expect(result.briefs[0].star).toBe(false);
    expect(result.briefs[0].title).not.toContain('다녀왔');
    expect(result.rounds[0].briefs[0].editorial.status).toBe('needs_research');
    expect(original.briefs[0].star).toBe(true);
  });
});
