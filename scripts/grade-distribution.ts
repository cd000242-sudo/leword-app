/**
 * Phase 0 — 지식인 황금질문 등급 분포 측정
 *
 * 목적: 현재 등급(SSS/SS/S/A/B/C) 분포를 파악해 Phase 1 다중 게이트 튜닝 기준 확보
 * 측정: getPopularQnA() + getRisingQuestions() 결과를 합쳐 샘플 확보
 * 출력: baseline/grade-distribution.json + 콘솔 히스토그램
 *
 * 실행: npx ts-node scripts/grade-distribution.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getPopularQnA,
  getRisingQuestions,
  closeBrowser,
  GoldenQuestion,
} from '../src/utils/naver-kin-golden-hunter-v3';

type Grade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';

interface GradeStats {
  count: number;
  pct: number;
  avgScore: number;
  avgViewCount: number;
  avgAnswerCount: number;
  sample?: { title: string; viewCount: number; answerCount: number; goldenScore: number };
}

function bucketize(questions: GoldenQuestion[]): Record<Grade, GradeStats> {
  const buckets: Record<Grade, GoldenQuestion[]> = {
    SSS: [], SS: [], S: [], A: [], B: [], C: [],
  };
  for (const q of questions) {
    const g = (q.goldenGrade as Grade) ?? 'C';
    if (buckets[g]) buckets[g].push(q);
  }

  const total = questions.length || 1;
  const out = {} as Record<Grade, GradeStats>;
  for (const grade of Object.keys(buckets) as Grade[]) {
    const list = buckets[grade];
    const count = list.length;
    if (count === 0) {
      out[grade] = { count: 0, pct: 0, avgScore: 0, avgViewCount: 0, avgAnswerCount: 0 };
      continue;
    }
    const sumScore = list.reduce((a, b) => a + (b.goldenScore ?? 0), 0);
    const sumView = list.reduce((a, b) => a + (b.viewCount ?? 0), 0);
    const sumAns = list.reduce((a, b) => a + (b.answerCount ?? 0), 0);
    const sample = list[0];
    out[grade] = {
      count,
      pct: Math.round((count / total) * 1000) / 10,
      avgScore: Math.round((sumScore / count) * 10) / 10,
      avgViewCount: Math.round(sumView / count),
      avgAnswerCount: Math.round((sumAns / count) * 10) / 10,
      sample: {
        title: sample.title?.slice(0, 40) ?? '',
        viewCount: sample.viewCount ?? 0,
        answerCount: sample.answerCount ?? 0,
        goldenScore: sample.goldenScore ?? 0,
      },
    };
  }
  return out;
}

async function main() {
  console.log('[GRADE] 등급 분포 측정 시작 — getPopularQnA + getRisingQuestions\n');

  const all: GoldenQuestion[] = [];
  const sources: Array<{ name: string; count: number; ms: number; error?: string }> = [];

  // Source 1: getPopularQnA
  {
    const t0 = Date.now();
    try {
      console.log('[GRADE] (1/2) getPopularQnA() 호출 중...');
      const r = await getPopularQnA();
      const ms = Date.now() - t0;
      all.push(...(r.goldenQuestions ?? []));
      sources.push({ name: 'getPopularQnA', count: r.goldenQuestions?.length ?? 0, ms });
      console.log(`[GRADE] getPopularQnA: ${r.goldenQuestions?.length ?? 0}개 (${ms}ms)\n`);
    } catch (e: any) {
      const ms = Date.now() - t0;
      sources.push({ name: 'getPopularQnA', count: 0, ms, error: e?.message ?? String(e) });
      console.error('[GRADE] getPopularQnA 실패:', e?.message);
    }
  }

  // Source 2: getRisingQuestions
  {
    const t0 = Date.now();
    try {
      console.log('[GRADE] (2/2) getRisingQuestions() 호출 중...');
      const r = await getRisingQuestions();
      const ms = Date.now() - t0;
      all.push(...(r.goldenQuestions ?? []));
      sources.push({ name: 'getRisingQuestions', count: r.goldenQuestions?.length ?? 0, ms });
      console.log(`[GRADE] getRisingQuestions: ${r.goldenQuestions?.length ?? 0}개 (${ms}ms)\n`);
    } catch (e: any) {
      const ms = Date.now() - t0;
      sources.push({ name: 'getRisingQuestions', count: 0, ms, error: e?.message ?? String(e) });
      console.error('[GRADE] getRisingQuestions 실패:', e?.message);
    }
  }

  await closeBrowser();

  const distribution = bucketize(all);
  const totalScore = all.reduce((a, b) => a + (b.goldenScore ?? 0), 0);

  const output = {
    sampleSize: all.length,
    sources,
    avgScore: all.length ? Math.round((totalScore / all.length) * 10) / 10 : 0,
    distribution,
    dodCheck: {
      sssPct: distribution.SSS.pct,
      sssTarget: '5~15%',
      sssStatus:
        distribution.SSS.pct >= 5 && distribution.SSS.pct <= 15 ? 'PASS' : 'FAIL',
    },
    timestamp: new Date().toISOString(),
  };

  const outPath = path.resolve(__dirname, '..', 'baseline', 'grade-distribution.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\n' + '='.repeat(60));
  console.log('[GRADE] 등급 분포 요약');
  console.log('='.repeat(60));
  console.log(`샘플 크기: ${all.length}`);
  console.log(`평균 점수: ${output.avgScore}\n`);
  console.log('등급 | 개수 | 비율  | 평균점수 | 평균조회 | 평균답변');
  console.log('-'.repeat(60));
  for (const grade of ['SSS', 'SS', 'S', 'A', 'B', 'C'] as Grade[]) {
    const s = distribution[grade];
    console.log(
      `${grade.padEnd(4)} | ${String(s.count).padStart(4)} | ${String(s.pct).padStart(5)}% | ${String(s.avgScore).padStart(8)} | ${String(s.avgViewCount).padStart(8)} | ${String(s.avgAnswerCount).padStart(8)}`
    );
  }
  console.log('\n[DoD] SSS 비율 5~15% 목표:', output.dodCheck.sssStatus, `(현재 ${output.dodCheck.sssPct}%)`);
  console.log(`\n결과 저장: ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[GRADE] 치명적 오류:', e);
    process.exit(1);
  });
