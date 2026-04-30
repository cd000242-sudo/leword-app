/**
 * 📊 PRO 끝판왕 Excel 월간 리포트 생성
 *  - xlsx 라이브러리 활용 (이미 설치됨)
 *  - 12개월 추적 + 카테고리별 황금키워드 + 수익 시뮬레이션
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

interface ExcelReportInput {
    keywords: any[];                     // enhanced PRO keywords
    period: { startDate: string; endDate: string };
    category: string;
    sourceStats?: any;
}

export function generateExcelReport(input: ExcelReportInput, outputPath?: string): string {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 키워드 발굴 결과
    const headers = [
        '순위', '키워드', '등급', '검색량/월', '문서수', '경쟁비',
        'CPC', 'Gross RPM', 'Publisher RPM (×0.40)',
        '월수익(100% 점유)', '6개월', '12개월', '24개월',
        '신뢰구간 ±%', '하한', '상한',
        '검색의도', '0클릭위험', '광고적합성', '블루오션',
    ];
    const rows = input.keywords.map((kw, i) => [
        i + 1,
        kw.keyword,
        kw.proEnhancedGrade || kw.grade || 'B',
        kw.searchVolume || 0,
        kw.documentCount || 0,
        kw.blueOcean?.ratio?.toFixed(2) || '-',
        kw.estimatedCPC || 0,
        kw.grossRPM || 0,
        kw.publisherRPM || 0,
        kw.publisherMonthlyRevenue || 0,
        kw.reachability?.month6?.monthlyRevenue || 0,
        kw.reachability?.month12?.monthlyRevenue || 0,
        kw.reachability?.month24?.monthlyRevenue || 0,
        kw.revenueRangeAt12m?.errorMargin || 0,
        kw.revenueRangeAt12m?.lower || 0,
        kw.revenueRangeAt12m?.upper || 0,
        kw.searchIntent?.primary || '-',
        kw.zeroClickRisk?.level || '-',
        kw.adsenseEligibility?.status || '-',
        kw.blueOcean?.level || '-',
    ]);
    const sheet1 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet1['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, sheet1, '키워드 발굴 결과');

    // Sheet 2: 12개월 수익 시뮬레이션 요약
    const summaryHeaders = ['지표', '값'];
    const totalRev6m = input.keywords.reduce((s, k) => s + (k.reachability?.month6?.monthlyRevenue || 0), 0);
    const totalRev12m = input.keywords.reduce((s, k) => s + (k.reachability?.month12?.monthlyRevenue || 0), 0);
    const totalRev24m = input.keywords.reduce((s, k) => s + (k.reachability?.month24?.monthlyRevenue || 0), 0);
    const summaryRows = [
        ['카테고리', input.category],
        ['리포트 기간', `${input.period.startDate} ~ ${input.period.endDate}`],
        ['총 키워드 수', input.keywords.length],
        ['SSS 등급', input.keywords.filter(k => (k.proEnhancedGrade || k.grade) === 'SSS').length],
        ['SS 등급', input.keywords.filter(k => (k.proEnhancedGrade || k.grade) === 'SS').length],
        ['S 등급', input.keywords.filter(k => (k.proEnhancedGrade || k.grade) === 'S').length],
        ['', ''],
        ['💰 6개월 누적 예상 수익', `₩${totalRev6m.toLocaleString()}`],
        ['💰 12개월 누적 예상 수익', `₩${totalRev12m.toLocaleString()}`],
        ['💰 24개월 누적 예상 수익', `₩${totalRev24m.toLocaleString()}`],
        ['', ''],
        ['💎 ultra-blue 키워드', input.keywords.filter(k => k.blueOcean?.level === 'ultra-blue').length],
        ['💎 blue 키워드', input.keywords.filter(k => k.blueOcean?.level === 'blue').length],
        ['🚫 0클릭 고위험', input.keywords.filter(k => k.zeroClickRisk?.level === 'high').length],
        ['🚫 광고 거절', input.keywords.filter(k => k.adsenseEligibility?.status === 'blocked').length],
    ];
    const sheet2 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    sheet2['!cols'] = [{ wch: 28 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, sheet2, '월간 요약');

    // Sheet 3: 액션 가이드
    const actionRows = [
        ['💡 발행 권장 순서', ''],
        ['', ''],
        ['1순위 (블루오션)', '12개월 도달률 높고 신생 진입 가능'],
        ['', ''],
    ];
    const top10 = [...input.keywords]
        .sort((a, b) => (b.reachability?.month12?.monthlyRevenue || 0) - (a.reachability?.month12?.monthlyRevenue || 0))
        .slice(0, 10);
    actionRows.push(['#', '키워드', '12개월 예상 수익', '경쟁비', '발행 권장 시기']);
    for (let i = 0; i < top10.length; i++) {
        const k = top10[i];
        const seasonal = k.seasonalTiming?.isSeasonal
            ? `📅 ${k.seasonalTiming.publishWindowStart} 권장`
            : '⏱️ 즉시';
        actionRows.push([
            `${i + 1}순위`,
            k.keyword,
            `₩${(k.reachability?.month12?.monthlyRevenue || 0).toLocaleString()}`,
            (k.blueOcean?.ratio || 0).toFixed(2),
            seasonal,
        ]);
    }
    const sheet3 = XLSX.utils.aoa_to_sheet(actionRows);
    sheet3['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, sheet3, '액션 가이드');

    // 파일 저장 (사용자 다운로드 폴더 자동 감지)
    let defaultDir = process.cwd();
    try {
        const electron = require('electron');
        if (electron.app && typeof electron.app.getPath === 'function') {
            defaultDir = electron.app.getPath('downloads');
        }
    } catch {
        // 비-Electron 환경 (test) — process.cwd() fallback
        const home = process.env.USERPROFILE || process.env.HOME;
        if (home) {
            const downloads = path.join(home, 'Downloads');
            if (fs.existsSync(downloads)) defaultDir = downloads;
        }
    }
    const fileName = outputPath || path.join(defaultDir, `LEWORD-PRO-${input.category}-${input.period.endDate}.xlsx`);
    fs.mkdirSync(path.dirname(fileName), { recursive: true });
    XLSX.writeFile(wb, fileName);
    console.log(`[EXCEL-REPORT] 📊 Excel 리포트 생성: ${fileName}`);
    return fileName;
}

/**
 * Excel 생성 + 즉시 OS 파일 탐색기로 열기 (사용자 편의)
 */
export function generateAndOpenExcelReport(input: any, outputPath?: string): string {
    const file = generateExcelReport(input, outputPath);
    try {
        const electron = require('electron');
        if (electron.shell) {
            electron.shell.showItemInFolder(file);
        }
    } catch { /* 비-Electron */ }
    return file;
}
