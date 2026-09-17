/** 근거와 편집 제안은 구분한다. v1 저장 데이터에 추가되는 선택적 계약이다. */
export const EDITORIAL_VERSION = 'homefeed-editorial-1';

export interface EditorialSource {
  id: string;
  url: string;
  title: string;
  press: string | null;
  publishedAt: string | null;
  level: 'headline' | 'description' | 'body';
  text: string;
  contentHash: string;
  fetchStatus: 'not_requested' | 'ok' | 'unavailable';
  imageUrl: string | null;
}

export interface EditorialFact {
  id: string;
  text: string;
  supports: Array<{ sourceId: string; excerpt: string }>;
}

export interface EditorialSection {
  id: string;
  question: string;
  answer: string;
  factIds: string[];
}

export interface EditorialAngle {
  id: string;
  label: string;
  readerQuestion: string;
  difference: string;
  sectionIds: string[];
  suggestedTitle: string;
  firstCard: { line1: string; line2: string };
}

export interface EditorialContent {
  summary: string;
  summaryFactIds: string[];
  whyNow: string;
  whyNowFactIds: string[];
  audience: string;
  facts: EditorialFact[];
  recommendedAngleId: string;
  angles: EditorialAngle[];
  sections: EditorialSection[];
  unresolved: string[];
}

export interface EditorialBrief extends EditorialContent {
  id: string;
  version: typeof EDITORIAL_VERSION;
  revision: string;
  evidenceRevision: string;
  sourceRevision: string;
  createdAt: string;
  provider: string;
  sources: EditorialSource[];
  readiness: 'ready' | 'needs_evidence';
  problems: string[];
  review: { passed: boolean; issues: string[] };
}

export interface EditorialSelection {
  revision: number;
  briefRevision: string;
  evidenceRevision: string;
  angleId: string;
  title: string;
  card: { line1: string; line2: string };
  /** source id or generated image id, never an array offset. */
  imageId: string | null;
  selectedAt: string;
}

export interface EditorialFailure { at: string; evidenceRevision: string; message: string }

export interface EditorialView {
  state: 'unprepared' | 'ready' | 'needs_evidence' | 'stale' | 'failed';
  evidenceRevision: string;
  summary: string;
  sourceTitle: string;
  sourceUrl: string | null;
  brief: EditorialBrief | null;
  selection: EditorialSelection | null;
  error: string | null;
  public?: boolean;
  shared?: boolean;
}

export interface EditorialBriefInput { id: string; provider?: string; force?: boolean; evidenceRevision?: string }
export interface EditorialSelectInput {
  id: string;
  briefRevision: string;
  evidenceRevision: string;
  expectedRevision: number;
  angleId: string;
  title: string;
  card: { line1: string; line2: string };
  imageId: string | null;
}
