import type {
  MobileKeywordExportArtifact,
  MobileKeywordExportFormat,
  MobileKeywordExportRequest,
  MobileKeywordMetric,
} from './contracts';

interface BuildMobileKeywordExportOptions extends MobileKeywordExportRequest {
  now?: () => Date;
}

const MIME_BY_FORMAT: Record<MobileKeywordExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  text: 'text/plain;charset=utf-8',
};

function normalizeTitle(value: unknown): string {
  return String(value || 'leword-keywords')
    .trim()
    .replace(/\s+/g, ' ')
    || 'leword-keywords';
}

function safeFilename(title: string, date: string, format: MobileKeywordExportFormat): string {
  const safe = title
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'leword-keywords';
  const extension = format === 'text' ? 'txt' : format;
  return `${safe}_${date}.${extension}`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function numberCell(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function textNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR') : '-';
}

function normalizeKeyword(item: MobileKeywordMetric): MobileKeywordMetric {
  return {
    ...item,
    keyword: String(item.keyword || '').trim(),
    grade: item.grade || 'C',
    category: String(item.category || ''),
    source: String(item.source || ''),
    intent: String(item.intent || ''),
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    isMeasured: item.isMeasured === true,
  };
}

function csvContent(keywords: MobileKeywordMetric[]): string {
  const headers = [
    '키워드',
    '등급',
    'PC 검색량',
    '모바일 검색량',
    '월간 총 검색량',
    '문서수',
    '황금비율',
    'CPC',
    '카테고리',
    '의도',
    '소스',
    '측정여부',
  ];
  const lines = [headers.join(',')];
  for (const item of keywords) {
    lines.push([
      csvCell(item.keyword),
      csvCell(item.grade),
      numberCell(item.pcSearchVolume),
      numberCell(item.mobileSearchVolume),
      numberCell(item.totalSearchVolume),
      numberCell(item.documentCount),
      numberCell(item.goldenRatio),
      numberCell(item.cpc),
      csvCell(item.category),
      csvCell(item.intent),
      csvCell(item.source),
      item.isMeasured ? 'Y' : 'N',
    ].join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

function textContent(title: string, keywords: MobileKeywordMetric[], createdAt: string): string {
  const lines = [
    `LEWORD 키워드 내보내기 · ${title}`,
    `생성: ${createdAt}`,
    `개수: ${keywords.length}`,
    '',
  ];
  keywords.forEach((item, index) => {
    lines.push(`${index + 1}. [${item.grade}] ${item.keyword}`);
    lines.push(`   검색 ${textNumber(item.totalSearchVolume)} · 문서 ${textNumber(item.documentCount)} · 비율 ${textNumber(item.goldenRatio)}`);
    if (item.intent || item.category) {
      lines.push(`   ${[item.category, item.intent].filter(Boolean).join(' · ')}`);
    }
  });
  return lines.join('\n');
}

export function buildMobileKeywordExportArtifact(
  options: BuildMobileKeywordExportOptions,
): MobileKeywordExportArtifact {
  const format = options.format || 'csv';
  if (!MIME_BY_FORMAT[format]) {
    throw new Error('unsupported export format');
  }
  const keywords = (options.keywords || [])
    .map(normalizeKeyword)
    .filter((item) => item.keyword);
  if (keywords.length === 0) {
    throw new Error('keywords are required for mobile export');
  }

  const now = options.now?.() || new Date();
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10);
  const title = normalizeTitle(options.title || keywords[0]?.keyword);
  let content = '';

  if (format === 'csv') {
    content = csvContent(keywords);
  } else if (format === 'json') {
    content = JSON.stringify({
      title,
      createdAt,
      summary: {
        itemCount: keywords.length,
        measured: keywords.filter((item) => item.isMeasured).length,
        sss: keywords.filter((item) => item.grade === 'SSS').length,
      },
      keywords,
    }, null, 2);
  } else {
    content = textContent(title, keywords, createdAt);
  }

  return {
    format,
    filename: safeFilename(title, date, format),
    mimeType: MIME_BY_FORMAT[format],
    content,
    shareText: `LEWORD 키워드 내보내기 · ${keywords.length}개 · ${safeFilename(title, date, format)}`,
    itemCount: keywords.length,
    byteLength: Buffer.byteLength(content, 'utf8'),
    createdAt,
  };
}
