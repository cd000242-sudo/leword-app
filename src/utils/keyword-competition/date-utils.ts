/**
 * 날짜 유틸리티
 */

/**
 * N일 전 계산
 */
export function getDaysAgo(date: Date): number {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * 날짜 문자열 파싱 (네이버 형식)
 */
export function parseNaverDate(dateStr: string): Date {
  if (!dateStr) {
    return new Date();
  }
  
  const now = new Date();
  
  // "N일 전" 형식
  const daysAgoMatch = dateStr.match(/(\d+)일\s*전/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1]);
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date;
  }
  
  // "N시간 전" 형식
  const hoursAgoMatch = dateStr.match(/(\d+)시간\s*전/);
  if (hoursAgoMatch) {
    const hours = parseInt(hoursAgoMatch[1]);
    const date = new Date(now);
    date.setHours(date.getHours() - hours);
    return date;
  }
  
  // "N분 전" 형식
  const minutesAgoMatch = dateStr.match(/(\d+)분\s*전/);
  if (minutesAgoMatch) {
    const minutes = parseInt(minutesAgoMatch[1]);
    const date = new Date(now);
    date.setMinutes(date.getMinutes() - minutes);
    return date;
  }
  
  // "N개월 전" 형식
  const monthsAgoMatch = dateStr.match(/(\d+)개월\s*전/);
  if (monthsAgoMatch) {
    const months = parseInt(monthsAgoMatch[1]);
    const date = new Date(now);
    date.setMonth(date.getMonth() - months);
    return date;
  }
  
  // "N년 전" 형식
  const yearsAgoMatch = dateStr.match(/(\d+)년\s*전/);
  if (yearsAgoMatch) {
    const years = parseInt(yearsAgoMatch[1]);
    const date = new Date(now);
    date.setFullYear(date.getFullYear() - years);
    return date;
  }
  
  // "YYYY.MM.DD" 형식
  const dateMatch = dateStr.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  // 파싱 실패 시 현재 날짜 반환
  return now;
}






