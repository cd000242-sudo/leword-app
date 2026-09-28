import { describe, it, expect, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), peek: vi.fn() }));
const searchAd = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../naver-blog-api', () => ({ getNaverBlogDocumentCount: api.get, peekCachedNaverBlogDocumentCountMeasurement: api.peek }));
vi.mock('../naver-searchad-api', () => ({getNaverSearchAdKeywordVolume:searchAd.get,SEARCHAD_VOLUME_CHUNK_SIZE:4}));
import { measureBriefDocumentCounts, measureBriefSearchVolumes } from '../../main/topic-brief-metrics';
import type { TopicBrief } from '../topic-briefs';
const brief = { coreKeyword: '지원금 신청', serpFacing: 2, documentCount: 999, documentCountMeasuredAt: 'old' } as TopicBrief;
describe('brief document measurement provenance', () => {
  it('keeps API total separate from facing and preserves original measurement time', async () => {
    api.get.mockResolvedValue(1234); api.peek.mockReturnValue({ total: 1234, measuredAt: '2026-09-28T00:00:00.000Z' });
    const [result] = await measureBriefDocumentCounts([brief], {});
    expect(result).toMatchObject({documentCount:1234,documentCountMeasuredAt:'2026-09-28T00:00:00.000Z',serpFacing:2});
    expect(brief.documentCount).toBe(999);
  });
  it('does not publish a total with unrelated or missing provenance', async () => {
    api.get.mockResolvedValue(1234); api.peek.mockReturnValue({ total: 999, measuredAt: '2026-09-28T00:00:00.000Z' });
    expect((await measureBriefDocumentCounts([brief], {}))[0].documentCount).toBeNull();
  });
  it('clears stale values on failure and propagates cancellation', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    expect((await measureBriefDocumentCounts([brief], {}))[0]).toMatchObject({documentCount:null,documentCountMeasuredAt:undefined});
    await expect(measureBriefDocumentCounts([brief], {}, {cancelled:()=>true})).rejects.toThrow('취소');
  });
});

describe('brief search volume measurement', () => {
  const now = Date.parse('2026-09-28T01:00:00Z');
  const config = {accessLicense:'test',secretKey:'test'};
  const measured = (keyword: string, pc=100, mobile=200) => ({keyword,pcSearchVolume:pc,mobileSearchVolume:mobile,totalSearchVolume:pc+mobile,measuredAtMs:now-1000,searchVolumeBindingVersion:'keyword-keyed-v2'});
  it('requests fresh API measurement and binds results by keyword rather than response order', async () => {
    searchAd.get.mockResolvedValue([measured('다른 키워드',3,4),measured(brief.coreKeyword)]);
    const result = await measureBriefSearchVolumes([brief,{...brief,coreKeyword:'다른 키워드'}],config,{now});
    expect(result.briefs.map(b=>b.searchVolume)).toEqual([300,7]);
    expect(result.volumes.get('지원금신청')).toBe(300);
    expect(result.evidenceByKeyword.get('지원금신청')?.measuredAt).toBe('2026-09-28T00:59:59.000Z');
    expect(searchAd.get).toHaveBeenLastCalledWith(config,[brief.coreKeyword,'다른 키워드'],{forceFresh:true});
  });
  it('clears prior values when API has no matching row or fails', async () => {
    searchAd.get.mockResolvedValue([measured('지원금')]);
    expect((await measureBriefSearchVolumes([brief],config,{now})).briefs[0]).toMatchObject({searchVolume:null,searchVolumeUnder10:false,searchVolumeEvidence:undefined});
    searchAd.get.mockRejectedValue(new Error('offline'));
    expect((await measureBriefSearchVolumes([brief],config,{now})).briefs[0].searchVolume).toBeNull();
  });
  it('preserves range evidence without exposing an invented exact total', async () => {
    searchAd.get.mockResolvedValue([{...measured(brief.coreKeyword),mobileSearchVolume:null,totalSearchVolume:null,mobileSearchVolumeLt10:true,svEstimated:true}]);
    const result = await measureBriefSearchVolumes([brief],config,{now});
    expect(result.briefs[0]).toMatchObject({searchVolume:null,searchVolumeUnder10:false,searchVolumeEvidence:{status:'range',totalMin:100,totalMax:109}});
    expect(result.volumes.get('지원금신청')).toBeNull();
  });
  it('can reuse fresh cache data without rewriting its source time', async () => {
    searchAd.get.mockResolvedValue([{...measured(brief.coreKeyword),measuredAtMs:now-86400_000}]);
    const result = await measureBriefSearchVolumes([brief],config,{now,forceFresh:false});
    expect(searchAd.get).toHaveBeenLastCalledWith(config,[brief.coreKeyword],{forceFresh:false});
    expect(result.briefs[0].searchVolumeEvidence?.measuredAt).toBe('2026-09-27T01:00:00.000Z');
  });
  it('does not pick an arbitrary duplicated response', async () => {
    searchAd.get.mockResolvedValue([measured(brief.coreKeyword),measured(brief.coreKeyword,500,600)]);
    const result = await measureBriefSearchVolumes([brief],config,{now});
    expect(result.briefs[0].searchVolume).toBeNull();
    expect(result.evidenceByKeyword.size).toBe(0);
  });
  it('propagates cancellation before or after an API request', async () => {
    await expect(measureBriefSearchVolumes([brief],config,{cancelled:()=>true})).rejects.toThrow('취소');
    let cancelled=false;
    searchAd.get.mockImplementation(async()=>{cancelled=true;return [measured(brief.coreKeyword)];});
    await expect(measureBriefSearchVolumes([brief],config,{cancelled:()=>cancelled})).rejects.toThrow('취소');
  });
});
