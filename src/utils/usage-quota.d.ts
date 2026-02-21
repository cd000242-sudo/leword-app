declare module '../utils/usage-quota.js' {
  export const HOURLY_LIMIT: number;
  export const DAILY_LIMIT: number;
  export function checkAndIncrement(group: string): { ok: boolean; error?: string };
}
declare module '*usage-quota.js';


