/**
 * 키워드 워커에 실을 라이선스 코드(2026-10-20 OPERATOR-GATE).
 * 워커는 라이선스 없는 검색량 · 연관어 요청을 IP 하루 50회로 묶는다 — 앱은 license.json 의 코드를 실어 한도 없이 쓴다.
 * 코드가 없거나 이상하면 빈 문자열을 준다(그때는 워커가 소량 한도로 센다).
 */
export function licenseCodeFromJson(text: string): string {
  try {
    const code = String(JSON.parse(text)?.licenseCode || '').trim();
    return /^\S{8,80}$/.test(code) ? code : '';
  } catch {
    return '';
  }
}
