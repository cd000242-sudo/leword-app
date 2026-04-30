// 프리미엄 키워드 헌팅 핸들러
import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getNaverKeywordSearchVolumeSeparate } from '../../utils/naver-datalab-api';
import { getNaverSearchAdKeywordSuggestions } from '../../utils/naver-searchad-api';
import { EnvironmentManager } from '../../utils/environment-manager';
import * as licenseManager from '../../utils/licenseManager';
import { huntProTrafficKeywords, getProTrafficCategories } from '../../utils/pro-traffic-keyword-hunter';
import { huntAdsenseKeywords, ADSENSE_CATEGORIES } from '../../utils/adsense-keyword-hunter';
import { enhanceProResults } from '../../utils/pro-traffic-adsense-enhancer';
import { getWorkerStatus, getWorkerHealthSummary } from '../../utils/pro-hunter-v12/worker-status';
import { getDailyHuntHistory, getDashboardSummary, runDailyHuntNow } from '../../utils/pro-hunter-v12/auto-hunting-scheduler';
import { generateExcelReport, generateAndOpenExcelReport } from '../../utils/pro-hunter-v12/excel-report-generator';
import { recordFeedback, getAllCalibrations, getFeedbackHistory, getFeedbackStats } from '../../utils/pro-hunter-v12/feedback-learner';
import { expandWithLSI, expandSeedsWithLSI } from '../../utils/pro-hunter-v12/ai-lsi-engine';
import { collectGlobalSignals, localizeToKorean } from '../../utils/pro-hunter-v12/global-trend-radar';
import { analyzeContentGap } from '../../utils/pro-hunter-v12/content-gap-analyzer';
import { mineQAKeywords } from '../../utils/pro-hunter-v12/qa-comment-miner';
import { recordRejection, recordAcceptance, calculatePreferenceScore, getPreferenceStats, applyPreferenceLearning } from '../../utils/pro-hunter-v12/preference-learner';
import { calculateHomeScore } from '../../utils/pro-hunter-v12/naver-home-score-engine';
import { predictTitleCtr, generateOptimizedTitles, batchGenerateTitlesWithCtr } from '../../utils/pro-hunter-v12/title-ctr-predictor';
import { analyzeVacancy, batchAnalyzeVacancy } from '../../utils/pro-hunter-v12/vacancy-detector';
import { getRelatedKeywords as getRelatedKeywordsFromCache } from '../../utils/related-keyword-cache';


export function setupPremiumHuntingHandlers(): void {
  ipcMain.handle('infinite-keyword-search', async (event, options: {
    initialKeyword: string;
    maxKeywords: number; // 몇 개의 키워드를 조회할지
  }) => {
    try {
      const { initialKeyword, maxKeywords } = options;

      if (!initialKeyword || initialKeyword.trim().length === 0) {
        throw new Error('시작 키워드를 입력해주세요.');
      }

      // maxKeywords가 0이면 무제한 모드 (에러 발생하지 않음)
      if (maxKeywords && maxKeywords < 0) {
        throw new Error('조회할 키워드 개수는 0 이상이어야 합니다. (0은 무제한)');
      }

      console.log(`[INFINITE-SEARCH] 시작: "${initialKeyword}", 최대 ${maxKeywords}개 연관 키워드 추출 및 조회`);

      const envManager = EnvironmentManager.getInstance();
      // EnvironmentManager의 config 속성 접근
      const env = (envManager as any).config || {
        naverClientId: process.env['NAVER_CLIENT_ID'] || '',
        naverClientSecret: process.env['NAVER_CLIENT_SECRET'] || '',
        naverSearchAdAccessLicense: process.env['NAVER_SEARCH_AD_ACCESS_LICENSE'] || '',
        naverSearchAdSecretKey: process.env['NAVER_SEARCH_AD_SECRET_KEY'] || '',
        naverSearchAdCustomerId: process.env['NAVER_SEARCH_AD_CUSTOMER_ID'] || ''
      };
      const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
      const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
      const naverSearchAdAccessLicense = env.naverSearchAdAccessLicense || process.env['NAVER_SEARCH_AD_ACCESS_LICENSE'] || '';
      const naverSearchAdSecretKey = env.naverSearchAdSecretKey || process.env['NAVER_SEARCH_AD_SECRET_KEY'] || '';
      const naverSearchAdCustomerId = env.naverSearchAdCustomerId || process.env['NAVER_SEARCH_AD_CUSTOMER_ID'] || '';

      if (!naverClientId || !naverClientSecret) {
        throw new Error('네이버 API 키가 설정되지 않았습니다.');
      }

      // 무제한 모드 확인
      const isUnlimited = maxKeywords === 0 || !maxKeywords;
      const effectiveMaxKeywords = isUnlimited ? 10000 : maxKeywords; // 무제한일 때 합리적인 최대값

      console.log(`[INFINITE-SEARCH] 모드: ${isUnlimited ? '무제한 (계속 추출)' : `${maxKeywords}개 제한`}`);

      // 1단계: 시작 키워드로 연관 키워드 대량 추출 (이미지처럼)
      console.log(`[INFINITE-SEARCH] 1단계: "${initialKeyword}"의 연관 키워드 추출 중...`);

      const allRelatedKeywords: string[] = [];
      const searchAdEnabled = !!(naverSearchAdAccessLicense && naverSearchAdSecretKey);
      const searchAdConfig = searchAdEnabled ? {
        accessLicense: naverSearchAdAccessLicense,
        secretKey: naverSearchAdSecretKey,
        customerId: naverSearchAdCustomerId
      } : null;
      const normalizeKeywordTerm = (value: string): string => {
        if (!value || typeof value !== 'string') return '';
        return value
          .replace(/\s+/g, ' ')
          .replace(/[“”"<>[\]{}()|]+/g, ' ')
          .replace(/[!?~`^]/g, ' ')
          .replace(/\.+/g, '.')
          .replace(/-+/g, '-')
          .replace(/\s*\.\s*/g, ' ')
          .trim();
      };
      const isKeywordCandidate = (value: string): boolean => {
        if (!value || value.length < 2) return false;
        if (value.length > 40) return false;
        if (value.includes('\n') || value.includes('\r')) return false;
        if (/[!?]/.test(value)) return false;
        if (value.includes('http') || value.includes('www')) return false;
        if (value.includes('더보기') || value.includes('로그인') || value.includes('전체보기')) return false;
        const tokens = value.split(' ');
        if (tokens.length > 5) return false;
        return true;
      };
      const processedForExtraction = new Set<string>();
      let extractionDepth = 0;

      // 시작 키워드를 포함하여 연관 키워드 추출
      const extractRelatedKeywords = async (keyword: string, depth: number = 0, maxDepth: number = 3) => {
        // 무제한이 아닐 때만 개수 체크
        if (!isUnlimited && allRelatedKeywords.length >= effectiveMaxKeywords) {
          console.log(`[INFINITE-SEARCH] 목표 개수(${maxKeywords})에 도달했습니다.`);
          return;
        }

        if (depth > maxDepth) {
          console.log(`[INFINITE-SEARCH] 최대 깊이(${maxDepth})에 도달했습니다.`);
          return;
        }
        if (processedForExtraction.has(keyword)) return;

        processedForExtraction.add(keyword);

        try {
          // 네이버 검색 API로 연관 키워드 추출
          const blogApiUrl = 'https://openapi.naver.com/v1/search/blog.json';
          const params = new URLSearchParams({
            query: keyword,
            display: '100', // 최대 100개 결과
            sort: 'sim'
          });

          const response = await fetch(`${blogApiUrl}?${params}`, {
            method: 'GET',
            headers: {
              'X-Naver-Client-Id': naverClientId,
              'X-Naver-Client-Secret': naverClientSecret
            }
          });

          if (response.ok) {
            const data = await response.json();
            const items = data.items || [];

            // 제목과 설명에서 연관 키워드 추출
            const extractedKeywords = new Set<string>();
            let titlesWithKeyword = 0;

            items.forEach((item: any) => {
              const title = item.title?.replace(/<[^>]*>/g, '').trim() || '';
              const description = item.description?.replace(/<[^>]*>/g, '').trim() || '';

              if (title.includes(keyword)) {
                titlesWithKeyword++;
                // 제목을 단어 단위로 분리
                const words = title.split(/[\s|,，、·\[\]()【】「」<>]+/).filter((w: string) => w.trim().length > 0);
                const keywordIndexes: number[] = [];
                words.forEach((word: string, idx: number) => {
                  if (word.includes(keyword)) {
                    keywordIndexes.push(idx);
                  }
                });

                // 키워드 주변 단어들로 구문 생성
                keywordIndexes.forEach(keywordIdx => {
                  // 키워드 앞 단어들 (최대 2개)
                  for (let offset = 1; offset <= 2 && keywordIdx - offset >= 0; offset++) {
                    const phrase = words.slice(keywordIdx - offset, keywordIdx + 1).join(' ').trim();
                    if (phrase.length >= keyword.length && phrase.length <= 30 && phrase.includes(keyword)) {
                      extractedKeywords.add(phrase);
                    }
                  }

                  // 키워드 뒤 단어들 (최대 4개) - "박지선 사망", "박지선 어머니" 같은 패턴
                  for (let offset = 1; offset <= 4 && keywordIdx + offset < words.length; offset++) {
                    const phrase = words.slice(keywordIdx, keywordIdx + offset + 1).join(' ').trim();
                    if (phrase.length >= keyword.length && phrase.length <= 35) {
                      if (!extractedKeywords.has(phrase)) {
                        extractedKeywords.add(phrase);
                      }
                    }
                  }

                  // 키워드 앞뒤 단어들 (앞 1-2개 + 뒤 1-2개)
                  for (let before = 1; before <= 2 && keywordIdx - before >= 0; before++) {
                    for (let after = 1; after <= 2 && keywordIdx + after < words.length; after++) {
                      const phrase = words.slice(keywordIdx - before, keywordIdx + after + 1).join(' ').trim();
                      if (phrase.length >= keyword.length && phrase.length <= 40) {
                        extractedKeywords.add(phrase);
                      }
                    }
                  }
                });

                // 짧은 제목 전체도 추가
                if (title.length >= keyword.length && title.length <= 40 && title.includes(keyword)) {
                  extractedKeywords.add(title);
                }
              }

              // 설명에서도 키워드 추출
              if (description.includes(keyword)) {
                const descWords = description.split(/[\s|,，、·\[\]()【】「」<>]+/).filter((w: string) => w.trim().length > 0);
                const descKeywordIdx = descWords.findIndex((w: string) => w.includes(keyword));
                if (descKeywordIdx >= 0 && descKeywordIdx < descWords.length - 1) {
                  for (let offset = 1; offset <= 2 && descKeywordIdx + offset < descWords.length; offset++) {
                    const phrase = descWords.slice(descKeywordIdx, descKeywordIdx + offset + 1).join(' ').trim();
                    if (phrase.length >= keyword.length && phrase.length <= 30) {
                      extractedKeywords.add(phrase);
                    }
                  }
                }
              }
            });

            // 추출된 키워드를 리스트에 추가 (중복 방지)
            const newKeywordsCount = allRelatedKeywords.length;
            const phrasesExtracted = extractedKeywords.size; // 총 추출된 구문 수
            Array.from(extractedKeywords).forEach(kw => {
              const trimmed = kw.trim();
              if (trimmed && trimmed.length > 0 && !allRelatedKeywords.includes(trimmed) && trimmed !== keyword) {
                allRelatedKeywords.push(trimmed);
              }
            });

            const addedCount = allRelatedKeywords.length - newKeywordsCount;
            console.log(`[INFINITE-SEARCH] "${keyword}": 제목 ${titlesWithKeyword}개에서 ${phrasesExtracted}개 구문 추출, ${addedCount}개 새 키워드 추가`);

            // API 호출 제한 고려
            await new Promise(resolve => setTimeout(resolve, 200));

            // 재귀적으로 일부 연관 키워드도 추출 (무제한 모드에서는 더 많이 추출)
            const maxRecursiveKeywords = isUnlimited ? 10 : 3;
            if (depth < maxDepth) {
              if (isUnlimited || allRelatedKeywords.length < effectiveMaxKeywords * 0.8) {
                const topRelated = Array.from(extractedKeywords)
                  .filter(kw => kw.trim().length > 0 && kw !== keyword)
                  .slice(0, maxRecursiveKeywords);

                for (const relKw of topRelated) {
                  if (!isUnlimited && allRelatedKeywords.length >= effectiveMaxKeywords) break;
                  await extractRelatedKeywords(relKw.trim(), depth + 1, maxDepth);
                }
              }
            }
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[INFINITE-SEARCH] "${keyword}" API 호출 실패:`, response.status, errorText.substring(0, 200));
            if (response.status === 401) {
              throw new Error('네이버 API 인증 실패. API 키를 확인해주세요.');
            }
          }
        } catch (err: any) {
          console.error(`[INFINITE-SEARCH] "${keyword}" 연관 키워드 추출 실패:`, err.message);
          console.error(`[INFINITE-SEARCH] 에러 상세:`, {
            message: err.message,
            stack: err.stack,
            name: err.name
          });
        }
      };

      // 시작 키워드로 연관 키워드 추출
      await extractRelatedKeywords(initialKeyword.trim());

      // 시작 키워드도 리스트 맨 앞에 추가
      if (!allRelatedKeywords.includes(initialKeyword.trim())) {
        allRelatedKeywords.unshift(initialKeyword.trim());
      }

      // 중복 제거 및 정제
      let uniqueKeywords = Array.from(new Set(allRelatedKeywords))
        .map(normalizeKeywordTerm)
        .filter(isKeywordCandidate);

      const uniqueKeywordSet = new Set(uniqueKeywords.map(k => k.toLowerCase()));
      const normalizedSeed = normalizeKeywordTerm(initialKeyword.trim());
      if (normalizedSeed && isKeywordCandidate(normalizedSeed) && !uniqueKeywordSet.has(normalizedSeed.toLowerCase())) {
        uniqueKeywords.unshift(normalizedSeed);
        uniqueKeywordSet.add(normalizedSeed.toLowerCase());
      }

      if (searchAdEnabled && searchAdConfig) {
        const suggestionSeeds = [normalizedSeed, ...uniqueKeywords.slice(0, 15)];
        for (const seed of suggestionSeeds) {
          if (!seed) continue;
          if (!isUnlimited && uniqueKeywords.length >= effectiveMaxKeywords) break;
          try {
            const suggestions = await getNaverSearchAdKeywordSuggestions(searchAdConfig, seed, Math.min(300, effectiveMaxKeywords * 2));
            for (const suggestion of suggestions) {
              const normalizedSuggestion = normalizeKeywordTerm(suggestion.keyword);
              if (!normalizedSuggestion || !isKeywordCandidate(normalizedSuggestion)) continue;
              if (uniqueKeywordSet.has(normalizedSuggestion.toLowerCase())) continue;
              uniqueKeywordSet.add(normalizedSuggestion.toLowerCase());
              uniqueKeywords.push(normalizedSuggestion);
              if (!isUnlimited && uniqueKeywords.length >= effectiveMaxKeywords) break;
            }
          } catch (error: any) {
            console.warn('[INFINITE-SEARCH] 검색광고 연관 키워드 보강 실패:', error?.message || error);
          }
        }
      }

      const finalKeywords = isUnlimited ? uniqueKeywords : uniqueKeywords.slice(0, maxKeywords);

      console.log(`[INFINITE-SEARCH] 연관 키워드 ${finalKeywords.length}개 추출 완료 (전체 후보: ${uniqueKeywords.length}개)`);
      if (finalKeywords.length > 0) {
        console.log(`[INFINITE-SEARCH] 추출된 키워드 샘플:`, finalKeywords.slice(0, 10));
      } else {
        console.error(`[INFINITE-SEARCH] ⚠️ 추출된 키워드가 없습니다.`);
        console.error(`[INFINITE-SEARCH] 디버깅 정보:`, {
          initialKeyword,
          allRelatedKeywordsLength: allRelatedKeywords.length,
          uniqueKeywordsLength: uniqueKeywords.length,
          maxKeywords,
          isUnlimited
        });
      }

      // 추출된 키워드가 없으면 에러
      if (finalKeywords.length === 0) {
        throw new Error(`"${initialKeyword}"에 대한 연관 키워드를 찾을 수 없습니다. 네이버 API 키를 확인하거나 다른 키워드로 시도해보세요.`);
      }

      // 2단계: 각 연관 키워드의 검색량, 문서수, 비율 조회 (병렬 처리)
      console.log(`[INFINITE-SEARCH] 2단계: ${finalKeywords.length}개 키워드의 검색량/문서수 조회 시작...`);

      const results: Array<{
        keyword: string;
        pcSearchVolume: number | null;
        mobileSearchVolume: number | null;
        totalSearchVolume: number | null;
        documentCount: number | null;
        competitionRatio: number | null; // 문서수 / 월간총검색량 (비율)
      }> = [];

      // 병렬 처리 함수
      const processKeyword = async (keyword: string): Promise<{
        keyword: string;
        pcSearchVolume: number | null;
        mobileSearchVolume: number | null;
        totalSearchVolume: number | null;
        documentCount: number | null;
        competitionRatio: number | null;
        relatedKeywords: string[]; // 🔥 추가
      } | null> => {
        try {
          // 1. 검색량 조회 & 연관검색어 조회 (병렬 시작)
          const volumePromise = getNaverKeywordSearchVolumeSeparate({
            clientId: naverClientId,
            clientSecret: naverClientSecret
          }, [keyword]);

          const relatedPromise = getRelatedKeywordsFromCache(keyword);

          const volumeData = await volumePromise;

          let pcVolume: number | null = null;
          let mobileVolume: number | null = null;
          let totalVolume: number | null = null;

          if (volumeData && volumeData.length > 0 && volumeData[0]) {
            pcVolume = volumeData[0].pcSearchVolume ?? null;
            mobileVolume = volumeData[0].mobileSearchVolume ?? null;
            totalVolume = (pcVolume !== null || mobileVolume !== null)
              ? ((pcVolume ?? 0) + (mobileVolume ?? 0))
              : null;
          }

          // 2. 문서수 조회
          let documentCount: number | null = null;
          try {
            const blogApiUrl = 'https://openapi.naver.com/v1/search/blog.json';
            const docParams = new URLSearchParams({
              query: keyword,
              display: '1'
            });
            const docResponse = await fetch(`${blogApiUrl}?${docParams}`, {
              method: 'GET',
              headers: {
                'X-Naver-Client-Id': naverClientId,
                'X-Naver-Client-Secret': naverClientSecret
              }
            });

            if (docResponse.ok) {
              const docData = await docResponse.json();
              const rawTotal = (docData as any)?.total;
              documentCount = typeof rawTotal === 'number'
                ? rawTotal
                : (typeof rawTotal === 'string' ? parseInt(rawTotal, 10) : null);
            }
          } catch (docErr: any) {
            console.warn(`[INFINITE-SEARCH] "${keyword}" 문서수 조회 실패:`, docErr.message);
          }

          // 3. 비율 계산: 문서수 / 월간총검색량
          const competitionRatio: number | null = (typeof totalVolume === 'number' && totalVolume > 0 && typeof documentCount === 'number')
            ? (documentCount / totalVolume)
            : null;

          // 4. 연관검색어 결과 대기
          const relatedKeywords = await relatedPromise;

          return {
            keyword: keyword,
            pcSearchVolume: pcVolume,
            mobileSearchVolume: mobileVolume,
            totalSearchVolume: totalVolume,
            documentCount: documentCount,
            competitionRatio: typeof competitionRatio === 'number' ? (Math.round(competitionRatio * 10000) / 10000) : null, // 소수점 4자리
            relatedKeywords
          };
        } catch (error: any) {
          console.error(`[INFINITE-SEARCH] "${keyword}" 처리 실패:`, error.message);
          return null;
        }
      };

      // 배치 단위로 병렬 처리 (한 번에 5개씩)
      const batchSize = 5;
      for (let i = 0; i < finalKeywords.length; i += batchSize) {
        const batch = finalKeywords.slice(i, i + batchSize);
        console.log(`[INFINITE-SEARCH] 배치 ${Math.floor(i / batchSize) + 1} 처리 중: ${batch.length}개 키워드`);

        const batchResults = await Promise.allSettled(
          batch.map(keyword => processKeyword(keyword))
        );

        batchResults.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value) {
            results.push(result.value);
            const ratioText = typeof result.value.competitionRatio === 'number' ? result.value.competitionRatio.toFixed(4) : 'null';
            console.log(`[INFINITE-SEARCH] ✅ "${batch[idx]}" 완료: 검색량=${result.value.totalSearchVolume}, 문서수=${result.value.documentCount}, 비율=${ratioText}`);
          }
        });

        // API 호출 제한 고려
        if (i + batchSize < finalKeywords.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // 무제한 모드에서는 진행 상황만 표시하고 계속 진행
        if (isUnlimited && (i + batchSize) % 50 === 0) {
          console.log(`[INFINITE-SEARCH] 무제한 모드 진행 중: ${results.length}개 완료, ${finalKeywords.length - i - batchSize}개 남음`);
        }
      }

      // 총 조회수(검색량) 순으로 정렬
      results.sort((a, b) => {
        const aVol = typeof a.totalSearchVolume === 'number' ? a.totalSearchVolume : null;
        const bVol = typeof b.totalSearchVolume === 'number' ? b.totalSearchVolume : null;
        if (bVol !== null && aVol === null) return 1;
        if (aVol !== null && bVol === null) return -1;
        if (aVol !== null && bVol !== null && bVol !== aVol) return bVol - aVol;
        return 0;
      });

      console.log(`[INFINITE-SEARCH] 완료: ${results.length}개 키워드 수집 및 조회 완료`);

      return {
        success: true,
        keywords: results,
        count: results.length
      };

    } catch (error: any) {
      console.error('[INFINITE-SEARCH] 키워드 무한 반복 조회 실패:', error);
      return {
        success: false,
        error: error.message || '키워드 조회 중 오류가 발생했습니다.',
        keywords: [],
        count: 0
      };
    }
  });


  function getBackupLongtailKeywords(category: string, target: string) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // 🔥 월별 시즌 키워드 추가
    const seasonalKeywords: Record<number, string[]> = {
      1: ['신년 선물', '연말정산', '겨울 여행'],
      2: ['발렌타인', '입학 선물', '봄 준비'],
      3: ['봄맞이', '벚꽃', '신학기'],
      4: ['벚꽃 여행', '황사 대비', '봄 나들이'],
      5: ['어버이날', '가정의달', '어린이날'],
      6: ['초여름', '휴가 준비', '졸업'],
      7: ['여름 휴가', '에어컨', '피서'],
      8: ['휴가', '바캉스', '개학 준비'],
      9: ['추석', '환절기', '가을'],
      10: ['핼러윈', '단풍', '가을 여행'],
      11: ['블랙프라이데이', '수능', '겨울 준비'],
      12: ['크리스마스', '연말', '송년']
    };
    const seasonal = seasonalKeywords[currentMonth] || [];

    // 카테고리+타겟별 롱테일 키워드 DB (대폭 확장)
    const longtailDB: Record<string, Array<{ keyword: string, searchVolume: number, documentCount: number }>> = {
      '제품리뷰': [
        { keyword: `${target} 가성비 선물 추천`, searchVolume: 12000, documentCount: 2500 },
        { keyword: `${target} 필수템 추천 ${currentYear}`, searchVolume: 8500, documentCount: 1800 },
        { keyword: `${target} 인기 상품 순위`, searchVolume: 9200, documentCount: 2100 },
        { keyword: `${target} 가전제품 추천`, searchVolume: 7800, documentCount: 1600 },
        { keyword: `${target} 생활용품 추천`, searchVolume: 6500, documentCount: 1400 },
        { keyword: `${target} 건강용품 추천`, searchVolume: 5800, documentCount: 1200 },
        { keyword: `${target} 가성비 가전 순위`, searchVolume: 4500, documentCount: 950 },
        { keyword: `${target} 선물 세트 추천`, searchVolume: 3800, documentCount: 800 },
        { keyword: `${target} 최신 인기템`, searchVolume: 6200, documentCount: 1100 },
        { keyword: `${target} 꿀템 추천 ${currentYear}`, searchVolume: 5500, documentCount: 950 },
        { keyword: `${target} 쇼핑 리스트`, searchVolume: 4800, documentCount: 880 },
        { keyword: `${target} 선물 추천 TOP10`, searchVolume: 7500, documentCount: 1500 },
      ],
      '건강': [
        { keyword: `${target} 영양제 추천 ${currentYear}`, searchVolume: 15000, documentCount: 3200 },
        { keyword: `${target} 건강식품 추천`, searchVolume: 12000, documentCount: 2600 },
        { keyword: `${target} 비타민 추천`, searchVolume: 9500, documentCount: 2100 },
        { keyword: `${target} 건강관리 방법`, searchVolume: 7200, documentCount: 1500 },
        { keyword: `${target} 운동 추천`, searchVolume: 6800, documentCount: 1400 },
        { keyword: `${target} 다이어트 방법`, searchVolume: 8500, documentCount: 1900 },
        { keyword: `${target} 면역력 높이는 방법`, searchVolume: 5500, documentCount: 1100 },
        { keyword: `${target} 홈트레이닝 추천`, searchVolume: 6100, documentCount: 1200 },
        { keyword: `${target} 헬스 루틴`, searchVolume: 5200, documentCount: 980 },
        { keyword: `${target} 건강검진 필수항목`, searchVolume: 8800, documentCount: 1600 },
        { keyword: `${target} 프로바이오틱스 추천`, searchVolume: 7500, documentCount: 1400 },
      ],
      '여행': [
        { keyword: `${target} 국내여행 추천`, searchVolume: 18000, documentCount: 4200 },
        { keyword: `${target} 여행지 추천 ${currentYear}`, searchVolume: 14000, documentCount: 3100 },
        { keyword: `${target} 가볼만한곳`, searchVolume: 11000, documentCount: 2400 },
        { keyword: `${target} 데이트코스 추천`, searchVolume: 8500, documentCount: 1800 },
        { keyword: `${target} 맛집 추천`, searchVolume: 9800, documentCount: 2200 },
        { keyword: `${target} 호텔 추천`, searchVolume: 7200, documentCount: 1600 },
        { keyword: `${target} 카페 추천`, searchVolume: 6500, documentCount: 1300 },
        { keyword: `${target} 1박2일 여행코스`, searchVolume: 9200, documentCount: 1800 },
        { keyword: `${target} 가성비 숙소 추천`, searchVolume: 7800, documentCount: 1500 },
        { keyword: `${target} 당일치기 여행`, searchVolume: 8100, documentCount: 1650 },
      ],
      '뷰티': [
        { keyword: `${target} 화장품 추천 ${currentYear}`, searchVolume: 16000, documentCount: 3800 },
        { keyword: `${target} 스킨케어 추천`, searchVolume: 12000, documentCount: 2700 },
        { keyword: `${target} 선크림 추천`, searchVolume: 9500, documentCount: 2100 },
        { keyword: `${target} 기초화장품 추천`, searchVolume: 8200, documentCount: 1800 },
        { keyword: `${target} 헤어케어 추천`, searchVolume: 6800, documentCount: 1500 },
        { keyword: `${target} 파운데이션 추천`, searchVolume: 7500, documentCount: 1600 },
        { keyword: `${target} 클렌징 추천`, searchVolume: 5800, documentCount: 1100 },
        { keyword: `${target} 향수 추천`, searchVolume: 8800, documentCount: 1900 },
      ],
      '육아': [
        { keyword: `${target} 육아템 추천`, searchVolume: 11000, documentCount: 2400 },
        { keyword: `${target} 아기용품 추천`, searchVolume: 9500, documentCount: 2100 },
        { keyword: `${target} 유아식품 추천`, searchVolume: 7800, documentCount: 1700 },
        { keyword: `${target} 육아 꿀팁`, searchVolume: 6200, documentCount: 1300 },
        { keyword: `${target} 장난감 추천`, searchVolume: 8500, documentCount: 1800 },
        { keyword: `${target} 어린이집 준비물`, searchVolume: 5500, documentCount: 980 },
        { keyword: `${target} 이유식 추천`, searchVolume: 7200, documentCount: 1450 },
      ],
      '전자제품': [
        { keyword: `${target} 노트북 추천 ${currentYear}`, searchVolume: 22000, documentCount: 5200 },
        { keyword: `${target} 스마트폰 추천`, searchVolume: 18000, documentCount: 4100 },
        { keyword: `${target} 가성비 태블릿 추천`, searchVolume: 12000, documentCount: 2600 },
        { keyword: `${target} 무선이어폰 추천`, searchVolume: 9500, documentCount: 2100 },
        { keyword: `${target} 스마트워치 추천`, searchVolume: 8200, documentCount: 1800 },
        { keyword: `${target} 모니터 추천`, searchVolume: 7800, documentCount: 1650 },
        { keyword: `${target} 키보드 추천`, searchVolume: 6500, documentCount: 1350 },
        { keyword: `${target} 마우스 추천`, searchVolume: 5800, documentCount: 1200 },
        { keyword: `${target} 청소기 추천`, searchVolume: 11000, documentCount: 2400 },
      ],
      '재테크': [
        { keyword: `${target} 재테크 방법 ${currentYear}`, searchVolume: 14000, documentCount: 3100 },
        { keyword: `${target} 투자 추천`, searchVolume: 11000, documentCount: 2400 },
        { keyword: `${target} 저축 방법`, searchVolume: 8500, documentCount: 1800 },
        { keyword: `${target} 부업 추천`, searchVolume: 9200, documentCount: 2000 },
        { keyword: `${target} 적금 추천`, searchVolume: 7200, documentCount: 1600 },
        { keyword: `${target} 주식 초보 가이드`, searchVolume: 10500, documentCount: 2200 },
        { keyword: `${target} 월급 관리법`, searchVolume: 6800, documentCount: 1350 },
        { keyword: `${target} 예금 추천`, searchVolume: 5500, documentCount: 1100 },
      ],
      '음식': [
        { keyword: `${target} 맛집 추천`, searchVolume: 15000, documentCount: 3500 },
        { keyword: `${target} 배달 맛집`, searchVolume: 12000, documentCount: 2800 },
        { keyword: `${target} 간편식 추천`, searchVolume: 8500, documentCount: 1850 },
        { keyword: `${target} 레시피 추천`, searchVolume: 7200, documentCount: 1500 },
        { keyword: `${target} 밀키트 추천`, searchVolume: 6800, documentCount: 1400 },
        { keyword: `${target} 다이어트 식단`, searchVolume: 9500, documentCount: 2100 },
      ],
      '정부지원': [
        { keyword: `${target} 지원금 신청방법`, searchVolume: 25000, documentCount: 5500 },
        { keyword: `${target} 정부 지원 정책`, searchVolume: 18000, documentCount: 4000 },
        { keyword: `${target} 혜택 총정리`, searchVolume: 12000, documentCount: 2600 },
        { keyword: `${target} 지원금 자격조건`, searchVolume: 15000, documentCount: 3200 },
        { keyword: `${target} 복지 정책 ${currentYear}`, searchVolume: 11000, documentCount: 2300 },
        { keyword: `${target} 정부지원금 신청`, searchVolume: 9500, documentCount: 1900 },
      ],
      '취업': [
        { keyword: `${target} 취업 준비 방법`, searchVolume: 14000, documentCount: 3100 },
        { keyword: `${target} 자기소개서 작성법`, searchVolume: 11000, documentCount: 2400 },
        { keyword: `${target} 면접 질문 답변`, searchVolume: 9500, documentCount: 2000 },
        { keyword: `${target} 이직 준비`, searchVolume: 8200, documentCount: 1750 },
        { keyword: `${target} 채용공고 모음`, searchVolume: 7500, documentCount: 1600 },
        { keyword: `${target} 연봉 협상 팁`, searchVolume: 6200, documentCount: 1250 },
      ],
      '교육': [
        { keyword: `${target} 자격증 추천 ${currentYear}`, searchVolume: 13000, documentCount: 2900 },
        { keyword: `${target} 온라인 강의 추천`, searchVolume: 10500, documentCount: 2300 },
        { keyword: `${target} 학습법 추천`, searchVolume: 8800, documentCount: 1850 },
        { keyword: `${target} 영어 공부법`, searchVolume: 11000, documentCount: 2500 },
        { keyword: `${target} 자기계발 방법`, searchVolume: 7200, documentCount: 1500 },
        { keyword: `${target} 독서 추천`, searchVolume: 6500, documentCount: 1350 },
      ]
    };

    // 기본 키워드 + 시즌 키워드 결합
    let keywords = longtailDB[category] || longtailDB['제품리뷰'];

    // 시즌 키워드 추가
    seasonal.forEach(season => {
      keywords.push({
        keyword: `${target} ${season} 추천`,
        searchVolume: Math.floor(Math.random() * 5000) + 5000,
        documentCount: Math.floor(Math.random() * 1000) + 500
      });
    });

    return keywords.map((kw, index) => ({
      keyword: kw.keyword,
      searchVolume: kw.searchVolume,
      documentCount: kw.documentCount,
      goldenRatio: parseFloat((kw.searchVolume / kw.documentCount).toFixed(2)),
      grade: (index < 2 ? 'SSS' : (index < 5 ? 'SS' : (index < 8 ? 'S' : 'A'))) as 'SSS' | 'SS' | 'S' | 'A',
      category,
      target,
      recommendation: index < 3
        ? `🔥 ${target} 타겟 최고 인기 ${category} 키워드! 지금 바로 공략하세요!`
        : `${target} 타겟에게 인기 있는 ${category} 관련 키워드입니다.`
    }));
  }




  // 🏆 PRO 트래픽 키워드 헌터 (프리미엄 기능 - 1년/영구제 모두 사용 가능)
  if (!ipcMain.listenerCount('hunt-pro-traffic-keywords')) {
    ipcMain.handle('hunt-pro-traffic-keywords', async (_event, options: {
      mode?: 'realtime' | 'category' | 'season';
      seedKeywords?: string[];
      category?: string;
      targetRookie?: boolean;
      includeSeasonKeywords?: boolean;
      explosionMode?: boolean;
      count?: number;
    }) => {
      try {
        // 🔒 PRO 기능은 1년/영구제만 사용 가능
        const license = await licenseManager.loadLicense();

        // 라이선스 유형 체크 헬퍼 함수
        const checkLicenseType = (type: string | undefined): { isYearOrMore: boolean; isUnlimited: boolean } => {
          if (!type) return { isYearOrMore: false, isUnlimited: false };
          const upperType = type.toUpperCase();

          // 영구제: EX, unlimited, permanent
          if (upperType === 'EX' || upperType === 'UNLIMITED' || upperType === 'PERMANENT') {
            return { isYearOrMore: true, isUnlimited: true };
          }

          // 1년: 1year, 1years, custom, 365DAY 이상
          if (upperType === '1YEAR' || upperType === '1YEARS' || upperType === 'CUSTOM') {
            return { isYearOrMore: true, isUnlimited: false };
          }

          // 일수 기반 (예: 365DAY, 180DAY 등)
          const dayMatch = upperType.match(/^(\d+)DAY$/);
          if (dayMatch) {
            const days = parseInt(dayMatch[1], 10);
            return { isYearOrMore: days >= 365, isUnlimited: false };
          }

          return { isYearOrMore: false, isUnlimited: false };
        };

        const planCheck = checkLicenseType(license?.plan);
        const typeCheck = checkLicenseType(license?.licenseType);

        // PRO 사용 가능: 1년(365일 이상) 또는 영구제(EX)
        const canUsePro = license && license.isValid && (
          planCheck.isYearOrMore ||
          typeCheck.isYearOrMore ||
          license.isUnlimited === true ||
          !license.expiresAt // 만료일 없으면 영구제
        );

        console.log('[PRO-TRAFFIC] 라이선스 체크:', {
          plan: license?.plan,
          licenseType: license?.licenseType,
          planCheck,
          typeCheck,
          isUnlimited: license?.isUnlimited,
          expiresAt: license?.expiresAt,
          canUsePro
        });

        if (!canUsePro) {
          console.log('[PRO-TRAFFIC] ❌ 1년/영구제 라이선스 필요');
          return {
            success: false,
            error: 'PRO 트래픽 키워드 헌터는 1년/영구제 라이선스 전용 기능입니다.',
            requiresPremium: true,
            keywords: [],
            summary: { totalFound: 0 }
          };
        }

        console.log('[PRO-TRAFFIC] ✅ PRO 사용 가능 (1년/영구제)');
        console.log('[PRO-TRAFFIC] 🏆 트래픽 폭발 황금키워드 헌팅 시작!');
        console.log(`[PRO-TRAFFIC] 옵션: 카테고리=${options.category}, 신생타겟=${options.targetRookie}, 개수=${options.count}`);

        // 🔥 PRO 황금 키워드 헌팅 실행
        const result = await huntProTrafficKeywords({
          mode: options.mode || 'realtime',
          seedKeywords: options.seedKeywords || [],
          category: options.category || 'all',
          targetRookie: options.targetRookie !== false,
          includeSeasonKeywords: options.includeSeasonKeywords !== false,
          explosionMode: options.explosionMode === true,
          useDeepMining: (options as any).useDeepMining !== false, // 🔥 딥 마이닝 기본 활성화
          count: Math.min(Math.max(options.count || 20, 5), 50),
          forceRefresh: true // 항상 새로운 결과
        });

        // 🔥 결과가 없으면 에러 반환 (더미 데이터 사용 안 함!)
        if (!result.keywords || result.keywords.length === 0) {
          console.log('[PRO-TRAFFIC] ⚠️ API 결과 없음');
          return {
            success: false,
            error: '황금 키워드를 찾지 못했습니다. API 키를 확인하거나 잠시 후 다시 시도해주세요.',
            keywords: [],
            summary: {
              totalFound: 0,
              mode: 'no_results'
            }
          };
        }

        console.log(`[PRO-TRAFFIC] ✅ ${result.keywords.length}개 황금키워드 발굴 완료!`);

        // 🚀 Phase A: AdSense 9-게이트 후처리 (Publisher×0.40 + Reachability + 신뢰구간 등)
        const enhanceOpts = (options as any).enhanceWithAdsenseGates !== false ? {
          excludeNonWritable: (options as any).excludeNonWritable !== false,
          excludePersonDependent: (options as any).excludePersonDependent !== false,
          excludeBlocked: (options as any).excludeBlocked !== false,
          excludeZeroClickHigh: (options as any).excludeZeroClickHigh === true,
          blueOceanOnly: (options as any).blueOceanOnly === true,
          minPublisherRevenue: typeof (options as any).minPublisherRevenue === 'number' ? (options as any).minPublisherRevenue : undefined,
        } : null;

        if (enhanceOpts) {
          const { enhanced, blockedCount, blockedReasons } = enhanceProResults(result.keywords, enhanceOpts);
          console.log(`[PRO-TRAFFIC] 🚀 AdSense 9-게이트 후처리: ${enhanced.length}/${result.keywords.length} 통과 (차단 ${blockedCount}개)`, blockedReasons);
          return {
            success: true,
            ...result,
            keywords: enhanced,
            blockedCount,
            blockedReasons,
            enhancedByAdsense: true,
          };
        }

        return {
          success: true,
          ...result
        };

      } catch (error: any) {
        console.error('[PRO-TRAFFIC] ❌ 오류:', error);

        // 🔥 오류 시 에러 반환 (더미 데이터 사용 안 함!)
        return {
          success: false,
          error: `황금 키워드 헌팅 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`,
          keywords: [],
          summary: {
            totalFound: 0,
            mode: 'error'
          }
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ hunt-pro-traffic-keywords 핸들러 등록 완료');
  }

  // 🔥 백업 황금 키워드 (API 없이도 제공)
  function getBackupGoldenKeywords(category: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const timestamp = now.toISOString();

    // 🔥 수익 직결 황금 키워드 DB (실제 트래픽 폭발 키워드!)
    const goldenKeywordDB: Record<string, Array<{ keyword: string, searchVolume: number, documentCount: number, type: string }>> = {
      'all': [
        // 💰 정부 지원금 (항상 검색량 폭발)
        { keyword: '2025 근로장려금 신청방법', searchVolume: 85000, documentCount: 12000, type: '🔥 타이밍키워드' },
        { keyword: '자녀장려금 신청 자격조건', searchVolume: 62000, documentCount: 8500, type: '💰 수익키워드' },
        { keyword: '소상공인 지원금 신청 2025', searchVolume: 48000, documentCount: 6200, type: '🔥 타이밍키워드' },
        { keyword: '청년내일저축계좌 신청방법', searchVolume: 35000, documentCount: 4500, type: '💎 블루오션' },
        { keyword: '육아휴직급여 계산기 2025', searchVolume: 28000, documentCount: 3200, type: '💎 블루오션' },

        // 🛒 쇼핑/리뷰 (높은 RPM)
        { keyword: '다이소 신상품 추천 2025', searchVolume: 45000, documentCount: 5800, type: '🛒 쇼핑키워드' },
        { keyword: '올리브영 세일 기간 2025', searchVolume: 38000, documentCount: 4200, type: '🛒 쇼핑키워드' },
        { keyword: '쿠팡 로켓와우 혜택 총정리', searchVolume: 32000, documentCount: 4100, type: '📝 정보키워드' },

        // 🏠 생활 정보 (꾸준한 검색량)
        { keyword: '전기세 절약 방법 꿀팁', searchVolume: 25000, documentCount: 3500, type: '💡 생활키워드' },
        { keyword: '가스비 아끼는 방법', searchVolume: 22000, documentCount: 2800, type: '💡 생활키워드' },
        { keyword: '겨울철 난방비 절약 팁', searchVolume: 35000, documentCount: 4200, type: '🌸 시즌키워드' },

        // 📱 IT/가젯 (높은 CPC)
        { keyword: '아이폰16 사전예약 방법', searchVolume: 55000, documentCount: 7200, type: '📱 IT키워드' },
        { keyword: '갤럭시 S25 출시일 가격', searchVolume: 42000, documentCount: 5500, type: '📱 IT키워드' },

        // 🎬 연예/이슈 (폭발적 트래픽)
        { keyword: '넷플릭스 신작 추천 2025', searchVolume: 65000, documentCount: 8500, type: '🎬 연예키워드' },
        { keyword: '디즈니플러스 볼만한 영화', searchVolume: 38000, documentCount: 4800, type: '🎬 연예키워드' }
      ],
      '정부지원금': [
        { keyword: '근로장려금 신청기간 2025', searchVolume: 95000, documentCount: 11000, type: '🔥 타이밍키워드' },
        { keyword: '자녀장려금 지급일 2025', searchVolume: 72000, documentCount: 8200, type: '🔥 타이밍키워드' },
        { keyword: '소상공인 전기요금 지원', searchVolume: 45000, documentCount: 5500, type: '💰 수익키워드' },
        { keyword: '청년도약계좌 가입조건', searchVolume: 38000, documentCount: 4200, type: '💎 블루오션' },
        { keyword: '육아휴직 급여 인상 2025', searchVolume: 32000, documentCount: 3800, type: '📰 이슈키워드' },
        { keyword: '기초연금 수급자격 계산', searchVolume: 28000, documentCount: 3200, type: '💎 블루오션' },
        { keyword: '실업급여 신청방법 총정리', searchVolume: 42000, documentCount: 5100, type: '📝 정보키워드' },
        { keyword: '에너지바우처 신청 2025', searchVolume: 25000, documentCount: 2800, type: '💎 블루오션' },
        { keyword: '문화누리카드 사용처 추천', searchVolume: 22000, documentCount: 2500, type: '🎯 롱테일꿀통' },
        { keyword: '청년희망적금 만기 후기', searchVolume: 18000, documentCount: 2100, type: '🎯 롱테일꿀통' }
      ],
      '생활꿀팁': [
        { keyword: '전기세 폭탄 피하는 방법', searchVolume: 35000, documentCount: 4200, type: '💡 생활키워드' },
        { keyword: '겨울철 결로 방지 꿀팁', searchVolume: 28000, documentCount: 3100, type: '🌸 시즌키워드' },
        { keyword: '김장 쉽게 하는 방법', searchVolume: 42000, documentCount: 5500, type: '🌸 시즌키워드' },
        { keyword: '세탁기 청소 방법 꿀팁', searchVolume: 32000, documentCount: 4000, type: '💡 생활키워드' },
        { keyword: '에어프라이어 청소 꿀팁', searchVolume: 25000, documentCount: 2900, type: '💡 생활키워드' },
        { keyword: '냉장고 정리 수납 방법', searchVolume: 22000, documentCount: 2600, type: '💡 생활키워드' },
        { keyword: '화장실 청소 쉽게하는법', searchVolume: 28000, documentCount: 3400, type: '💡 생활키워드' },
        { keyword: '옷장 정리 꿀팁 미니멀', searchVolume: 18000, documentCount: 2100, type: '🎯 롱테일꿀통' }
      ],
      '쇼핑리뷰': [
        { keyword: '쿠팡 로켓배송 꿀템 추천', searchVolume: 38000, documentCount: 4500, type: '🛒 쇼핑키워드' },
        { keyword: '다이소 겨울 신상 추천', searchVolume: 32000, documentCount: 3800, type: '🛒 쇼핑키워드' },
        { keyword: '무신사 세일 기간 2025', searchVolume: 45000, documentCount: 5200, type: '🛒 쇼핑키워드' },
        { keyword: '올리브영 1+1 추천템', searchVolume: 35000, documentCount: 4100, type: '🛒 쇼핑키워드' },
        { keyword: '가성비 무선이어폰 추천', searchVolume: 28000, documentCount: 3200, type: '📱 IT키워드' },
        { keyword: '가성비 로봇청소기 추천', searchVolume: 25000, documentCount: 2800, type: '📱 IT키워드' },
        { keyword: '가습기 추천 2025 순위', searchVolume: 35000, documentCount: 4000, type: '🌸 시즌키워드' }
      ],
      '여행맛집': [
        { keyword: '제주도 겨울여행 코스', searchVolume: 48000, documentCount: 6200, type: '✈️ 여행키워드' },
        { keyword: '부산 맛집 추천 로컬', searchVolume: 42000, documentCount: 5500, type: '🍽️ 맛집키워드' },
        { keyword: '서울 데이트코스 추천', searchVolume: 38000, documentCount: 4800, type: '💑 데이트키워드' },
        { keyword: '일본 여행 준비물 체크리스트', searchVolume: 55000, documentCount: 7200, type: '✈️ 여행키워드' },
        { keyword: '오사카 맛집 추천 현지인', searchVolume: 35000, documentCount: 4200, type: '🍽️ 맛집키워드' },
        { keyword: '강릉 카페거리 추천', searchVolume: 28000, documentCount: 3400, type: '☕ 카페키워드' }
      ]
    };

    // 카테고리별 키워드 선택
    const categoryMap: Record<string, string> = {
      'all': 'all',
      '전체': 'all',
      '정부지원금': '정부지원금',
      '생활꿀팁': '생활꿀팁',
      '쇼핑리뷰': '쇼핑리뷰',
      '여행맛집': '여행맛집'
    };

    const selectedCategory = categoryMap[category] || 'all';
    const keywords = goldenKeywordDB[selectedCategory] || goldenKeywordDB['all'];

    // 황금 키워드 형식으로 변환
    return keywords.map((kw, index) => ({
      keyword: kw.keyword,
      searchVolume: kw.searchVolume,
      documentCount: kw.documentCount,
      goldenRatio: parseFloat((kw.searchVolume / kw.documentCount).toFixed(2)),

      rookieFriendly: {
        score: Math.min(95, 70 + Math.floor(Math.random() * 25)),
        grade: index < 3 ? 'S' : (index < 7 ? 'A' : 'B') as 'S' | 'A' | 'B',
        reason: '낮은 경쟁, 높은 검색량으로 신생 블로거도 상위노출 가능',
        canRankWithin: index < 5 ? '3-7일' : '1-2주',
        requiredBlogIndex: '최적화 지수 30 이상'
      },

      timing: {
        score: Math.min(98, 75 + Math.floor(Math.random() * 23)),
        urgency: index < 3 ? 'NOW' : 'TODAY' as 'NOW' | 'TODAY',
        bestPublishTime: ['오전 7-9시', '오후 12-14시', '저녁 19-21시'][index % 3],
        trendDirection: 'rising' as const,
        peakPrediction: '2-3일 내 피크 예상'
      },

      blueOcean: {
        score: Math.min(92, 65 + Math.floor(Math.random() * 27)),
        competitorStrength: 'weak' as const,
        avgCompetitorBlogAge: '6개월 미만',
        oldPostRatio: 45 + Math.floor(Math.random() * 30),
        opportunity: '지금 작성하면 1페이지 진입 가능!'
      },

      trafficEstimate: {
        daily: `${Math.floor(kw.searchVolume * 0.02)}-${Math.floor(kw.searchVolume * 0.05)}명`,
        weekly: `${Math.floor(kw.searchVolume * 0.1)}-${Math.floor(kw.searchVolume * 0.25)}명`,
        monthly: `${Math.floor(kw.searchVolume * 0.3)}-${Math.floor(kw.searchVolume * 0.6)}명`,
        confidence: 75 + Math.floor(Math.random() * 15),
        disclaimer: '상위노출 기준 예상치입니다'
      },

      totalScore: Math.min(98, 80 + Math.floor(Math.random() * 18)),
      grade: index < 2 ? 'SSS' : (index < 5 ? 'SS' : 'S') as 'SSS' | 'SS' | 'S',

      proStrategy: {
        title: `${kw.keyword} 완벽 가이드 [2025년 최신]`,
        outline: ['서론 및 핵심 요약', '상세 정보 및 방법', '주의사항 및 팁', '결론 및 추가 정보'],
        wordCount: 2500 + Math.floor(Math.random() * 1000),
        mustInclude: ['신청방법', '자격조건', '기간', '주의사항'],
        avoidTopics: ['허위정보', '과장광고'],
        monetization: '애드센스 + 제휴마케팅 추천'
      },

      type: kw.type as any,
      category: selectedCategory,
      safetyLevel: 'safe' as const,
      safetyReason: '검증된 안전 키워드',
      source: 'PRO 황금키워드 DB',
      timestamp
    }));
  }

  if (!ipcMain.listenerCount('get-pro-traffic-categories')) {
    ipcMain.handle('get-pro-traffic-categories', async () => {
      return {
        success: true,
        categories: getProTrafficCategories()
      };
    });
    console.log('[KEYWORD-MASTER] ✅ get-pro-traffic-categories 핸들러 등록 완료');
  }

  // ===================================
  // 💵 AdSense 키워드 헌터 (1년/영구제 전용)
  // ===================================
  if (!ipcMain.listenerCount('hunt-adsense-keywords')) {
    ipcMain.handle('hunt-adsense-keywords', async (_event, options: {
      category?: string;
      seedKeywords?: string[];
      count?: number;
      excludeYmylHigh?: boolean;
      minInfoIntent?: number;
      minMonthlyRevenue?: number;
      requireRealData?: boolean;
      blueOceanOnly?: boolean;
      minBlueOceanRatio?: number;
      sortBy?: 'value' | 'blueOcean' | 'revenue' | 'reachable';
      newbieMode?: boolean;
      excludeZeroClickHigh?: boolean;
    }) => {
      try {
        // 라이선스 체크 (PRO와 동일)
        const license = await licenseManager.loadLicense();
        const upper = (license?.plan || license?.licenseType || '').toString().toUpperCase();
        const isPermanent = upper === 'EX' || upper === 'UNLIMITED' || upper === 'PERMANENT';
        const isYearPlus = upper === '1YEAR' || upper === '1YEARS' || upper === 'CUSTOM' ||
          (upper.match(/^(\d+)DAY$/) ? parseInt(RegExp.$1, 10) >= 365 : false);
        const canUse = !!license?.isValid && (isPermanent || isYearPlus || license?.isUnlimited === true || !license?.expiresAt);

        if (!canUse) {
          return {
            success: false,
            requiresPremium: true,
            error: 'AdSense 키워드 헌터는 1년/영구제 라이선스 전용 기능입니다.',
            keywords: [],
            summary: { totalFound: 0 }
          };
        }

        console.log('[ADSENSE] 🚀 헌팅 시작:', options);

        const result = await huntAdsenseKeywords({
          category: options?.category || 'all',
          seedKeywords: options?.seedKeywords || [],
          count: Math.min(Math.max(options?.count || 20, 5), 50),
          excludeYmylHigh: options?.excludeYmylHigh === true,
          minInfoIntent: typeof options?.minInfoIntent === 'number' ? options.minInfoIntent : 40,
          minMonthlyRevenue: typeof options?.minMonthlyRevenue === 'number' ? options.minMonthlyRevenue : 5000,
          requireRealData: options?.requireRealData !== false,
          blueOceanOnly: options?.blueOceanOnly === true,
          minBlueOceanRatio: typeof options?.minBlueOceanRatio === 'number' ? options.minBlueOceanRatio : undefined,
          sortBy: options?.sortBy,
          newbieMode: options?.newbieMode === true,
          excludeZeroClickHigh: options?.excludeZeroClickHigh === true,
        });

        if (!result.keywords || result.keywords.length === 0) {
          return {
            success: false,
            error: 'AdSense 적합 키워드를 찾지 못했습니다. 카테고리를 변경하거나 필터를 완화해보세요.',
            keywords: [],
            summary: { totalFound: 0 }
          };
        }

        return { success: true, ...result };
      } catch (error: any) {
        console.error('[ADSENSE] ❌ 오류:', error);
        return {
          success: false,
          error: `AdSense 헌팅 실패: ${error?.message || '알 수 없는 오류'}`,
          keywords: [],
          summary: { totalFound: 0 }
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ hunt-adsense-keywords 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('get-pro-hunt-dashboard')) {
    ipcMain.handle('get-pro-hunt-dashboard', async () => ({
      success: true,
      summary: getDashboardSummary(),
      history30d: getDailyHuntHistory(undefined, 30),
    }));
    console.log('[KEYWORD-MASTER] ✅ get-pro-hunt-dashboard 핸들러 등록 완료');
  }
  if (!ipcMain.listenerCount('run-daily-hunt-now')) {
    ipcMain.handle('run-daily-hunt-now', async () => {
      try { return { success: true, ...(await runDailyHuntNow()) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ run-daily-hunt-now 핸들러 등록 완료');
  }

  // 🏠 홈판 Phase A~E: 5개 신규 IPC
  if (!ipcMain.listenerCount('calculate-home-score')) {
    ipcMain.handle('calculate-home-score', async (_e, p: any) => {
      try { return { success: true, ...calculateHomeScore(p) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ calculate-home-score IPC 등록');
  }
  if (!ipcMain.listenerCount('predict-title-ctr')) {
    ipcMain.handle('predict-title-ctr', async (_e, p: { title: string; seedKeyword?: string }) => {
      try { return { success: true, ...predictTitleCtr(p.title, p.seedKeyword) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('generate-optimized-titles', async (_e, p: { keyword: string; count?: number; category?: string }) => {
      try { return { success: true, titles: await generateOptimizedTitles(p.keyword, { count: p.count, category: p.category }) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('batch-generate-titles', async (_e, p: { keywords: any[]; titlesPerKeyword?: number }) => {
      try { return { success: true, results: await batchGenerateTitlesWithCtr(p.keywords, p.titlesPerKeyword) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ predict-title-ctr/generate-optimized-titles/batch IPC 등록');
  }
  if (!ipcMain.listenerCount('analyze-vacancy')) {
    ipcMain.handle('analyze-vacancy', async (_e, p: { keyword: string }) => {
      try { return { success: true, ...(await analyzeVacancy(p.keyword)) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('batch-analyze-vacancy', async (_e, p: { keywords: string[] }) => {
      try {
        const m = await batchAnalyzeVacancy(p.keywords || []);
        return { success: true, results: Array.from(m.entries()).map(([k, v]) => ({ keyword: k, ...v })) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ analyze-vacancy/batch-analyze-vacancy IPC 등록');
  }

  // ⚡ 신선도 실측 (Phase B)
  if (!ipcMain.listenerCount('measure-freshness')) {
    ipcMain.handle('measure-freshness', async (_e, p: { keyword: string }) => {
      try {
        const { measureFreshness } = await import('../../utils/pro-hunter-v12/freshness-measure');
        const { EnvironmentManager } = await import('../../utils/environment-manager');
        const env = EnvironmentManager.getInstance().getConfig();
        return { success: true, ...(await measureFreshness(p.keyword, {
          naverClientId: env.naverClientId,
          naverClientSecret: env.naverClientSecret,
        })) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('batch-measure-freshness', async (_e, p: { keywords: string[] }) => {
      try {
        const { batchMeasureFreshness } = await import('../../utils/pro-hunter-v12/freshness-measure');
        const { EnvironmentManager } = await import('../../utils/environment-manager');
        const env = EnvironmentManager.getInstance().getConfig();
        const m = await batchMeasureFreshness(p.keywords || [], {
          naverClientId: env.naverClientId,
          naverClientSecret: env.naverClientSecret,
        });
        return { success: true, results: Array.from(m.entries()).map(([k, v]) => ({ keyword: k, ...v })) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ measure-freshness/batch IPC 등록');
  }

  // 📈 홈판 노출 추적 (Phase F)
  if (!ipcMain.listenerCount('record-home-publish')) {
    ipcMain.handle('record-home-publish', async (_e, p: any) => {
      try {
        const { recordPublish } = await import('../../utils/pro-hunter-v12/home-exposure-tracker');
        return { success: true, entry: recordPublish(p) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('measure-home-exposure', async (_e, p: { keyword: string; blogUrl?: string }) => {
      try {
        const { measureExposure } = await import('../../utils/pro-hunter-v12/home-exposure-tracker');
        return { success: true, result: await measureExposure(p.keyword, p.blogUrl) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('process-scheduled-measurements', async () => {
      try {
        const { processScheduledMeasurements } = await import('../../utils/pro-hunter-v12/home-exposure-tracker');
        return { success: true, ...(await processScheduledMeasurements()) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('get-home-exposure-stats', async () => {
      try {
        const { getExposureStats, getWeightAdjustments, getPublishedHistory } = await import('../../utils/pro-hunter-v12/home-exposure-tracker');
        return {
          success: true,
          stats: getExposureStats(),
          weights: getWeightAdjustments(),
          history: getPublishedHistory(20),
        };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ home-exposure IPC 등록 (record/measure/process/stats)');
  }

  // 🎯 키워드 가치 검증 (6 게이트)
  if (!ipcMain.listenerCount('verify-keyword-value')) {
    ipcMain.handle('verify-keyword-value', async (_e, p: any) => {
      try {
        const { verifyKeywordValue } = await import('../../utils/pro-hunter-v12/keyword-value-verifier');
        return { success: true, ...verifyKeywordValue(p) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('batch-verify-keyword-value', async (_e, p: { items: any[] }) => {
      try {
        const { verifyKeywordValue } = await import('../../utils/pro-hunter-v12/keyword-value-verifier');
        return { success: true, results: (p.items || []).map((it: any) => ({ ...it, valueGate: verifyKeywordValue(it) })) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ verify-keyword-value/batch IPC 등록');
  }

  // 🏆 통합 등급 (Phase G)
  if (!ipcMain.listenerCount('calculate-unified-grade')) {
    ipcMain.handle('calculate-unified-grade', async (_e, p: any) => {
      try {
        const { calculateUnifiedGrade } = await import('../../utils/pro-hunter-v12/unified-grade-engine');
        return { success: true, ...calculateUnifiedGrade(p) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('batch-unified-grade', async (_e, p: { items: any[] }) => {
      try {
        const { batchUnifiedGrade } = await import('../../utils/pro-hunter-v12/unified-grade-engine');
        return { success: true, results: batchUnifiedGrade(p.items || []) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ unified-grade IPC 등록');
  }

  // 🚀 독보성 Phase 1~5: 5개 신규 IPC
  if (!ipcMain.listenerCount('expand-with-lsi')) {
    ipcMain.handle('expand-with-lsi', async (_e, p: { seed: string; maxPerCategory?: number }) => {
      try { return { success: true, ...(await expandWithLSI(p.seed, { maxPerCategory: p.maxPerCategory })) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('expand-seeds-lsi-batch', async (_e, p: { seeds: string[]; maxPerSeed?: number }) => {
      try { return { success: true, keywords: await expandSeedsWithLSI(p.seeds, p.maxPerSeed) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ expand-with-lsi/batch IPC 등록');
  }
  if (!ipcMain.listenerCount('collect-global-signals')) {
    ipcMain.handle('collect-global-signals', async () => {
      try { return { success: true, ...(await collectGlobalSignals()) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('localize-keywords-to-korean', async (_e, p: { english: string[] }) => {
      try { return { success: true, mapped: await localizeToKorean(p.english || []) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ collect-global-signals IPC 등록');
  }
  if (!ipcMain.listenerCount('analyze-content-gap')) {
    ipcMain.handle('analyze-content-gap', async (_e, p: { blogUrl: string; targetCategory?: string }) => {
      try { return { success: true, ...(await analyzeContentGap(p)) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ analyze-content-gap IPC 등록');
  }
  if (!ipcMain.listenerCount('mine-qa-keywords')) {
    ipcMain.handle('mine-qa-keywords', async (_e, p: { seed: string; limit?: number }) => {
      try { return { success: true, ...(await mineQAKeywords(p.seed, { limit: p.limit })) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ mine-qa-keywords IPC 등록');
  }
  if (!ipcMain.listenerCount('record-keyword-rejection')) {
    ipcMain.handle('record-keyword-rejection', async (_e, p: { keyword: string; category: string; reason: any }) => {
      try { return { success: true, pref: recordRejection(p.keyword, p.category, p.reason) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('record-keyword-acceptance', async (_e, p: { keyword: string; category: string; actionType: any }) => {
      try { return { success: true, pref: recordAcceptance(p.keyword, p.category, p.actionType) }; }
      catch (err: any) { return { success: false, error: err?.message }; }
    });
    ipcMain.handle('get-preference-stats', async () => ({ success: true, ...getPreferenceStats() }));
    console.log('[KEYWORD-MASTER] ✅ record-keyword-rejection/acceptance/stats IPC 등록');
  }

  // 🧠 한계4: 사용자 피드백 + 모델 자동 보정
  if (!ipcMain.listenerCount('record-pro-feedback')) {
    ipcMain.handle('record-pro-feedback', async (_e, payload: any) => {
      try {
        if (!payload?.keyword || !payload?.category) return { success: false, error: '필수 필드 누락' };
        const result = recordFeedback({
          keyword: payload.keyword,
          category: payload.category,
          predicted: payload.predicted || { publisherMonthlyRevenue: 0, reachabilityMonth12: 0, searchVolume: 0 },
          actual: payload.actual || {},
        });
        return { success: true, ...result };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
    console.log('[KEYWORD-MASTER] ✅ record-pro-feedback 핸들러 등록 완료');
  }
  if (!ipcMain.listenerCount('get-pro-calibrations')) {
    ipcMain.handle('get-pro-calibrations', async () => ({
      success: true,
      calibrations: getAllCalibrations(),
      stats: getFeedbackStats(),
      history: getFeedbackHistory(50),
    }));
    console.log('[KEYWORD-MASTER] ✅ get-pro-calibrations 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('generate-pro-excel-report')) {
    ipcMain.handle('generate-pro-excel-report', async (_e, payload: { keywords: any[]; category: string; outputPath?: string; openInExplorer?: boolean }) => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const fn = payload.openInExplorer ? generateAndOpenExcelReport : generateExcelReport;
        const file = fn({
          keywords: payload.keywords || [],
          period: { startDate, endDate: today },
          category: payload.category || 'all',
        }, payload.outputPath);
        return { success: true, file };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ generate-pro-excel-report 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('get-pro-worker-status')) {
    ipcMain.handle('get-pro-worker-status', async () => ({
      success: true,
      health: getWorkerHealthSummary(),
      workers: getWorkerStatus(),
    }));
    console.log('[KEYWORD-MASTER] ✅ get-pro-worker-status 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('get-adsense-categories')) {
    ipcMain.handle('get-adsense-categories', async () => ({
      success: true,
      categories: ADSENSE_CATEGORIES,
    }));
    console.log('[KEYWORD-MASTER] ✅ get-adsense-categories 핸들러 등록 완료');
  }

  // ===================================
  // 🔍 연상 키워드 → 황금키워드 발굴
  // ===================================
  if (!ipcMain.listenerCount('hunt-golden-from-related')) {
    ipcMain.handle('hunt-golden-from-related', async (_event, keyword: string) => {
      try {
        console.log('[GOLDEN-FROM-RELATED] 🔍 연상 키워드 → 황금키워드 발굴 시작:', keyword);

        if (!keyword || keyword.trim().length === 0) {
          return { error: true, message: '키워드를 입력해주세요.' };
        }

        const trimmedKeyword = keyword.trim();
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();

        const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

        console.log('[GOLDEN-FROM-RELATED] API 키 확인:', {
          hasClientId: !!naverClientId,
          hasClientSecret: !!naverClientSecret
        });

        // 🔥 1단계: 연관 키워드 수집 (API 있으면 네이버, 없으면 자체 생성)
        let relatedKeywords: string[] = [];

        if (naverClientId && naverClientSecret) {
          // 네이버 API로 연관 키워드 수집
          try {
            // 네이버 검색 API로 연관 키워드 추출
            const blogApiUrl = 'https://openapi.naver.com/v1/search/blog.json';
            const headers = {
              'X-Naver-Client-Id': naverClientId,
              'X-Naver-Client-Secret': naverClientSecret
            };

            const params = new URLSearchParams({
              query: trimmedKeyword,
              display: '100',
              sort: 'sim'
            });

            const response = await fetch(`${blogApiUrl}?${params}`, {
              method: 'GET',
              headers
            });

            if (response.ok) {
              const data = await response.json();
              const items = data.items || [];

              // 제목에서 키워드 추출
              const keywordSet = new Set<string>();
              const seedWords = trimmedKeyword.toLowerCase().split(/\s+/);

              items.forEach((item: any) => {
                const title = (item.title || '').replace(/<[^>]*>/g, '').trim();

                // 2-5단어 조합 추출
                const words = title.split(/[\s,\-\[\]()｜|/·]+/).filter((w: string) => w && w.length >= 2);

                for (let i = 0; i < words.length; i++) {
                  for (let len = 2; len <= Math.min(5, words.length - i); len++) {
                    const phrase = words.slice(i, i + len).join(' ');
                    if (phrase.length >= 4 && phrase.length <= 30) {
                      // 원본 키워드의 단어가 포함된 조합만
                      const phraseWords = phrase.toLowerCase().split(' ');
                      if (seedWords.some(sw => phraseWords.some(pw => pw.includes(sw) || sw.includes(pw)))) {
                        keywordSet.add(phrase);
                      }
                    }
                  }
                }
              });

              relatedKeywords = Array.from(keywordSet).slice(0, 50);
            }
          } catch (apiError) {
            console.warn('[GOLDEN-FROM-RELATED] API 호출 실패:', apiError);
          }
        }

        // 🔥 API 없거나 결과 없으면 자체 생성
        if (relatedKeywords.length === 0) {
          console.log('[GOLDEN-FROM-RELATED] ⚠️ API 결과 없음, 자체 연관 키워드 생성');
          relatedKeywords = generateRelatedKeywords(trimmedKeyword);
        }

        console.log(`[GOLDEN-FROM-RELATED] 연관 키워드 ${relatedKeywords.length}개 수집 완료`);

        // 🔥 2단계: 각 연관 키워드 분석
        const goldenKeywords: Array<{
          keyword: string;
          searchVolume: number | null;
          documentCount: number | null;
          goldenRatio: string;
          score: number;
          type: string;
          description: string;
        }> = [];

        for (const kw of relatedKeywords) {
          let searchVolume: number | null = null;
          let documentCount: number | null = null;

          if (naverClientId && naverClientSecret) {
            try {
              // 검색량 조회
              const volumeData = await getNaverKeywordSearchVolumeSeparate({
                clientId: naverClientId,
                clientSecret: naverClientSecret
              }, [kw]);

              if (volumeData && volumeData.length > 0) {
                const pc = volumeData[0]?.pcSearchVolume ?? null;
                const mobile = volumeData[0]?.mobileSearchVolume ?? null;
                searchVolume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
              }

              // 문서수 조회
              const blogApiUrl = 'https://openapi.naver.com/v1/search/blog.json';
              const headers = {
                'X-Naver-Client-Id': naverClientId,
                'X-Naver-Client-Secret': naverClientSecret
              };
              const docParams = new URLSearchParams({ query: kw, display: '1' });
              const docResponse = await fetch(`${blogApiUrl}?${docParams}`, {
                method: 'GET',
                headers
              });
              if (docResponse.ok) {
                const docData = await docResponse.json();
                const rawTotal = (docData as any)?.total;
                documentCount = typeof rawTotal === 'number'
                  ? rawTotal
                  : (typeof rawTotal === 'string' ? parseInt(rawTotal, 10) : null);
              }

              await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
            } catch (err) {
              console.warn(`[GOLDEN-FROM-RELATED] "${kw}" 분석 실패`);
            }
          }

          // 황금 비율 계산
          const goldenRatio = (typeof documentCount === 'number' && documentCount > 0 && typeof searchVolume === 'number')
            ? (searchVolume / documentCount)
            : 0;

          // 황금 키워드 판정 (검색량 높고 경쟁 낮은 것)
          const searchVolumeForCalc = searchVolume ?? 0;
          const isGolden = (searchVolumeForCalc >= 500 && goldenRatio >= 2) ||
            (searchVolumeForCalc >= 1000 && goldenRatio >= 1) ||
            (searchVolumeForCalc >= 100 && goldenRatio >= 5);

          if (isGolden || goldenKeywords.length < 10) {
            const score = Math.min(100, Math.round((goldenRatio * 10) + (searchVolumeForCalc / 500)));

            let type = '💡 추천 키워드';
            if (goldenRatio >= 10) type = '🏆 초황금 키워드';
            else if (goldenRatio >= 5) type = '⭐ 황금 키워드';
            else if (goldenRatio >= 2) type = '💎 우수 키워드';

            let description = '';
            if (goldenRatio >= 10) description = '검색량 대비 경쟁이 매우 낮아 진입하기 좋은 키워드입니다!';
            else if (goldenRatio >= 5) description = '검색량은 적당하고 경쟁이 낮은 황금 키워드입니다.';
            else if (goldenRatio >= 2) description = '경쟁이 낮아 상위 노출 가능성이 높습니다.';
            else description = '잠재력이 있는 키워드입니다.';

            goldenKeywords.push({
              keyword: kw,
              searchVolume,
              documentCount,
              goldenRatio: goldenRatio.toFixed(2),
              score,
              type,
              description
            });
          }
        }

        // 점수순 정렬
        goldenKeywords.sort((a, b) => b.score - a.score);

        console.log(`[GOLDEN-FROM-RELATED] ✅ 황금 키워드 ${goldenKeywords.length}개 발굴 완료`);

        return {
          success: true,
          keyword: trimmedKeyword,
          totalAnalyzed: relatedKeywords.length,
          goldenKeywords: goldenKeywords.slice(0, 30) // 최대 30개
        };

      } catch (error: any) {
        console.error('[GOLDEN-FROM-RELATED] ❌ 오류:', error);

        // 🔥 오류 시 에러 반환 (더미 데이터 제공 안 함)
        return {
          success: false,
          keyword,
          totalAnalyzed: 0,
          goldenKeywords: [],
          error: error.message || '분석 중 오류가 발생했습니다.',
          note: 'API 키가 올바르게 설정되어 있는지 확인해주세요.'
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ hunt-golden-from-related 핸들러 등록 완료');
  }

  function generateRelatedKeywords(keyword: string): string[] {
    // 동기 함수에서는 빈 배열 반환 (비동기 버전 사용 권장)
    console.log('[GOLDEN-FROM-RELATED] 📌 동기 함수 - 비동기 getRelatedKeywordsFromCache() 사용 권장');
    return [];
  }

  // 🔥 [v16.0] 연관 키워드 비동기 조회 - 네이버 실시간 API 활용!
  async function generateRelatedKeywordsAsync(keyword: string): Promise<string[]> {
    try {
      const related = await getRelatedKeywordsFromCache(keyword);
      console.log(`[GOLDEN-FROM-RELATED] ✅ 연관검색어 ${related.length}개: ${keyword}`);
      return related;
    } catch (e) {
      console.warn(`[GOLDEN-FROM-RELATED] ⚠️ 연관검색어 조회 실패: ${keyword}`);
      return [];
    }
  }

  // 🔥 백업 황금 키워드 생성 함수 - 더미 데이터 사용 금지
  function generateBackupGoldenKeywords(category: string): Array<{
    keyword: string;
    timingGoldScore: number;
    urgency: string;
    reason: string;
    trendingReason: string;
    whyNow: string;
    suggestedDeadline: string;
    estimatedTraffic: number;
    growthRate: number;
    documentCount: number;
    searchVolume: number;
    goldenRatio: number;
    relatedKeywords: any[];
    associativeKeywords: any[];
    suggestedKeywords: any[];
  }> {
    // ❌ 더미 데이터 사용 금지 - 빈 배열 반환
    console.log('[BACKUP-KEYWORDS] ⚠️ 더미 데이터 사용 금지 - 빈 배열 반환');
    return [];
  }
}
