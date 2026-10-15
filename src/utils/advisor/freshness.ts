/** Statistics describe a reporting day; collecting today does not make an old day current. */
export function advisorFreshness(record: { day: string; collectedAt?: string; missing?: string[] } | null, now = new Date()) {
  const targetDay = new Date(now.getTime() + 9 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(record?.day || '');
  const stale = !validDay || record!.day !== targetDay;
  return { targetDay, stale, incomplete: Boolean(record?.missing?.length), collectedAt: record?.collectedAt || null };
}
