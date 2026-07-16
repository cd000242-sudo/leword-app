import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAX_NOTICES = 50;
const MAX_STORED_BYTES = 1024 * 1024;
const MAX_REVISION = Number.MAX_SAFE_INTEGER;
const MAX_ID_LENGTH = 100;
const MAX_BADGE_LENGTH = 30;
const MAX_TITLE_LENGTH = 200;
const MAX_PREVIEW_LENGTH = 300;
const MAX_BODY_LENGTH = 8_000;

function serializeStoredJson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export interface HomeNotice {
  id: string;
  badge: string;
  date: string;
  title: string;
  preview: string;
  body: string;
}

export interface HomeNoticesSnapshot {
  snapshotId: string;
  publishedAt: string;
  revision: number;
  notices: HomeNotice[];
  updatedBy: string;
}

export class HomeNoticesRevisionConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super(`home notices revision conflict: expected ${expectedRevision}, current ${currentRevision}`);
    this.name = 'HomeNoticesRevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export class HomeNoticesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeNoticesValidationError';
  }
}

export class HomeNoticesStorageError extends Error {
  readonly operation: 'read' | 'write';
  readonly cause?: unknown;

  constructor(operation: 'read' | 'write', cause?: unknown) {
    super(`home notices storage ${operation} failed`);
    this.name = 'HomeNoticesStorageError';
    this.operation = operation;
    this.cause = cause;
  }
}

function stripMarkup(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ');
}

function normalizeSingleLine(value: string): string {
  return stripMarkup(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBody(value: string): string {
  const lines = stripMarkup(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function validatedText(options: {
  value: unknown;
  field: string;
  maxLength: number;
  multiline?: boolean;
  allowEmpty?: boolean;
}): string {
  if (typeof options.value !== 'string') {
    throw new HomeNoticesValidationError(`${options.field} must be a string`);
  }
  if (options.value.length > options.maxLength) {
    throw new HomeNoticesValidationError(`${options.field} exceeds ${options.maxLength} characters`);
  }
  const normalized = options.multiline ? normalizeBody(options.value) : normalizeSingleLine(options.value);
  if (!normalized && !options.allowEmpty) {
    throw new HomeNoticesValidationError(`${options.field} must be a non-empty string`);
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, max: number): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= max
    ? value
    : null;
}

function positiveInteger(value: unknown, max: number): number | null {
  const parsed = nonNegativeInteger(value, max);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function canonicalDate(value: unknown, field: string): string {
  const raw = validatedText({ value, field, maxLength: 10 }).replace(/\./g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HomeNoticesValidationError(`${field} must use YYYY-MM-DD or YYYY.MM.DD`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new HomeNoticesValidationError(`${field} is not a valid calendar date`);
  }
  return raw;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sanitizeNotices(value: unknown): HomeNotice[] {
  if (!Array.isArray(value)) {
    throw new HomeNoticesValidationError('home notices must be an array');
  }
  if (value.length > MAX_NOTICES) {
    throw new HomeNoticesValidationError(`home notices supports at most ${MAX_NOTICES} notices`);
  }
  const ids = new Set<string>();
  const notices = value.map((candidate, index): HomeNotice => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new HomeNoticesValidationError(`home notice ${index + 1} must be an object`);
    }
    const raw = candidate as Record<string, unknown>;
    const field = (name: string) => `home notice ${index + 1} ${name}`;
    const id = validatedText({ value: raw.id, field: field('id'), maxLength: MAX_ID_LENGTH });
    if (ids.has(id)) {
      throw new HomeNoticesValidationError(`home notice id ${id} is duplicated`);
    }
    ids.add(id);
    return {
      id,
      badge: validatedText({ value: raw.badge, field: field('badge'), maxLength: MAX_BADGE_LENGTH }),
      date: canonicalDate(raw.date, field('date')),
      title: validatedText({ value: raw.title, field: field('title'), maxLength: MAX_TITLE_LENGTH }),
      preview: validatedText({
        value: raw.preview,
        field: field('preview'),
        maxLength: MAX_PREVIEW_LENGTH,
        allowEmpty: true,
      }),
      body: validatedText({
        value: raw.body,
        field: field('body'),
        maxLength: MAX_BODY_LENGTH,
        multiline: true,
      }),
    };
  });
  return notices.sort((left, right) => compareText(right.date, left.date) || compareText(left.id, right.id));
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function buildSnapshot(options: {
  value: unknown;
  revision: number;
  publishedAt: string;
  updatedBy: string;
}): HomeNoticesSnapshot {
  if (!options.value || typeof options.value !== 'object' || Array.isArray(options.value)) {
    throw new HomeNoticesValidationError('home notices snapshot must be an object');
  }
  const raw = options.value as Record<string, unknown>;
  const notices = sanitizeNotices(raw.notices);
  const updatedBy = validatedText({
    value: options.updatedBy,
    field: 'home notices updatedBy',
    maxLength: 80,
  });
  const canonical = {
    publishedAt: options.publishedAt,
    revision: options.revision,
    notices,
    updatedBy,
  };
  const snapshot: HomeNoticesSnapshot = {
    snapshotId: `hn-${crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16)}`,
    ...canonical,
  };
  if (Buffer.byteLength(serializeStoredJson(snapshot), 'utf8') > MAX_STORED_BYTES) {
    throw new HomeNoticesValidationError('home notices snapshot exceeds the storage limit');
  }
  return snapshot;
}

export function resolveHomeNoticesFile(): string {
  if (process.env['LEWORD_HOME_NOTICES_FILE']) {
    return path.resolve(process.env['LEWORD_HOME_NOTICES_FILE']);
  }
  const dataRoot = process.env['LEWORD_API_DATA_DIR']
    || (fs.existsSync('/data') ? '/data' : path.resolve(process.cwd(), 'data'));
  return path.join(dataRoot, 'home-notices.json');
}

export function readHomeNotices(filePath = resolveHomeNoticesFile()): HomeNoticesSnapshot | null {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw new HomeNoticesStorageError('read', error);
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_STORED_BYTES) {
    throw new HomeNoticesStorageError('read');
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HomeNoticesValidationError('stored home notices snapshot must be an object');
    }
    const revision = positiveInteger(raw.revision, MAX_REVISION);
    const publishedAt = validIso(raw.publishedAt);
    if (revision === null || !publishedAt) {
      throw new HomeNoticesValidationError('stored home notices metadata is invalid');
    }
    const rebuilt = buildSnapshot({
      value: raw,
      revision,
      publishedAt,
      updatedBy: validatedText({
        value: raw.updatedBy,
        field: 'stored home notices updatedBy',
        maxLength: 80,
      }),
    });
    if (raw.snapshotId !== rebuilt.snapshotId) {
      throw new HomeNoticesValidationError('stored home notices checksum is invalid');
    }
    return rebuilt;
  } catch (error) {
    if (error instanceof HomeNoticesStorageError) throw error;
    throw new HomeNoticesStorageError('read', error);
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tempPath, serializeStoredJson(value), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup; preserve the original storage error.
    }
    throw new HomeNoticesStorageError('write', error);
  }
}

function contentKey(snapshot: HomeNoticesSnapshot): string {
  return JSON.stringify(snapshot.notices);
}

export function publishHomeNotices(options: {
  value: unknown;
  expectedRevision: unknown;
  updatedBy?: unknown;
  now?: Date;
  filePath?: string;
}): HomeNoticesSnapshot {
  const filePath = options.filePath || resolveHomeNoticesFile();
  const current = readHomeNotices(filePath);
  const currentRevision = current?.revision || 0;
  const expectedRevision = nonNegativeInteger(options.expectedRevision, MAX_REVISION);
  if (expectedRevision === null) {
    throw new HomeNoticesValidationError('expectedRevision must be a non-negative safe integer');
  }
  const comparison = buildSnapshot({
    value: options.value,
    revision: currentRevision || 1,
    publishedAt: current?.publishedAt || new Date(0).toISOString(),
    updatedBy: current?.updatedBy || validatedText({
      value: options.updatedBy ?? 'admin',
      field: 'home notices updatedBy',
      maxLength: 80,
    }),
  });
  if (current && contentKey(comparison) === contentKey(current)) return current;
  if (expectedRevision !== currentRevision) {
    throw new HomeNoticesRevisionConflictError(expectedRevision, currentRevision);
  }
  if (currentRevision >= MAX_REVISION) {
    throw new HomeNoticesValidationError('home notices revision limit reached');
  }
  const snapshot = buildSnapshot({
    value: options.value,
    revision: currentRevision + 1,
    publishedAt: (options.now || new Date()).toISOString(),
    updatedBy: validatedText({
      value: options.updatedBy ?? 'admin',
      field: 'home notices updatedBy',
      maxLength: 80,
    }),
  });
  atomicWriteJson(filePath, snapshot);
  return snapshot;
}
