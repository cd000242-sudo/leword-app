import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const HOME_KEYWORD_BRIEFING_FORMULA_VERSION = 'search-volume-divided-by-documents-plus-one-v1';
const MAX_ROWS = 240;
const MAX_SOURCE_IMAGES = 12;
const MAX_STORED_BYTES = 1024 * 1024;
const MAX_SEARCH_VOLUME = 1_000_000_000;
const MAX_DOCUMENT_COUNT = 10_000_000_000;
const MAX_IMAGE_DIMENSION = 32_768;
const MAX_REVISION = Number.MAX_SAFE_INTEGER;

export interface HomeKeywordBriefingRow {
  keyword: string;
  searchVolume: number;
  documentCount: number;
  opportunity: number;
  ocrConfidence?: number;
  /**
   * Manus 가 발행 시점에 추론한 "이 키워드를 왜 검색하는지" 한 문장.
   * 없으면(크레딧 없음·미충전) 브라우저가 사전·규칙으로 폴백한다.
   */
  searchReason?: string;
}

export interface HomeKeywordBriefingSourceImage {
  name: string;
  sha256: string;
  width: number;
  height: number;
}

export interface HomeKeywordBriefingSnapshot {
  snapshotId: string;
  title: string;
  author: string;
  publishedAt: string;
  revision: number;
  formulaVersion: typeof HOME_KEYWORD_BRIEFING_FORMULA_VERSION;
  source: 'admin-image-ocr-reviewed';
  sourceImages: HomeKeywordBriefingSourceImage[];
  rows: HomeKeywordBriefingRow[];
  updatedBy: string;
}

export class HomeKeywordBriefingRevisionConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super(`home keyword briefing revision conflict: expected ${expectedRevision}, current ${currentRevision}`);
    this.name = 'HomeKeywordBriefingRevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export class HomeKeywordBriefingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeKeywordBriefingValidationError';
  }
}

export class HomeKeywordBriefingStorageError extends Error {
  readonly operation: 'read' | 'write';
  readonly cause?: unknown;

  constructor(operation: 'read' | 'write', cause?: unknown) {
    super(`home keyword briefing storage ${operation} failed`);
    this.name = 'HomeKeywordBriefingStorageError';
    this.operation = operation;
    this.cause = cause;
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validatedText(
  value: unknown,
  field: string,
  maxLength: number,
  fallback?: string,
): string {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new HomeKeywordBriefingValidationError(`${field} must be a non-empty string`);
  }
  if (typeof value !== 'string') {
    throw new HomeKeywordBriefingValidationError(`${field} must be a string`);
  }
  const normalized = normalizeText(value);
  if (!normalized) {
    if (fallback !== undefined) return fallback;
    throw new HomeKeywordBriefingValidationError(`${field} must be a non-empty string`);
  }
  if (normalized.length > maxLength) {
    throw new HomeKeywordBriefingValidationError(`${field} exceeds ${maxLength} characters`);
  }
  return normalized;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= min
    && value <= max
    ? value
    : null;
}

function positiveInteger(value: unknown, max: number): number | null {
  return boundedInteger(value, 1, max);
}

function nonNegativeInteger(value: unknown, max: number): number | null {
  return boundedInteger(value, 0, max);
}

function sanitizeRows(value: unknown): HomeKeywordBriefingRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HomeKeywordBriefingValidationError('home keyword briefing rows must be a non-empty array');
  }
  if (value.length > MAX_ROWS) {
    throw new HomeKeywordBriefingValidationError(`home keyword briefing supports at most ${MAX_ROWS} rows`);
  }
  const rows: HomeKeywordBriefingRow[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new HomeKeywordBriefingValidationError(`home keyword briefing row ${index + 1} is invalid`);
    }
    const raw = candidate as Record<string, unknown>;
    const keyword = validatedText(raw.keyword, `home keyword briefing row ${index + 1} keyword`, 120);
    const searchVolume = positiveInteger(raw.searchVolume, MAX_SEARCH_VOLUME);
    const documentCount = nonNegativeInteger(raw.documentCount, MAX_DOCUMENT_COUNT);
    if (searchVolume === null || documentCount === null) {
      throw new HomeKeywordBriefingValidationError(`home keyword briefing row ${index + 1} is invalid`);
    }
    const confidence = raw.ocrConfidence;
    if (confidence !== undefined && (
      typeof confidence !== 'number'
      || !Number.isFinite(confidence)
      || confidence < 0
      || confidence > 100
    )) {
      throw new HomeKeywordBriefingValidationError(`home keyword briefing row ${index + 1} ocrConfidence is invalid`);
    }
    // Manus 추론 문구(선택). 없거나 형식이 이상하면 조용히 버린다 — 폴백이 처리한다.
    const rawReason = typeof raw.searchReason === 'string' ? raw.searchReason.trim() : '';
    const searchReason = rawReason ? rawReason.slice(0, 400) : '';
    rows.push({
      keyword,
      searchVolume,
      documentCount,
      opportunity: Math.round((searchVolume / (documentCount + 1)) * 100) / 100,
      ...(typeof confidence === 'number'
        ? { ocrConfidence: Math.round(confidence * 100) / 100 }
        : {}),
      ...(searchReason ? { searchReason } : {}),
    });
  }
  return rows;
}

function sanitizeSourceImages(value: unknown): HomeKeywordBriefingSourceImage[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new HomeKeywordBriefingValidationError('home keyword briefing sourceImages must be an array');
  }
  if (value.length > MAX_SOURCE_IMAGES) {
    throw new HomeKeywordBriefingValidationError(`home keyword briefing supports at most ${MAX_SOURCE_IMAGES} source images`);
  }
  const images: HomeKeywordBriefingSourceImage[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new HomeKeywordBriefingValidationError(`home keyword briefing source image ${index + 1} is invalid`);
    }
    const raw = candidate as Record<string, unknown>;
    const name = validatedText(raw.name, `home keyword briefing source image ${index + 1} name`, 160);
    const sha256 = validatedText(raw.sha256, `home keyword briefing source image ${index + 1} sha256`, 64).toLowerCase();
    const width = positiveInteger(raw.width, MAX_IMAGE_DIMENSION);
    const height = positiveInteger(raw.height, MAX_IMAGE_DIMENSION);
    if (!/^[a-f0-9]{64}$/.test(sha256) || width === null || height === null) {
      throw new HomeKeywordBriefingValidationError(`home keyword briefing source image ${index + 1} is invalid`);
    }
    images.push({ name, sha256, width, height });
  }
  return images;
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
}): HomeKeywordBriefingSnapshot {
  if (!options.value || typeof options.value !== 'object' || Array.isArray(options.value)) {
    throw new HomeKeywordBriefingValidationError('home keyword briefing must be an object');
  }
  const raw = options.value as Record<string, unknown>;
  const title = validatedText(raw.title, 'home keyword briefing title', 120, '부방장 키워드 브리핑');
  const author = validatedText(raw.author, 'home keyword briefing author', 60, '부방장');
  const sourceImages = sanitizeSourceImages(raw.sourceImages);
  const rows = sanitizeRows(raw.rows);
  const canonical = {
    title,
    author,
    publishedAt: options.publishedAt,
    revision: options.revision,
    formulaVersion: HOME_KEYWORD_BRIEFING_FORMULA_VERSION as typeof HOME_KEYWORD_BRIEFING_FORMULA_VERSION,
    source: 'admin-image-ocr-reviewed' as const,
    sourceImages,
    rows,
    updatedBy: validatedText(options.updatedBy, 'home keyword briefing updatedBy', 80, 'admin'),
  };
  return {
    snapshotId: `kb-${crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16)}`,
    ...canonical,
  };
}

export function resolveHomeKeywordBriefingFile(): string {
  const explicitFile = process.env['LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE']
    || process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'];
  if (explicitFile) {
    return path.resolve(explicitFile);
  }
  const dataRoot = process.env['LEWORD_API_DATA_DIR']
    || (fs.existsSync('/briefing')
      ? '/briefing'
      : fs.existsSync('/data') ? '/data' : path.resolve(process.cwd(), 'data'));
  return path.join(dataRoot, 'home-keyword-briefing.json');
}

export function readHomeKeywordBriefing(
  filePath = resolveHomeKeywordBriefingFile(),
): HomeKeywordBriefingSnapshot | null {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw new HomeKeywordBriefingStorageError('read', error);
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_STORED_BYTES) {
    throw new HomeKeywordBriefingStorageError('read');
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HomeKeywordBriefingValidationError('stored home keyword briefing must be an object');
    }
    const revision = positiveInteger(raw.revision, MAX_REVISION);
    const publishedAt = validIso(raw.publishedAt);
    if (revision === null || !publishedAt) {
      throw new HomeKeywordBriefingValidationError('stored home keyword briefing metadata is invalid');
    }
    return buildSnapshot({
      value: raw,
      revision,
      publishedAt,
      updatedBy: validatedText(raw.updatedBy, 'stored home keyword briefing updatedBy', 80, 'admin'),
    });
  } catch (error) {
    if (error instanceof HomeKeywordBriefingStorageError) throw error;
    throw new HomeKeywordBriefingStorageError('read', error);
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup; preserve the original storage failure.
    }
    throw new HomeKeywordBriefingStorageError('write', error);
  }
}

export function publishHomeKeywordBriefing(options: {
  value: unknown;
  expectedRevision: unknown;
  updatedBy?: unknown;
  now?: Date;
  filePath?: string;
}): HomeKeywordBriefingSnapshot {
  const filePath = options.filePath || resolveHomeKeywordBriefingFile();
  const current = readHomeKeywordBriefing(filePath);
  const currentRevision = current?.revision || 0;
  const expectedRevision = nonNegativeInteger(options.expectedRevision, MAX_REVISION);
  if (expectedRevision === null) {
    throw new HomeKeywordBriefingValidationError('expectedRevision must be a non-negative safe integer');
  }
  const comparisonSnapshot = buildSnapshot({
    value: options.value,
    revision: currentRevision || 1,
    publishedAt: current?.publishedAt || new Date(0).toISOString(),
    updatedBy: current?.updatedBy || validatedText(options.updatedBy, 'home keyword briefing updatedBy', 80, 'admin'),
  });
  const contentKey = (snapshot: HomeKeywordBriefingSnapshot) => JSON.stringify({
    title: snapshot.title,
    author: snapshot.author,
    formulaVersion: snapshot.formulaVersion,
    source: snapshot.source,
    sourceImages: snapshot.sourceImages,
    rows: snapshot.rows,
  });
  if (current && contentKey(comparisonSnapshot) === contentKey(current)) return current;
  if (expectedRevision !== currentRevision) {
    throw new HomeKeywordBriefingRevisionConflictError(expectedRevision, currentRevision);
  }
  if (currentRevision >= MAX_REVISION) {
    throw new HomeKeywordBriefingValidationError('home keyword briefing revision limit reached');
  }
  const publishedAt = (options.now || new Date()).toISOString();
  const snapshot = buildSnapshot({
    value: options.value,
    revision: currentRevision + 1,
    publishedAt,
    updatedBy: validatedText(options.updatedBy, 'home keyword briefing updatedBy', 80, 'admin'),
  });
  atomicWriteJson(filePath, snapshot);
  return snapshot;
}
