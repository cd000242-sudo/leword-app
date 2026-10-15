export const PICK_CHECK_MS = 5 * 60 * 1000;
export const PICK_REMEASURE_MS = 30 * 60 * 1000;
export interface PickRefreshState {
  blogId: string;
  checkedAt?: string;
  generatedAt?: string;
  fingerprint?: string;
  error?: string | null;
  sourceWarnings?: string[];
}
export function pickCheckDue(state: PickRefreshState | null, now: number): boolean {
  const checked = Date.parse(state?.checkedAt || '');
  return !Number.isFinite(checked) || checked > now || now - checked >= PICK_CHECK_MS;
}
export function pickNeedsRebuild(state: PickRefreshState | null, fingerprint: string, hasResult: boolean, now: number): boolean {
  const generated = Date.parse(state?.generatedAt || '');
  return !hasResult || state?.fingerprint !== fingerprint || !Number.isFinite(generated) || generated > now || now - generated >= PICK_REMEASURE_MS;
}
