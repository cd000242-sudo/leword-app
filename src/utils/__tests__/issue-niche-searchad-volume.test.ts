import { describe, expect, it } from 'vitest';
import { readSearchAdVolume } from '../searchad-volume-read';

/**
 * 검색광고 키워드도구의 "< 10" 은 실측 답이지 추정이 아니다. 공유 조회기는 이를
 * svEstimated 로 표시하는데, 그대로 추정으로 받으면 발행기가 검색량을 지운다
 * (실사고 2026-09-03 '지예은 남편': 모바일 50 / PC "< 10" → 화면 '—').
 */
describe('readSearchAdVolume — 키워드도구 응답 읽기', () => {
  it('한쪽만 "< 10" 이면 숫자 쪽을 살리고 Lt10 표식을 붙인다 — 추정 아님', () => {
    const read = readSearchAdVolume({
      pcSearchVolume: null, mobileSearchVolume: 50,
      pcSearchVolumeLt10: true, mobileSearchVolumeLt10: false, svEstimated: true,
    });
    expect(read).toEqual({ searchVolume: 50, searchVolumeLt10: true, isSearchVolumeEstimated: false });
  });

  it('양쪽 다 "< 10" 이면 null + Lt10 — 못 잰 게 아니라 적은 것이다', () => {
    const read = readSearchAdVolume({
      pcSearchVolume: null, mobileSearchVolume: null,
      pcSearchVolumeLt10: true, mobileSearchVolumeLt10: true, svEstimated: true,
    });
    expect(read).toEqual({ searchVolume: null, searchVolumeLt10: true, isSearchVolumeEstimated: false });
  });

  it('도구에 아예 없으면 null 이고 Lt10 도 아니다', () => {
    expect(readSearchAdVolume(undefined)).toEqual({ searchVolume: null, searchVolumeLt10: false, isSearchVolumeEstimated: false });
    const noMatch = readSearchAdVolume({
      pcSearchVolume: null, mobileSearchVolume: null,
      pcSearchVolumeLt10: false, mobileSearchVolumeLt10: false, svEstimated: false,
    });
    expect(noMatch).toEqual({ searchVolume: null, searchVolumeLt10: false, isSearchVolumeEstimated: false });
  });

  it('양쪽 숫자면 합이고, 조회기가 진짜 추정이라 표시한 것만 추정으로 남긴다', () => {
    expect(readSearchAdVolume({ pcSearchVolume: 120, mobileSearchVolume: 380 }).searchVolume).toBe(500);
    expect(readSearchAdVolume({ pcSearchVolume: 120, mobileSearchVolume: 380, isSearchVolumeEstimated: true }).isSearchVolumeEstimated).toBe(true);
  });
});
