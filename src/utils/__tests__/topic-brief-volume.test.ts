import { describe, expect, it } from 'vitest';
import { applyBriefSearchVolumeEvidence, normalizeBriefSearchVolumeEvidence, readBriefSearchVolumeEvidence } from '../topic-brief-volume';
import { SEARCHAD_KEYWORD_BINDING_VERSION } from '../searchad-result-alignment';

const now = Date.parse('2026-09-28T01:00:00Z');
const row = { keyword: '소상공인 지원금', pcSearchVolume: 100, mobileSearchVolume: 230, totalSearchVolume: 330, measuredAtMs: now - 60_000, searchVolumeBindingVersion: SEARCHAD_KEYWORD_BINDING_VERSION };

describe('brief search volume source evidence', () => {
  it('retains exact device totals and the original cached measurement time', () => {
    expect(readBriefSearchVolumeEvidence('소상공인지원금', row, { now })).toMatchObject({source:'naver-searchad',keyword:'소상공인지원금',pc:100,mobile:230,totalMin:330,totalMax:330,status:'exact',measuredAt:'2026-09-28T00:59:00.000Z'});
  });
  it('preserves both <10 bounds instead of falsely showing total <10 or zero', () => {
    const evidence = readBriefSearchVolumeEvidence(row.keyword, {...row,pcSearchVolume:null,mobileSearchVolume:null,totalSearchVolume:null,pcSearchVolumeLt10:true,mobileSearchVolumeLt10:true,svEstimated:true}, {now});
    expect(evidence).toMatchObject({pc:null,mobile:null,pcUnder10:true,mobileUnder10:true,totalMin:0,totalMax:18,status:'range'});
    expect(applyBriefSearchVolumeEvidence({coreKeyword:row.keyword,searchVolume:88,searchVolumeUnder10:true}, evidence)).toMatchObject({searchVolume:null,searchVolumeUnder10:false,searchVolumeEvidence:evidence});
  });
  it('retains mixed numeric and <10 as an interval', () => {
    expect(readBriefSearchVolumeEvidence(row.keyword, {...row,mobileSearchVolume:null,totalSearchVolume:null,mobileSearchVolumeLt10:true,svEstimated:true}, {now})).toMatchObject({totalMin:100,totalMax:109,status:'range'});
  });
  it('accepts actually measured exact zero', () => {
    expect(readBriefSearchVolumeEvidence(row.keyword, {...row,pcSearchVolume:0,mobileSearchVolume:0,totalSearchVolume:0}, {now})).toMatchObject({status:'exact',totalMin:0,totalMax:0});
  });
  it.each([
    null,
    {...row,keyword:'지원금'},
    {...row,searchVolumeBindingVersion:undefined},
    {...row,measuredAtMs:undefined},
    {...row,measuredAtMs:now+1},
    {...row,measuredAtMs:now-31*86400_000},
    {...row,mobileSearchVolume:null,totalSearchVolume:null},
    {...row,totalSearchVolume:999},
    {...row,pcSearchVolume:1.5},
    {...row,svEstimated:true},
    {...row,pcSearchVolumeLt10:true},
  ])('rejects missing, stale, borrowed, contradictory or estimated measurement %#', bad => {
    expect(readBriefSearchVolumeEvidence(row.keyword,bad,{now})).toBeNull();
  });
  it('clears stale numeric/range evidence when measurement is unknown or belongs to another query', () => {
    const evidence = readBriefSearchVolumeEvidence(row.keyword,row,{now});
    const input = {coreKeyword:'다른 키워드',searchVolume:330,searchVolumeUnder10:true,searchVolumeEvidence:evidence};
    expect(applyBriefSearchVolumeEvidence(input,evidence)).toMatchObject({searchVolume:null,searchVolumeUnder10:false,searchVolumeEvidence:undefined});
    expect(applyBriefSearchVolumeEvidence(input,null).searchVolume).toBeNull();
  });
  it('validates stored evidence without trusting declared totals or changing the original timestamp', () => {
    const exact = readBriefSearchVolumeEvidence(row.keyword,row,{now})!;
    const range = readBriefSearchVolumeEvidence(row.keyword,{...row,mobileSearchVolume:null,totalSearchVolume:null,mobileSearchVolumeLt10:true},{now})!;
    expect(normalizeBriefSearchVolumeEvidence(row.keyword,exact,{now})).toEqual(exact);
    expect(normalizeBriefSearchVolumeEvidence(row.keyword,range,{now})).toEqual(range);
    for (const invalid of [null,[],{}, {...exact,source:'ai'}, {...exact,keyword:'다른 지원금'}, {...exact,totalMin:1000}, {...exact,totalMax:1000}, {...exact,status:'range'}, {...exact,pc:'100'}, {...exact,pcUnder10:'false'}, {...exact,measuredAt:'bad'}, {...exact,measuredAt:new Date(now+1).toISOString()}, {...exact,measuredAt:new Date(now-31*86400_000).toISOString()}, {...range,totalMax:110}, {...range,mobileUnder10:undefined}, {...range,totalMin:'100'}]) {
      expect(normalizeBriefSearchVolumeEvidence(row.keyword,invalid,{now})).toBeNull();
    }
  });
});
