import { publicBoard } from './board-cache';
import type { BriefPublicationResult } from './topic-brief-publisher';
import type { RoundSlot } from '../utils/topic-brief-rounds';

export interface BriefRecoveryDue { day: string; slot: RoundSlot; dueAtMs: number }
export interface BriefRecoveryResult { handled: boolean; ok: boolean; detail: string }
export interface BriefRecoveryDependencies {
  enabled: () => boolean;
  read: () => unknown;
  generate: (due: BriefRecoveryDue) => Promise<unknown>;
  publish: (raw: unknown) => Promise<BriefPublicationResult>;
  now?: () => number;
}

const COOLDOWN_MS = 30 * 60_000;
/** Operator recovery is single-flight, preserves generated evidence, and never manufactures a fresh date. */
export function createBriefRecovery(deps: BriefRecoveryDependencies): { recover: (due: BriefRecoveryDue) => Promise<BriefRecoveryResult> } {
  const now = deps.now || Date.now;
  let active: { key: string; promise: Promise<BriefRecoveryResult> } | null = null;
  let pending: unknown = null;
  let failedKey = '', failedUntil = 0, completedKey = '';
  function eligible(raw: any, due: BriefRecoveryDue): boolean {
    const at = Date.parse(raw?.builtAt);
    return raw?.day === due.day && raw?.slot === due.slot && Number.isFinite(at)
      && at >= due.dueAtMs && at <= now() + 300_000
      && !!publicBoard('topic-briefs', raw, now())?.briefs?.length;
  }
  function recover(due: BriefRecoveryDue): Promise<BriefRecoveryResult> {
    try {
      if (!deps.enabled()) return Promise.resolve({ handled: false, ok: false, detail: 'disabled' });
      if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due.day) || !['아침', '오후', '저녁'].includes(due.slot)
        || !Number.isFinite(due.dueAtMs) || due.dueAtMs > now()) return Promise.resolve({ handled: true, ok: false, detail: 'invalid_or_not_due' });
      const key = `${due.day}/${due.slot}/${due.dueAtMs}`;
      if (active) return active.key === key ? active.promise : Promise.resolve({ handled: true, ok: false, detail: 'recovery_in_progress' });
      if (completedKey === key) return Promise.resolve({ handled: true, ok: true, detail: 'already_recovered' });
      if (failedKey === key && now() < failedUntil) return Promise.resolve({ handled: true, ok: false, detail: 'recovery_cooldown' });
      const promise = (async (): Promise<BriefRecoveryResult> => {
        try {
          let cached: any = null;
          try { cached = deps.read(); } catch { /* A damaged cache can be recovered by generation. */ }
          if (eligible(cached, due) && (!eligible(pending, due) || Date.parse(cached.builtAt) >= Date.parse((pending as any).builtAt))) pending = cached;
          if (!eligible(pending, due)) pending = await deps.generate(due);
          if (!eligible(pending, due)) throw new Error('invalid_generation');
          const result = await deps.publish(pending);
          const ok = result.status === 'published' || (result.status === 'skipped' && ['already_published', 'newer_remote', 'richer_remote_round'].includes(result.reason));
          if (!ok) throw new Error('publication_failed');
          completedKey = key;
          failedKey = ''; failedUntil = 0;
          pending = null;
          return { handled: true, ok: true, detail: result.status === 'published' ? 'app_briefs_published' : 'remote_briefs_preserved' };
        } catch {
          failedKey = key; failedUntil = now() + COOLDOWN_MS;
          // Retain a valid generated result. The next attempt retries publication, not AI generation.
          return { handled: true, ok: false, detail: 'app_recovery_failed' };
        }
      })();
      active = { key, promise };
      void promise.finally(() => { if (active?.promise === promise) active = null; });
      return promise;
    } catch {
      return Promise.resolve({ handled: true, ok: false, detail: 'app_recovery_unavailable' });
    }
  }
  return { recover };
}
