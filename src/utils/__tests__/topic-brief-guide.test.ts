import { describe, expect, it } from 'vitest';
import { validateWritingGuide } from '../topic-brief-guide';
import { buildBriefPrompt, validateBriefs, type FactCard } from '../topic-briefs';
import { buildTopicBriefReviewPrompt } from '../../main/topic-brief-pipeline';
import { publicBoard } from '../../main/board-cache';

const now = new Date('2026-09-28T04:00:00Z');
const facts: FactCard[] = [{ id:'f1',field:'지원금·복지',title:'소상공인 지원금 신청 안내',snippet:'소상공인 지원금 신청은 온라인으로 진행된다.',press:'공식',link:'https://www.korea.kr/news/1',publishedAt:now.toISOString(),dates:[] }];
const guide = () => ({version:1,direction:'신청 방식을 먼저 설명하고 대상 조건은 원문에서 확인한다.',mustInclude:['온라인 신청 방식'],avoid:['확인되지 않은 금액 단정'],seoTitles:['소상공인 지원금 온라인 신청 방식 확인'],homeTitles:['"신청은 온라인으로" 소상공인 지원금 확인할 내용'],relatedTerms:['온라인 신청'],images:[{sourceId:'f1',url:facts[0].link,kind:'capture',description:'신청 안내를 확인할 원문 페이지',captureArea:'온라인 신청을 설명하는 문단'}]});
const draft = () => ({title:'소상공인 지원금 신청 방식 확인',timing:'NOW',types:['정보형'],primaryIntent:'신청 방식 확인',value:facts[0].snippet,experience:'',differentiation:'신청 방식부터 확인',coreKeyword:'소상공인 지원금',keywords:['소상공인 지원금'],factIds:['f1'],writingGuide:guide()});

describe('source-backed compact writing guide', () => {
  it('preserves a factual editorial quoted hook and exact source capture instructions', () => {
    const result = validateWritingGuide(guide(), facts, now, '소상공인 지원금');
    expect(result.issues).toEqual([]);
    expect(result.guide?.homeTitles[0]).toContain('"신청은 온라인으로"');
    expect(result.guide?.images[0].url).toBe(facts[0].link);
  });
  it('rejects invented quantities, fabricated experience and ungrounded asset URLs', () => {
    const input = {...guide(),mustInclude:['지원금은 500만원이다.'],seoTitles:['소상공인 지원금 받아보니 좋네요'],images:[{...guide().images[0],url:'https://www.korea.kr/invented.jpg'}]};
    const result = validateWritingGuide(input, facts, now, '소상공인 지원금');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.guide?.mustInclude).toEqual([]);
    expect(result.guide?.seoTitles).toEqual([]);
    expect(result.guide?.images).toEqual([]);
  });
  it('rejects unknown source ids and unsafe source URLs even when cited', () => {
    for (const url of ['javascript:alert(1)','https://user:secret@www.korea.kr/news/1']) {
      const sources = [{...facts[0],link:url}];
      expect(validateWritingGuide({...guide(),images:[{...guide().images[0],url}]},sources,now).guide?.images).toEqual([]);
    }
    expect(validateWritingGuide({...guide(),images:[{...guide().images[0],sourceId:'f2'}]},facts,now).guide?.images).toEqual([]);
  });
  it('connects generation, validation, independent review, cache projection and document metrics', () => {
    const result = validateBriefs([draft()],facts,'지원금·복지',now).ok[0];
    expect(result.writingGuide?.direction).toBe(guide().direction);
    expect(buildBriefPrompt('지원금·복지',facts,now,5)).toContain('writingGuide');
    expect(buildBriefPrompt('지원금·복지',facts,now,5)).toContain(facts[0].link);
    const example = buildBriefPrompt('지원금·복지',facts,now,5).split('\n').find(line => line.startsWith('{"title":'))!;
    expect(JSON.parse(example).writingGuide.homeTitles[0]).toContain('"핵심 후킹 문구"');
    const review = JSON.parse(buildTopicBriefReviewPrompt([result],facts).split('\n').pop()!);
    expect(review.briefs[0].writingGuide.images[0].url).toBe(facts[0].link);
    const board:any = publicBoard('topic-briefs',{builtAt:now.toISOString(),briefs:[{...result,documentCount:123,documentCountMeasuredAt:now.toISOString(),writingGuide:{...result.writingGuide,secret:'SECRET'}}]},now.getTime());
    expect(board.briefs[0].writingGuide.homeTitles).toHaveLength(1);
    expect(board.briefs[0].documentCount).toBe(123);
    expect(JSON.stringify(board)).not.toContain('SECRET');
  });
  it('never accepts document measurements emitted by the language model', () => {
    const result = validateBriefs([{...draft(),documentCount:123,documentCountMeasuredAt:now.toISOString()}],facts,'지원금·복지',now).ok[0];
    expect(result.documentCount).toBeNull();
    expect(result.documentCountMeasuredAt).toBeUndefined();
  });
});
