/**
 * 검색광고 키워드도구 응답을 "검색량 한 줄"로 읽는다 — 실검 틈새 헌터와 이월 행
 * 재측정이 같은 눈으로 읽어야 같은 행이 회차마다 다른 값으로 안 흔들린다.
 *
 * 키워드도구는 한 달 검색이 10회 미만이면 숫자 대신 "< 10" 을 준다. 이건 실측 답이지
 * 추정이 아닌데, 공유 조회기는 이를 `svEstimated` 로 표시한다(휴리스틱 fallback 이
 * v2.49.22 에 사라진 뒤로는 그 플래그가 "< 10" 과 같은 뜻). 그걸 추정으로 받으면
 * 발행기가 검색량을 지워 모바일 50 / PC "< 10" 인 '지예은 남편' 이 화면에 '—' 로
 * 나갔다(실사고 2026-09-03).
 */

export type SearchAdVolumeRead = {
  /** 한쪽이라도 숫자면 그 합("< 10" 쪽은 0 으로 더한다). 양쪽 다 "< 10" 이거나 도구에 없으면 null. */
  searchVolume: number | null;
  /** PC·모바일 어느 한쪽이라도 "< 10" 이었는가 — null 이 '못 잰 것'인지 '적은 것'인지 가른다. */
  searchVolumeLt10: boolean;
  /** 조회기가 진짜 추정("< 10" 아님)이라 표시한 것만 남긴다. */
  isSearchVolumeEstimated: boolean;
};

export type SearchAdVolumeLike = {
  pcSearchVolume: number | null;
  mobileSearchVolume: number | null;
  pcSearchVolumeLt10?: boolean;
  mobileSearchVolumeLt10?: boolean;
  svEstimated?: boolean;
  isSearchVolumeEstimated?: boolean;
};

export function readSearchAdVolume(v: SearchAdVolumeLike | undefined | null): SearchAdVolumeRead {
  if (!v) return { searchVolume: null, searchVolumeLt10: false, isSearchVolumeEstimated: false };
  const searchVolume = v.pcSearchVolume !== null || v.mobileSearchVolume !== null
    ? (v.pcSearchVolume ?? 0) + (v.mobileSearchVolume ?? 0) : null;
  const searchVolumeLt10 = v.pcSearchVolumeLt10 === true || v.mobileSearchVolumeLt10 === true
    || v.svEstimated === true;
  return { searchVolume, searchVolumeLt10, isSearchVolumeEstimated: v.isSearchVolumeEstimated === true };
}
