import * as fs from 'fs';
import * as path from 'path';

/** Local records only. Unknown ownership must never inherit another blog's result. */
export function blogKey(value: unknown): string | null {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{2,100}$/.test(id) ? id : null;
}

export function readJsonFile<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function saveBlogValue(dir: string, id: string, value: unknown): void {
  const key = blogKey(id);
  if (!key) throw new Error('블로그 아이디를 확인해 주세요.');
  const folder = path.join(dir, 'blogs');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${key}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(`${file}.tmp`, file);
}

export function readBlogValue<T>(dir: string, id: string, legacyFile = 'latest.json', owner = 'blogId'): T | null {
  const key = blogKey(id);
  if (!key) return null;
  const saved = readJsonFile<any>(path.join(dir, 'blogs', `${key}.json`));
  if (blogKey(saved?.[owner]) === key) return saved;
  const legacy = readJsonFile<any>(path.join(dir, legacyFile));
  return blogKey(legacy?.[owner]) === key ? legacy : null;
}

/** Preserve the previous latest record, and recover old per-day lightweight snapshots. */
export function listBlogProfiles(dir: string): any[] {
  const latest = readJsonFile<any>(path.join(dir, 'latest.json'));
  if (blogKey(latest?.blogId)) saveBlogValue(dir, latest.blogId, latest);
  const byId = new Map<string, any>();
  const scan = (folder: string, snapshots: boolean) => {
    let names: string[] = [];
    try { names = fs.readdirSync(folder).filter((n) => n.endsWith('.json')).sort(); } catch { return; }
    for (const name of names) {
      const record = readJsonFile<any>(path.join(folder, name));
      const id = blogKey(record?.blogId);
      if (!id) continue;
      const previous = byId.get(id);
      if (previous && (!snapshots || Date.parse(previous.measuredAt) >= Date.parse(record.measuredAt))) continue;
      // Never replace a full saved profile with a lightweight historical snapshot.
      if (snapshots && previous && Array.isArray(previous.posts)) continue;
      byId.set(id, record);
    }
  };
  scan(path.join(dir, 'blogs'), false);
  scan(path.join(dir, 'snapshots'), true);
  return [...byId.values()].sort((a, b) => String(b.measuredAt).localeCompare(String(a.measuredAt)));
}
