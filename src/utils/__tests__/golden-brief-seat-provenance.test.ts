import { describe, expect, it } from 'vitest';
import { carrySeats, type TopicBrief, type BriefRound } from '../topic-briefs';
const brief = (patch = {}): TopicBrief => ({coreKeyword:'청년 창업 지원',serpFacing:null,serpVacancy:null,...patch} as TopicBrief);
describe('daily golden candidate seat provenance',()=>{
  it('retains actual measurement age across publication rounds',()=>{
    const measuredAt='2026-09-30T08:00:00Z';
    const old=brief({serpFacing:1,serpVacancy:2,serpMeasuredAt:measuredAt,serpSampled:10});
    const result=carrySeats([brief()], [{builtAt:'2026-10-03T00:00:00Z',briefs:[old]} as BriefRound]);
    expect(result[0]).toMatchObject({serpMeasuredAt:measuredAt,serpSampled:10,serpFacing:1});
    expect(old.serpMeasuredAt).toBe(measuredAt);
  });
  it('never synthesizes a timestamp for legacy measurements or another query',()=>{
    const [same,other]=carrySeats([brief(),brief({coreKeyword:'다른 지원금'})],[{builtAt:'2026-10-03T00:00:00Z',briefs:[brief({serpFacing:0,serpVacancy:1})]} as BriefRound]);
    expect(same.serpMeasuredAt).toBeUndefined();expect(same.serpSampled).toBeUndefined();expect(other.serpFacing).toBeNull();
  });
});
