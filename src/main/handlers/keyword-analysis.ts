// 키워드 분석 핸들러
import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getNaverKeywordSearchVolumeSeparate, getNaverRelatedKeywords } from '../../utils/naver-datalab-api';
import { getNaverAutocompleteKeywords } from '../../utils/naver-autocomplete';
import { EnvironmentManager } from '../../utils/environment-manager';
import { getNaverRealtimeKeywords, RealtimeKeyword } from '../../utils/realtime-search-keywords';
import * as licenseManager from '../../utils/licenseManager';
import { findUltimateNicheKeywords } from '../../utils/ultimate-niche-finder';
import { checkUnlimitedLicense } from './shared';
import { getFreshKeywordsAPI } from '../../utils/mass-collection/fresh-keywords-api';


export function setupKeywordAnalysisHandlers(): void {
  // v2.43.4/5: API 키 즉시 진단 — 단일 호출로 정확한 응답 코드/메시지 확인 (네이버 + YouTube)
  if (!ipcMain.listenerCount('test-naver-api-keys')) {
    ipcMain.handle('test-naver-api-keys', async () => {
      const env = EnvironmentManager.getInstance().getConfig();
      const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
      const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
      const saLicense = env.naverSearchAdAccessLicense || '';
      const saSecret = env.naverSearchAdSecretKey || '';
      const saCustomer = env.naverSearchAdCustomerId || '';
      const ytKey = env.youtubeApiKey || process.env['YOUTUBE_API_KEY'] || '';

      const result: any = {
        success: true,
        openApi: { present: !!clientId && !!clientSecret, clientIdLen: clientId.length, clientSecretLen: clientSecret.length },
        searchAd: { present: !!saLicense && !!saSecret, licenseLen: saLicense.length, secretLen: saSecret.length, customerId: saCustomer || '(없음)' },
        youtube: { present: !!ytKey, keyLen: ytKey.length },
        tests: {} as Record<string, any>,
      };

      // 1) Naver Open API blog.json 테스트
      if (clientId && clientSecret) {
        try {
          const r = await fetch('https://openapi.naver.com/v1/search/blog.json?query=%ED%85%8C%EC%8A%A4%ED%8A%B8&display=1', {
            headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
          });
          const body = await r.text().catch(() => '');
          let parsed: any = null;
          try { parsed = JSON.parse(body); } catch {}
          result.tests.blogSearch = {
            status: r.status,
            statusText: r.statusText,
            ok: r.ok,
            errorCode: parsed?.errorCode || null,
            errorMessage: parsed?.errorMessage || null,
            total: parsed?.total ?? null,
            sample: body.slice(0, 200),
          };
        } catch (e: any) {
          result.tests.blogSearch = { status: 0, error: e?.message };
        }
      } else {
        result.tests.blogSearch = { status: -1, error: 'Open API 키 미등록' };
      }

      // 2) Naver SearchAd 테스트
      if (saLicense && saSecret) {
        try {
          const { getNaverSearchAdKeywordVolume } = await import('../../utils/naver-searchad-api');
          const cid = saCustomer && saCustomer.trim() !== '' ? saCustomer.trim() : (saLicense.split(':')[0] || saLicense.substring(0, 10));
          const t0 = Date.now();
          const out = await getNaverSearchAdKeywordVolume(
            { accessLicense: saLicense, secretKey: saSecret, customerId: cid },
            ['테스트']
          );
          result.tests.searchAd = {
            ok: out.length > 0,
            results: out.length,
            elapsed: Date.now() - t0,
            sample: out[0] || null,
          };
        } catch (e: any) {
          result.tests.searchAd = { ok: false, error: e?.message };
        }
      } else {
        result.tests.searchAd = { ok: false, error: 'SearchAd 키 미등록' };
      }

      // 3) YouTube Data API v3 테스트 (v2.43.5)
      if (ytKey) {
        try {
          const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=KR&maxResults=1&key=${ytKey}`);
          const body = await r.text().catch(() => '');
          let parsed: any = null;
          try { parsed = JSON.parse(body); } catch {}
          result.tests.youtube = {
            status: r.status,
            statusText: r.statusText,
            ok: r.ok,
            errorReason: parsed?.error?.errors?.[0]?.reason || null,
            errorMessage: parsed?.error?.message || null,
            itemsCount: Array.isArray(parsed?.items) ? parsed.items.length : null,
            sample: body.slice(0, 300),
          };
        } catch (e: any) {
          result.tests.youtube = { status: 0, error: e?.message };
        }
      } else {
        result.tests.youtube = { status: -1, error: 'YouTube API 키 미등록' };
      }

      // 진단 요약
      const blogOk = result.tests.blogSearch?.ok === true && (result.tests.blogSearch?.total ?? -1) >= 0;
      const saOk = result.tests.searchAd?.ok === true;
      const ytOk = result.tests.youtube?.ok === true && (result.tests.youtube?.itemsCount ?? 0) > 0;
      const fails: string[] = [];
      if (!blogOk) fails.push('Open API: ' + (result.tests.blogSearch?.errorMessage || result.tests.blogSearch?.statusText || result.tests.blogSearch?.error || '실패'));
      if (!saOk) fails.push('SearchAd: ' + (result.tests.searchAd?.error || '실패'));
      if (ytKey && !ytOk) {
        const reason = result.tests.youtube?.errorReason;
        const ytHint = reason === 'accessNotConfigured'
          ? 'YouTube Data API v3 미활성 — Google Cloud Console → API 라이브러리에서 활성화 필요'
          : reason === 'keyInvalid'
            ? '잘못된 API 키 — Google Cloud Console에서 새 키 발급'
            : reason === 'quotaExceeded'
              ? '일일 quota 초과 (10,000 unit) — 내일 자동 리셋'
              : reason === 'forbidden'
                ? 'API 키 제한 (HTTP referrer/IP) — Google Cloud Console에서 제한 해제'
                : (result.tests.youtube?.errorMessage || result.tests.youtube?.error || '실패');
        fails.push('YouTube: ' + ytHint);
      }
      result.diagnosis = fails.length === 0
        ? '✅ 모든 API 정상 작동'
        : '❌ ' + fails.length + '개 실패\n  • ' + fails.join('\n  • ');
      return result;
    });
    console.log('[KEYWORD-MASTER] ✅ test-naver-api-keys 핸들러 등록');
  }

  ipcMain.handle('check-keyword-rank', async (_event, data: { keyword: string; blogUrl: string }) => {
    console.log('[KEYWORD-MASTER] 키워드 순위 확인:', data);

    // 라이선스 체크
    const license = await licenseManager.loadLicense();
    if (!license || !license.isValid) {
      return {
        error: '라이선스 미등록',
        message: '라이선스가 등록되지 않았습니다. 라이선스를 등록해주세요.',
        requiresLicense: true
      };
    }

    // TODO: 실제 순위 확인 로직 구현
    return {
      rank: Math.floor(Math.random() * 50) + 1,
      totalResults: Math.floor(Math.random() * 50000) + 10000,
      estimatedCTR: (Math.random() * 10 + 5).toFixed(1)
    };
  });

  ipcMain.handle('analyze-competitors', async (_event, keyword: string) => {
    console.log('[KEYWORD-MASTER] 경쟁자 분석:', keyword);

    // 무제한 라이선스 체크
    const licenseCheck = checkUnlimitedLicense();
    if (!licenseCheck.allowed) {
      return {
        error: licenseCheck.error?.error || '무제한 라이선스가 필요합니다',
        message: licenseCheck.error?.message || '이 기능은 무제한 기간 구매자만 사용할 수 있습니다.',
        requiresUnlimited: true,
        competitors: []
      };
    }

    try {
      // 환경변수에서 네이버 API 키 가져오기
      const envManager = EnvironmentManager.getInstance();
      const env = envManager.getConfig();
      const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
      const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

      if (!naverClientId || !naverClientSecret) {
        console.warn('[KEYWORD-MASTER] 네이버 API 키가 설정되지 않았습니다.');
        return {
          error: '네이버 API 키가 필요합니다',
          message: '경쟁자 분석을 위해서는 네이버 API 키(Client ID, Client Secret)가 필요합니다.',
          competitors: []
        };
      }

      // 네이버 블로그 검색 API 호출
      const encodedQuery = encodeURIComponent(keyword);
      const apiUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodedQuery}&display=10&sort=sim`;

      const response = await fetch(apiUrl, {
        headers: {
          'X-Naver-Client-Id': naverClientId,
          'X-Naver-Client-Secret': naverClientSecret
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[KEYWORD-MASTER] 네이버 API 호출 실패:', response.status, errorData);
        throw new Error(`네이버 API 호출 실패: ${response.status}`);
      }

      const data = await response.json();
      const competitors = (data.items || []).map((item: any, index: number) => {
        // 제목에서 HTML 태그 제거
        const title = (item.title || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
        const description = (item.description || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');

        // 본문 길이 추정 (설명 기반)
        const estimatedWordCount = Math.floor(description.length * 10); // 대략적인 추정

        return {
          rank: index + 1,
          title: title,
          url: item.link || '',
          description: description,
          blogName: item.bloggername || '알 수 없음',
          postDate: item.postdate || '',
          wordCount: estimatedWordCount,
          images: Math.floor(description.length / 200) // 설명 길이 기반 추정
        };
      });

      console.log(`[KEYWORD-MASTER] 경쟁자 ${competitors.length}개 분석 완료`);

      return {
        competitors: competitors,
        keyword: keyword,
        totalResults: data.total || 0
      };

    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 경쟁자 분석 실패:', error);
      return {
        error: '경쟁자 분석 실패',
        message: error.message || '경쟁자 분석 중 오류가 발생했습니다.',
        competitors: []
      };
    }
  });

  // 키워드 확장 조회 핸들러 (확장 키워드, 연관 키워드, 관련 키워드)
  if (!ipcMain.listenerCount('get-keyword-expansions')) {
    ipcMain.handle('get-keyword-expansions', async (event, keyword: string, options?: { maxCount?: number }) => {
      try {
        if (!keyword || keyword.trim().length === 0) {
          throw new Error('키워드를 입력해주세요.');
        }

        const trimmedKeyword = keyword.trim();
        // 🔥 개수 제한: null이면 무제한, 숫자면 해당 개수까지만
        const maxCount = options?.maxCount ?? 100; // 기본값 100개
        const isUnlimited = maxCount === null || maxCount <= 0;
        const targetCount = isUnlimited ? 10000 : maxCount; // 🔥 무제한 시 최대 10,000개로 확대

        console.log(`[KEYWORD-EXPANSIONS] 키워드 확장 조회 시작: "${trimmedKeyword}", 목표 개수: ${isUnlimited ? '무제한' : targetCount}개`);

        // 🔥🔥🔥 검색의도가 명확한 키워드 검증 함수 (끝판왕 필터) 🔥🔥🔥
        const seedWord = trimmedKeyword.split(' ')[0].toLowerCase();

        const isValidSearchKeyword = (kw: string): boolean => {
          const trimmed = kw.trim();

          // ============================================
          // 1️⃣ 기본 필터 (반드시 통과해야 함)
          // ============================================

          // 길이 체크: 최소 3자, 최대 40자
          if (trimmed.length < 3 || trimmed.length > 40) return false;

          // 원본 키워드와 동일하면 제외
          if (trimmed.toLowerCase() === trimmedKeyword.toLowerCase()) return false;

          // ============================================
          // 2️⃣ 특수문자/기호 필터 (완전 제거)
          // ============================================

          // 허용 문자: 한글, 영문, 숫자, 공백만
          if (!/^[가-힣a-zA-Z0-9\s]+$/.test(trimmed)) return false;

          // ============================================
          // 3️⃣ 숫자/단위 키워드 필터
          // ============================================

          // 숫자로만 구성된 키워드 제외
          if (/^[\d\s]+$/.test(trimmed)) return false;

          // 단독 숫자+단위 (20%, 16조, 4분기 등)
          if (/^\d+[%조억원회차세대주차월분기]?$/.test(trimmed)) return false;

          // 숫자 비율이 50% 이상이면 제외 (p31, 56% 등)
          const digitCount = (trimmed.match(/\d/g) || []).length;
          if (digitCount / trimmed.length > 0.5 && trimmed.length < 8) return false;

          // ============================================
          // 4️⃣ 불완전한 문장 조각 필터 (핵심!)
          // ============================================

          // 단독 조사/어미로 끝나는 불완전 키워드
          const incompleteEndings = [
            /을$/, /를$/, /이$/, /가$/, /에$/, /의$/, /로$/, /으로$/,
            /와$/, /과$/, /도$/, /만$/, /까지$/, /부터$/, /에서$/,
            /에게$/, /한테$/, /께$/, /고$/, /며$/, /면서$/, /서$/,
            /지$/, /네$/, /야$/, /는$/, /은$/, /던$/, /할$/
          ];
          // 단, 시드 키워드가 포함되지 않은 짧은 키워드만 체크
          if (!trimmed.toLowerCase().includes(seedWord) && trimmed.length < 10) {
            if (incompleteEndings.some(pattern => pattern.test(trimmed))) return false;
          }

          // 불완전한 동사형 어미 (질문형/진행형)
          const verbFragments = [
            /될까$/, /말까$/, /팔까$/, /살까$/, /일까$/, /볼까$/,
            /오르고$/, /내리는$/, /올라$/, /내려$/, /떨어$/,
            /보내고$/, /들어올$/, /매수한$/, /투자해$/, /밀리는$/
          ];
          if (verbFragments.some(p => p.test(trimmed)) && trimmed.length < 12) return false;

          // ============================================
          // 5️⃣ 뉴스/기사 제목 조각 필터
          // ============================================

          const junkPatterns = [
            /^현재/, /^매수/, /^반전/, /^폭락/, /^급등/, /^급락/,
            /시장$/, /상장$/, /반전$/, /폭락$/, /급등$/, /급락$/,
            /만세$/, /출시$/, /발표$/, /시작$/, /때문$/,
            /정확히$/, /의외로$/, /이유가$/, /신호를$/,
            /3가지$/, /총정리$/
          ];
          if (!trimmed.toLowerCase().includes(seedWord) && trimmed.length < 8) {
            if (junkPatterns.some(p => p.test(trimmed))) return false;
          }

          // v2.43.11: 쇼핑몰/광고 카피 차단 — 시드 미포함 시 광고 시그널 단어 1개라도 있으면 제외
          // (예: "와우회원은 무제한 무료배송", "5월 기간 한정", "신규 가입 8만원 쿠폰", "빅스마일데이 한정특가")
          const adShoppingPatterns = [
            /무료배송/, /한정특가/, /신규\s*가입/, /첫\s*구매/, /와우회원/,
            /사은품/, /적립금/, /\d+만원\s*쿠폰/, /\d+%\s*할인/,
            /빅스마일/, /빅세일/, /타임세일/, /깜짝세일/,
            /무이자할부/, /무료체험/, /\d+개월\s*무이자/,
          ];
          if (!trimmed.toLowerCase().includes(seedWord)) {
            if (adShoppingPatterns.some(p => p.test(trimmed))) return false;
          }

          // v2.43.11: 슬로건/감탄 종결 어미 차단 (검색 키워드가 아닌 마케팅 카피)
          // (예: "좋아하는 건 누구나 남기고 싶으니까", "네이버가 더 편해지는 순간")
          const sloganEndings = [
            /으니까$/, /으니$/, /네요$/, /군요$/, /거든요$/,
            /순간$/, /때$/, /지는$/, /해보세요$/, /해드려요$/,
            /싶으니까$/, /싶어요$/, /있어요$/, /있을까$/,
            /기쁨$/, /행복$/, /설렘$/,
          ];
          if (!trimmed.toLowerCase().includes(seedWord) && trimmed.length >= 6) {
            if (sloganEndings.some(p => p.test(trimmed))) return false;
          }

          // v2.43.11: 평서문 — 조사 "은/는/이/가" + 동사 종결 패턴 (검색어 아님)
          // "네이버가 더 편해지는 순간", "와우회원은 무제한 무료배송"
          const declarativeSentence = /(은|는|이|가)\s+[가-힣]/;
          if (!trimmed.toLowerCase().includes(seedWord) && declarativeSentence.test(trimmed) && trimmed.length >= 8) {
            return false;
          }

          // ============================================
          // 6️⃣ 너무 일반적인 단어 필터
          // ============================================

          const genericWords = [
            '컴퓨터', '이벤트', '인프라', '반도체', '메모리', '배당금',
            '투자자', '대장주', '빅테크', '콜라보', '중심지', '국산화'
          ];
          // 단독 일반 단어 (시드와 관련 없이 단독으로 나오면 제외)
          if (genericWords.includes(trimmed) && !trimmed.includes(' ')) return false;

          // ============================================
          // 7️⃣ 연관성 검증 (끝판왕 - 시드 필수!)
          // ============================================

          // 🔥 v12.0: 시드 필터 완화 - 연관 키워드도 수집!
          // 시드 키워드 포함 여부 확인 (필수 아님)
          const containsSeed = trimmed.toLowerCase().includes(seedWord);

          // 🔥 시드 포함 키워드는 대부분 유효하되, 찌꺼기 꼬리는 강하게 제거
          if (containsSeed) {
            // 공백 유무와 무관하게 "시드 + 1글자" 꼬리는 제거 (예: 패딩세탁법바/사/자/카...)
            const compact = trimmed.replace(/\s+/g, '');
            const seedCompact = trimmedKeyword.replace(/\s+/g, '');
            if (seedCompact && compact.startsWith(seedCompact)) {
              const tail = compact.slice(seedCompact.length);
              if (tail.length === 1) return false;
            }

            const parts = trimmed.split(' ').map(s => s.trim()).filter(Boolean);
            const last = parts.length ? parts[parts.length - 1] : '';
            const junkTailTokens = new Set<string>([
              '갤', '룰', '칼', '죽', '팀', '후', '툴', '팩', '짤', '썰', '짤방', '토', '봄', '빵'
            ]);
            if (parts.length >= 2) {
              if (last.length <= 1) return false;
              if (junkTailTokens.has(last)) return false;
            }
            if (trimmed.length >= 4) return true;
          }

          // 🔥 시드 미포함 키워드도 검색의도가 명확하면 통과 (연관 키워드 수집!)
          // 단, 더 엄격한 조건 적용

          // 시드 키워드가 포함된 경우만 추가 검증
          // 공백이 있는 복합 키워드인지
          const hasSpace = trimmed.includes(' ');

          // 검색의도가 명확한 접미사 패턴 (자동완성에서 실제로 나오는 것들)
          const validSuffixes = [
            // 가격/비용 관련
            '가격', '비용', '가격비교', '시세', '견적',
            // 평가/후기 관련
            '추천', '후기', '리뷰', '평가', '비교', '순위', '정보', '장단점',
            // 분석/전망 관련  
            '전망', '분석', '주가', '배당', '실적', '뉴스', '관련주', '투자',
            // 방법/신청 관련
            '방법', '하는법', '신청', '신청방법', '조건', '자격', '기간', '시간',
            // 위치/연락처 관련
            '위치', '주소', '연락처', '전화번호', '홈페이지', '사이트', '앱', '어플',
            // 특징/종류 관련
            '장점', '단점', '특징', '종류', '차이', '차이점', '뜻', '의미',
            // 제품 관련
            '신제품', '신상', '출시일', '예약', '구매', '판매', '구입', '매장',
            // 회사/취업 관련
            '채용', '연봉', '복지', '근무환경', '입사', '면접', '자소서', '공채',
            // 교육/자격 관련
            '강의', '수업', '자격증', '시험', '합격', '준비',
            // 일정/이벤트 관련
            '일정', '스케줄', '이벤트', '행사', '프로모션', '할인'
          ];
          const hasValidSuffix = validSuffixes.some(s => trimmed.endsWith(s));

          // ✅ 통과 조건 (시드 키워드 미포함 시 더 엄격)
          // 1. 유효한 접미사가 있어야 함
          // 2. 충분한 길이 (8자 이상)
          // 3. 공백이 있는 복합 키워드

          if (hasValidSuffix && trimmed.length >= 5) {
            return true;
          }
          if (hasSpace && trimmed.length >= 8) {
            return true;
          }

          return false;
        };

        // 🔥 실시간 로그 전송 헬퍼 함수 (세밀한 진행률)
        const sendProgress = (step: string, current: number, total: number, message: string, customPercent?: number) => {
          let percent = 0;

          if (customPercent !== undefined) {
            percent = customPercent;
          } else {
            // 각 단계별 진행률 가중치
            // init: 0-5%, original: 5-10%, autocomplete: 10-20%, related: 20-30%, patterns: 30-40%, doccount: 40-100%
            const stepWeights: Record<string, { start: number; range: number }> = {
              'init': { start: 0, range: 5 },
              'api-check': { start: 5, range: 5 },
              'original': { start: 10, range: 5 },
              'autocomplete': { start: 15, range: 10 },
              'related': { start: 25, range: 10 },
              'patterns': { start: 35, range: 5 },
              'additional': { start: 37, range: 3 },
              'doccount': { start: 40, range: 60 }
            };

            const weight = stepWeights[step] || { start: 0, range: 0 };
            const progress = total > 0 ? (current / total) * weight.range : 0;
            percent = Math.round(weight.start + progress);
          }

          event.sender.send('keyword-expansion-progress', {
            step,
            current,
            total,
            message,
            percent
          });
        };

        sendProgress('init', 0, 1, '🔍 키워드 확장 조회 시작...', 0);

        // 환경 변수에서 API 키 로드
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

        const hasNaverApiKeys = !!(naverClientId && naverClientSecret);
        const smartBlockOnlyFill = isUnlimited || targetCount > 150;
        const shouldComputeMetrics = hasNaverApiKeys && !isUnlimited;

        sendProgress('api-check', 1, 5, '✅ API 키 확인 완료');

        const allKeywords: Array<{
          keyword: string;
          pcSearchVolume?: number | null;
          mobileSearchVolume?: number | null;
          searchVolume?: number | null;
          type: 'original' | 'expansion' | 'related' | 'suggested';
        }> = [];

        // 1. 입력 키워드를 1번으로 추가
        sendProgress('original', 2, 5, `📝 입력 키워드 검색량 조회 중: "${trimmedKeyword}"`);
        try {
          if (shouldComputeMetrics) {
            const baseVolumeData = await getNaverKeywordSearchVolumeSeparate({
              clientId: naverClientId,
              clientSecret: naverClientSecret
            }, [trimmedKeyword], { includeDocumentCount: false });

            if (baseVolumeData && baseVolumeData.length > 0 && baseVolumeData[0]) {
              const pc = baseVolumeData[0].pcSearchVolume ?? null;
              const mobile = baseVolumeData[0].mobileSearchVolume ?? null;
              const total = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
              allKeywords.push({
                keyword: trimmedKeyword,
                pcSearchVolume: pc,
                mobileSearchVolume: mobile,
                searchVolume: total,
                type: 'original'
              });
              sendProgress('original', 2, 5, `✅ 입력 키워드 검색량: ${typeof total === 'number' ? total.toLocaleString() : 'null'}`);
            } else {
              allKeywords.push({
                keyword: trimmedKeyword,
                pcSearchVolume: null,
                mobileSearchVolume: null,
                searchVolume: null,
                type: 'original'
              });
            }
          } else {
            allKeywords.push({
              keyword: trimmedKeyword,
              pcSearchVolume: null,
              mobileSearchVolume: null,
              searchVolume: null,
              type: 'original'
            });
          }
        } catch (error) {
          console.warn(`[KEYWORD-EXPANSIONS] 입력 키워드 검색량 조회 실패:`, error);
          allKeywords.push({
            keyword: trimmedKeyword,
            pcSearchVolume: null,
            mobileSearchVolume: null,
            searchVolume: null,
            type: 'original'
          });
        }

        // 2. 확장 키워드 수집 (자동완성) - 🔥 무제한 모드에서 대량 수집
        sendProgress('autocomplete', 3, 5, '🔄 자동완성 키워드 수집 중...');
        try {
          console.log(`[KEYWORD-EXPANSIONS] 자동완성 키워드 수집 중... (무제한: ${isUnlimited})`);

          // 🔥 검색의도 명확한 키워드만 필터링 (쓰레기 키워드 완벽 제거)
          const uniqueAutocomplete = new Set<string>();

          // 1. 기본 자동완성
          const autocompleteKeywords = await getNaverAutocompleteKeywords(trimmedKeyword, {
            clientId: naverClientId,
            clientSecret: naverClientSecret
          });

          autocompleteKeywords.forEach(kw => {
            const trimmed = kw.trim();
            if (isValidSearchKeyword(trimmed) && !uniqueAutocomplete.has(trimmed)) {
              uniqueAutocomplete.add(trimmed);
            }
          });

          // v2.43.11: 시맨틱 sibling 통합 — 시드와 같은 카테고리의 다른 키워드 (예: 나이키 → 아디다스/뉴발란스)
          // 헤드 명사 sibling (마인드맵에서 검증된 로직)
          try {
            const { getSemanticSiblings } = await import('../../utils/keyword-mindmap');
            const siblings = await getSemanticSiblings(trimmedKeyword, naverClientId, naverClientSecret);
            let siblingAdded = 0;
            for (const sib of siblings) {
              const trimmedSib = sib.trim();
              if (isValidSearchKeyword(trimmedSib) && !uniqueAutocomplete.has(trimmedSib)) {
                uniqueAutocomplete.add(trimmedSib);
                siblingAdded++;
              }
            }
            console.log(`[KEYWORD-EXPANSIONS] 시맨틱 sibling: ${siblings.length}건 발견, ${siblingAdded}건 추가`);
            sendProgress('autocomplete', 4, 5, `🌱 시맨틱 형제 키워드 ${siblingAdded}개 추가`);
          } catch (e: any) {
            console.warn('[KEYWORD-EXPANSIONS] 시맨틱 sibling 실패:', e?.message);
          }

          // v2.43.11: 첫 토큰 swap sibling — 첫 단어를 바꾼 형제 키워드 (예: "나이키 운동화" → "아디다스 운동화")
          // 시드 토큰이 2개 이상일 때만 의미 있음
          const seedTokens = trimmedKeyword.split(/\s+/).filter(Boolean);
          if (seedTokens.length >= 2 && hasNaverApiKeys) {
            try {
              const firstToken = seedTokens[0];
              const rest = seedTokens.slice(1).join(' ');
              // 첫 토큰만으로 자동완성 → 다른 첫 토큰 후보 발굴
              const firstTokenAuto = await getNaverAutocompleteKeywords(firstToken, {
                clientId: naverClientId,
                clientSecret: naverClientSecret
              });
              // 첫 토큰 단독 키워드 (단어 1개)에서 다른 브랜드/카테고리 추출
              const altFirstTokens = new Set<string>();
              for (const kw of firstTokenAuto) {
                const tk = kw.trim().split(/\s+/).filter(Boolean);
                if (tk.length === 1 && tk[0].length >= 2 && tk[0].length <= 10 && tk[0] !== firstToken) {
                  altFirstTokens.add(tk[0]);
                }
              }
              // 다른 첫 토큰 + 시드 나머지 → sibling 조합
              let swapAdded = 0;
              for (const alt of Array.from(altFirstTokens).slice(0, 30)) {
                const swapped = `${alt} ${rest}`.trim();
                if (isValidSearchKeyword(swapped) && !uniqueAutocomplete.has(swapped)) {
                  uniqueAutocomplete.add(swapped);
                  swapAdded++;
                }
              }
              if (swapAdded > 0) {
                console.log(`[KEYWORD-EXPANSIONS] 첫 토큰 swap sibling: ${swapAdded}건 추가 (${firstToken} → ${altFirstTokens.size}개 후보)`);
              }
            } catch (e: any) {
              console.warn('[KEYWORD-EXPANSIONS] 첫 토큰 swap 실패:', e?.message);
            }
          }

          // 🔥🔥 무제한/대량 모드: 자모 조합으로 대량 자동완성 수집 🔥🔥
          if (isUnlimited || targetCount > 200) {
            console.log(`[KEYWORD-EXPANSIONS] 🔥 무제한 모드 - 자모 조합 자동완성 수집 시작`);

            // 한글 자모 + 알파벳 조합
            const jamos = [
              'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
              ' 가', ' 나', ' 다', ' 라', ' 마', ' 바', ' 사', ' 아', ' 자', ' 차', ' 카', ' 타', ' 파', ' 하',
              ' 간', ' 값', ' 같', ' 강', ' 갈', ' 갑', ' 감',
              ' 주', ' 전', ' 정', ' 조', ' 지', ' 진', ' 질',
              ' 비', ' 분', ' 불', ' 봉', ' 보', ' 본', ' 복',
              ' 추', ' 취', ' 채', ' 초', ' 출', ' 충',
              ' 후', ' 합', ' 할', ' 행', ' 혜', ' 환', ' 회',
              ' 신', ' 실', ' 시', ' 사', ' 상', ' 서', ' 성',
              ' 연', ' 예', ' 영', ' 원', ' 요', ' 유', ' 의',
              ' 이', ' 인', ' 일', ' 입', ' 있', ' 임'
            ];

            let jamoCount = 0;
            for (const jamo of jamos) {
              try {
                const extKeyword = trimmedKeyword + jamo;
                const extAuto = await getNaverAutocompleteKeywords(extKeyword, {
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                });

                extAuto.forEach(kw => {
                  const trimmed = kw.trim();
                  if (isValidSearchKeyword(trimmed) && !uniqueAutocomplete.has(trimmed)) {
                    uniqueAutocomplete.add(trimmed);
                    jamoCount++;
                  }
                });

                // 진행률 업데이트
                if (jamoCount % 20 === 0) {
                  sendProgress('autocomplete', jamoCount, jamos.length * 10, `🔄 자동완성 수집 중... ${uniqueAutocomplete.size}개`);
                }

                await new Promise(resolve => setTimeout(resolve, 30)); // Rate limit
              } catch (e) {
                // 개별 실패 무시
              }
            }

            console.log(`[KEYWORD-EXPANSIONS] 자모 조합으로 ${jamoCount}개 추가 수집`);
          }

          console.log(`[KEYWORD-EXPANSIONS] 총 자동완성 키워드: ${uniqueAutocomplete.size}개`);

          // 목표 개수까지 스마트블록(자동완성) 기반으로만 추가 확장
          const desiredAutocompleteCount = isUnlimited
            ? Math.min(9000, Math.max(5000, targetCount * 4))
            : Math.min(5000, Math.max(250, targetCount * 3));

          if (uniqueAutocomplete.size < desiredAutocompleteCount) {
            const seedQueue: string[] = [trimmedKeyword, ...Array.from(uniqueAutocomplete).slice(0, 60)];
            const visitedSeeds = new Set<string>();
            const maxSeedCalls = isUnlimited ? 120 : (targetCount > 200 ? 120 : 50);

            let calls = 0;
            for (const seed of seedQueue) {
              if (uniqueAutocomplete.size >= desiredAutocompleteCount) break;
              if (calls >= maxSeedCalls) break;

              const s = String(seed || '').replace(/\s+/g, ' ').trim();
              const seedKey = s.toLowerCase();
              if (!s || visitedSeeds.has(seedKey)) continue;
              visitedSeeds.add(seedKey);

              try {
                const ext = await getNaverAutocompleteKeywords(s, {
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                });

                for (const raw of (ext || [])) {
                  const t = String(raw || '').replace(/\s+/g, ' ').trim();
                  if (!t) continue;
                  if (!isValidSearchKeyword(t)) continue;
                  if (!uniqueAutocomplete.has(t)) uniqueAutocomplete.add(t);
                  if (uniqueAutocomplete.size >= desiredAutocompleteCount) break;
                }
              } catch {
                // ignore
              }

              calls += 1;
              if (calls % 10 === 0) {
                sendProgress('autocomplete', uniqueAutocomplete.size, desiredAutocompleteCount, `🔄 자동완성 확장 중... ${uniqueAutocomplete.size}개`);
              }

              await new Promise(resolve => setTimeout(resolve, 25));
            }
          }

          // 검색량 조회 및 추가
          const autocompleteArray = Array.from(uniqueAutocomplete).slice(0, isUnlimited ? 9000 : Math.min(desiredAutocompleteCount, Math.max(120, targetCount)));
          for (let i = 0; i < autocompleteArray.length; i += 5) {
            if (!isUnlimited && allKeywords.length >= targetCount) break;
            const batch = autocompleteArray.slice(i, i + 5);
            const capacity = isUnlimited ? Infinity : Math.max(0, targetCount - allKeywords.length);
            const effectiveBatch = isUnlimited ? batch : batch.slice(0, capacity);
            if (effectiveBatch.length === 0) break;

            if (shouldComputeMetrics) {
              let volumeData: any[] | null = null;
              try {
                volumeData = await getNaverKeywordSearchVolumeSeparate({
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                }, effectiveBatch, { includeDocumentCount: false });
              } catch {
                volumeData = null;
              }

              for (let j = 0; j < effectiveBatch.length; j++) {
                const kw = effectiveBatch[j];
                const row = volumeData && volumeData[j] ? volumeData[j] : null;
                const pcVol = row?.pcSearchVolume ?? null;
                const mobileVol = row?.mobileSearchVolume ?? null;
                const totalVol: number | null = (pcVol !== null || mobileVol !== null)
                  ? ((pcVol ?? 0) + (mobileVol ?? 0))
                  : null;

                allKeywords.push({
                  keyword: kw,
                  pcSearchVolume: pcVol,
                  mobileSearchVolume: mobileVol,
                  searchVolume: totalVol,
                  type: 'suggested'
                });
              }
            } else {
              allKeywords.push(...effectiveBatch.map(kw => ({
                keyword: kw,
                pcSearchVolume: null,
                mobileSearchVolume: null,
                searchVolume: null,
                type: 'suggested' as const
              })));
            }
          }

          console.log(`[KEYWORD-EXPANSIONS] 자동완성 키워드 ${autocompleteArray.length}개 수집 완료`);
          sendProgress('autocomplete', 3, 5, `✅ 자동완성 키워드 ${autocompleteArray.length}개 수집 완료`);
        } catch (error) {
          console.warn(`[KEYWORD-EXPANSIONS] 자동완성 키워드 수집 실패:`, error);
        }

        // 3. 🔥🔥 v12.1: 카테고리 기반 무한 확장 - 같은 카테고리 키워드 모두 추출!
        // 예: 쿠팡 → 지마켓, 11번가, 옥션, 위메프, 티몬 등 같은 카테고리 키워드 전부!
        sendProgress('related', 4, 5, '🔗 카테고리 관련 키워드 수집 중...');

        // 🔥 카테고리 키워드 저장 (나중에 각각 확장에 사용)
        const categoryKeywords: string[] = [];

        try {
          console.log(`[KEYWORD-EXPANSIONS] 🔥 v12.1 카테고리 기반 무한 확장 시작!`);

          if (!hasNaverApiKeys || smartBlockOnlyFill) {
            throw new Error('skip related keywords');
          }

          // 1단계: 네이버 연관 검색어에서 같은 카테고리 키워드 추출
          const relatedKeywords = await getNaverRelatedKeywords(trimmedKeyword, {
            clientId: naverClientId,
            clientSecret: naverClientSecret
          }, { limit: 50 }); // 더 많이 수집

          const uniqueRelated = new Set<string>();

          // 🔥 시드 키워드 미포함도 허용 (같은 카테고리 키워드 수집!)
          relatedKeywords.forEach(item => {
            const trimmed = item.keyword.trim();
            // 🔥 연관 단계에서도 동일한 엄격한 검색의도 필터 적용 (일반 단독단어 유입 방지)
            if (isValidSearchKeyword(trimmed) &&
              trimmed.length <= 30 &&
              !uniqueRelated.has(trimmed) &&
              trimmed.toLowerCase() !== trimmedKeyword.toLowerCase()) {
              uniqueRelated.add(trimmed);
              categoryKeywords.push(trimmed); // 카테고리 키워드로 저장
            }
          });

          console.log(`[KEYWORD-EXPANSIONS] 🎯 카테고리 관련 키워드 ${categoryKeywords.length}개 발견`);

          // 2단계: 네이버 블로그 검색에서 추가 카테고리 키워드 추출
          try {
            const blogSearchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(trimmedKeyword)}&display=100&sort=sim`;
            const blogRes = await fetch(blogSearchUrl, {
              headers: {
                'X-Naver-Client-Id': naverClientId,
                'X-Naver-Client-Secret': naverClientSecret
              }
            });

            if (blogRes.ok) {
              const blogData = await blogRes.json() as { items?: Array<{ title: string; description: string }> };
              const items = blogData.items || [];

              // 블로그 제목에서 같은 카테고리 키워드 추출 (vs, 비교 패턴)
              items.forEach((item: any) => {
                const title = (item.title || '').replace(/<[^>]*>/g, '').trim();

                // "A vs B", "A 비교 B", "A or B" 패턴에서 B 추출
                const vsMatch = title.match(/(.+?)\s*(?:vs|VS|비교|or|OR|와|과|,)\s*(.+?)(?:\s|$|비교|추천|순위)/);
                if (vsMatch) {
                  const competitor = vsMatch[2].trim().split(/\s/)[0];
                  if (competitor.length >= 2 &&
                    competitor.length <= 20 &&
                    /^[가-힣a-zA-Z0-9]+$/.test(competitor) &&
                    !uniqueRelated.has(competitor) &&
                    competitor.toLowerCase() !== trimmedKeyword.toLowerCase()) {
                    uniqueRelated.add(competitor);
                    categoryKeywords.push(competitor);
                  }
                }
              });
            }
          } catch (e) {
            console.warn(`[KEYWORD-EXPANSIONS] 블로그 검색 카테고리 추출 실패:`, e);
          }

          console.log(`[KEYWORD-EXPANSIONS] 🎯 총 카테고리 키워드: ${categoryKeywords.length}개`);

          // 3단계: 카테고리 키워드들의 검색량 조회 (실제 데이터만!)
          const validCategoryKeywords: string[] = [];

          for (const kw of Array.from(uniqueRelated).slice(0, 100)) {
            if (!isUnlimited && allKeywords.length >= targetCount) break;

            try {
              const volumeData = await getNaverKeywordSearchVolumeSeparate({
                clientId: naverClientId,
                clientSecret: naverClientSecret
              }, [kw], { includeDocumentCount: false });

              if (volumeData && volumeData.length > 0 && volumeData[0]) {
                const pcVol = volumeData[0].pcSearchVolume ?? null;
                const mobileVol = volumeData[0].mobileSearchVolume ?? null;
                const totalVol: number | null = (pcVol !== null || mobileVol !== null)
                  ? ((pcVol ?? 0) + (mobileVol ?? 0))
                  : null;

                // 🔥 검색량 10 이상만 추가!
                if (totalVol !== null && totalVol >= 10) {
                  allKeywords.push({
                    keyword: kw,
                    pcSearchVolume: pcVol,
                    mobileSearchVolume: mobileVol,
                    searchVolume: totalVol,
                    type: 'related'
                  });
                  validCategoryKeywords.push(kw); // 유효한 카테고리 키워드
                }
              }
            } catch (error) {
              console.warn(`[KEYWORD-EXPANSIONS] "${kw}" 검색량 조회 실패:`, error);
            }

            await new Promise(resolve => setTimeout(resolve, 50));
          }

          console.log(`[KEYWORD-EXPANSIONS] ✅ 유효한 카테고리 키워드 ${validCategoryKeywords.length}개 (검색량 10+)`);
          sendProgress('related', 4, 5, `✅ 카테고리 키워드 ${validCategoryKeywords.length}개 수집 완료`);

          // 🔥🔥 4단계: 각 카테고리 키워드로 자동완성 확장! (무한 확장 핵심!)
          if (isUnlimited && validCategoryKeywords.length > 0) {
            console.log(`[KEYWORD-EXPANSIONS] 🚀 카테고리 키워드별 자동완성 확장 시작!`);
            sendProgress('category-expand', 0, validCategoryKeywords.length, `🚀 카테고리별 확장 시작...`);

            let categoryExpandCount = 0;
            const existingKws = new Set(allKeywords.map(k => k.keyword));

            for (let i = 0; i < validCategoryKeywords.length; i++) {
              const catKw = validCategoryKeywords[i];
              if (allKeywords.length >= targetCount) break;

              try {
                // 카테고리 키워드로 자동완성 수집
                const catAuto = await getNaverAutocompleteKeywords(catKw, {
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                });

                for (const kw of catAuto) {
                  const trimmed = kw.trim();
                  if (trimmed.length >= 3 &&
                    trimmed.length <= 40 &&
                    /^[가-힣a-zA-Z0-9\s]+$/.test(trimmed) &&
                    !existingKws.has(trimmed)) {

                    // 검색량 조회
                    try {
                      const volData = await getNaverKeywordSearchVolumeSeparate({
                        clientId: naverClientId,
                        clientSecret: naverClientSecret
                      }, [trimmed], { includeDocumentCount: false });

                      if (volData?.[0]) {
                        const pcVol = volData[0].pcSearchVolume ?? null;
                        const mobileVol = volData[0].mobileSearchVolume ?? null;
                        const totalVol: number | null = (pcVol !== null || mobileVol !== null)
                          ? ((pcVol ?? 0) + (mobileVol ?? 0))
                          : null;

                        // 🔥 검색량 10 이상만 추가!
                        if (totalVol !== null && totalVol >= 10) {
                          allKeywords.push({
                            keyword: trimmed,
                            pcSearchVolume: pcVol,
                            mobileSearchVolume: mobileVol,
                            searchVolume: totalVol,
                            type: 'expansion'
                          });
                          existingKws.add(trimmed);
                          categoryExpandCount++;
                        }
                      }
                    } catch (e) {
                      // 개별 실패 무시
                    }

                    if (allKeywords.length >= targetCount) break;
                  }
                }

                // 진행률 업데이트
                if (i % 5 === 0) {
                  sendProgress('category-expand', i + 1, validCategoryKeywords.length,
                    `🚀 "${catKw}" 확장 중... (총 ${allKeywords.length}개)`);
                }

                await new Promise(resolve => setTimeout(resolve, 30));
              } catch (e) {
                console.warn(`[KEYWORD-EXPANSIONS] "${catKw}" 확장 실패:`, e);
              }
            }

            console.log(`[KEYWORD-EXPANSIONS] ✅ 카테고리별 확장 완료: +${categoryExpandCount}개`);
          }

        } catch (error) {
          console.warn(`[KEYWORD-EXPANSIONS] 카테고리 키워드 수집 실패:`, error);
        }

        // ★ v2.49.1: Brand 확장 — "게이밍 노트북 추천" 같은 카테고리 키워드 → 제품(브랜드 prefix) 변형
        //   1차: BRAND_FAMILIES 사전 매칭. 매칭 시 카테고리 브랜드 prefix 키워드 생성.
        //   2차(fallback): 사전 매칭 0건 또는 brandExpanded < 5 면 입력 키워드 자동완성에서
        //                  영문/숫자 토큰 추출 → 동적 brand candidate 활용.
        sendProgress('related', 5, 5, '🛍️ 브랜드/제품 확장 키워드 수집 중...');
        try {
          const { expandWithBrands, detectCategoryFamily } = await import('../../utils/brand-families');
          const detected = detectCategoryFamily(trimmedKeyword);
          let brandExpanded: string[] = [];

          if (detected) {
            console.log(`[KEYWORD-EXPANSIONS] 카테고리 매칭: ${detected.family} (token="${detected.token}")`);
            brandExpanded = expandWithBrands(trimmedKeyword, 10);
          }

          // Fallback: 사전 매칭 부족 시 자동완성에서 영문/숫자 토큰 추출
          if (brandExpanded.length < 5 && hasNaverApiKeys) {
            try {
              const autoForBrands = await getNaverAutocompleteKeywords(trimmedKeyword, {
                clientId: naverClientId,
                clientSecret: naverClientSecret,
              });
              const dynamicBrandTokens = new Set<string>();
              for (const ac of (autoForBrands || []).slice(0, 30)) {
                // 토큰 분리 + 영문 또는 영문+숫자 조합 토큰만 (모델명/브랜드 의심)
                const tokens = ac.split(/\s+/).filter(t => /^[A-Za-z][A-Za-z0-9]+$/.test(t) && t.length >= 2 && t.length <= 12);
                tokens.forEach(t => dynamicBrandTokens.add(t));
              }
              // 동적 토큰을 prefix 로 한 확장
              for (const brand of Array.from(dynamicBrandTokens).slice(0, 8)) {
                brandExpanded.push(`${brand} ${trimmedKeyword}`);
              }
              if (dynamicBrandTokens.size > 0) {
                console.log(`[KEYWORD-EXPANSIONS] 자동완성 동적 brand fallback: ${Array.from(dynamicBrandTokens).slice(0, 8).join(', ')}`);
              }
            } catch (autoErr: any) {
              console.warn(`[KEYWORD-EXPANSIONS] 자동완성 brand fallback 실패:`, autoErr?.message);
            }
          }

          let brandAddedCount = 0;
          const existingSet = new Set(allKeywords.map(k => k.keyword));
          for (const bk of brandExpanded) {
            const cleaned = bk.trim();
            if (!cleaned || existingSet.has(cleaned)) continue;
            if (!isValidSearchKeyword(cleaned)) continue;
            allKeywords.push({ keyword: cleaned, type: 'expansion' });
            existingSet.add(cleaned);
            brandAddedCount++;
          }
          if (brandAddedCount > 0) {
            console.log(`[KEYWORD-EXPANSIONS] ✅ 브랜드 확장 +${brandAddedCount}개`);
          }
        } catch (brandErr) {
          console.warn(`[KEYWORD-EXPANSIONS] 브랜드 확장 실패:`, brandErr);
        }

        // 4. 네이버 검색 결과에서 실제 검색 패턴 추출 (블로그 제목이 아닌 키워드)
        sendProgress('patterns', 5, 5, '🎯 검색 패턴 추출 중...');
        try {
          console.log(`[KEYWORD-EXPANSIONS] 검색 패턴 추출 중...`);

          if (!hasNaverApiKeys || smartBlockOnlyFill) {
            throw new Error('skip patterns');
          }
          const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';
          const headers = {
            'X-Naver-Client-Id': naverClientId,
            'X-Naver-Client-Secret': naverClientSecret
          };

          const params = new URLSearchParams({
            query: trimmedKeyword,
            display: '100',
            sort: 'sim'
          });

          const response = await fetch(`${apiUrl}?${params}`, {
            method: 'GET',
            headers: headers
          });

          if (response.ok) {
            const data = await response.json();
            const items = data.items || [];

            const suggestedKeywords = new Set<string>();

            items.forEach((item: any) => {
              const title = (item.title || '').replace(/<[^>]*>/g, '').trim();

              // 제목에서 입력 키워드를 포함하는 짧은 구문 추출 (실제 검색 키워드 패턴)
              if (title.includes(trimmedKeyword)) {
                // 제목을 단어 단위로 분리
                const titleWords = title.split(/[\s|,，、·\[\]()【】「」<>]+/).filter((w: string) => w.trim().length > 0);

                // 입력 키워드 위치 찾기
                const keywordIndex = titleWords.findIndex((w: string) => w.includes(trimmedKeyword));

                if (keywordIndex >= 0) {
                  // 키워드 앞뒤로 최대 2개 단어씩 조합하여 검색 키워드 추출
                  for (let before = 0; before <= 2; before++) {
                    for (let after = 0; after <= 2; after++) {
                      if (before === 0 && after === 0) continue; // 입력 키워드 자체는 제외

                      const startIdx = Math.max(0, keywordIndex - before);
                      const endIdx = Math.min(titleWords.length, keywordIndex + after + 1);
                      const phraseWords = titleWords.slice(startIdx, endIdx);

                      if (phraseWords.length >= 2 && phraseWords.length <= 6) {
                        const phrase = phraseWords.join(' ').trim();

                        // 🔥 동일한 엄격한 필터 적용
                        if (isValidSearchKeyword(phrase) &&
                          !suggestedKeywords.has(phrase) &&
                          !allKeywords.some(k => k.keyword === phrase)) {
                          suggestedKeywords.add(phrase);
                        }
                      }
                    }
                  }
                }
              }
            });

            // 검색량 조회 및 추가
            const suggestedArray = Array.from(suggestedKeywords).slice(0, isUnlimited ? 100 : Math.min(30, targetCount));
            for (let i = 0; i < suggestedArray.length; i += 5) {
              if (!isUnlimited && allKeywords.length >= targetCount) break;
              const batch = suggestedArray.slice(i, i + 5);
              const capacity = isUnlimited ? Infinity : Math.max(0, targetCount - allKeywords.length);
              const effectiveBatch = isUnlimited ? batch : batch.slice(0, capacity);
              if (effectiveBatch.length === 0) break;

              if (shouldComputeMetrics) {
                let volumeData: any[] | null = null;
                try {
                  volumeData = await getNaverKeywordSearchVolumeSeparate({
                    clientId: naverClientId,
                    clientSecret: naverClientSecret
                  }, effectiveBatch, { includeDocumentCount: false });
                } catch {
                  volumeData = null;
                }

                for (let j = 0; j < effectiveBatch.length; j++) {
                  const kw = effectiveBatch[j];
                  const row = volumeData && volumeData[j] ? volumeData[j] : null;
                  const pcVol = row?.pcSearchVolume ?? null;
                  const mobileVol = row?.mobileSearchVolume ?? null;
                  const totalVol: number | null = (pcVol !== null || mobileVol !== null)
                    ? ((pcVol ?? 0) + (mobileVol ?? 0))
                    : null;

                  allKeywords.push({
                    keyword: kw,
                    pcSearchVolume: pcVol,
                    mobileSearchVolume: mobileVol,
                    searchVolume: totalVol,
                    type: 'suggested'
                  });
                }
              } else {
                allKeywords.push(...effectiveBatch.map(kw => ({
                  keyword: kw,
                  pcSearchVolume: null,
                  mobileSearchVolume: null,
                  searchVolume: null,
                  type: 'suggested' as const
                })));
              }
            }

            console.log(`[KEYWORD-EXPANSIONS] 검색 패턴 ${suggestedArray.length}개 추출 완료`);
          }
        } catch (error) {
          console.warn(`[KEYWORD-EXPANSIONS] 검색 패턴 추출 실패:`, error);
        }

        // 5. 🔥🔥🔥 v12.0 무제한 키워드 확장 (2차/3차 재귀 + 병렬 처리) 🔥🔥🔥
        const needsMore = isUnlimited || allKeywords.length < targetCount;
        if (needsMore) {
          const targetMsg = isUnlimited ? '무제한 추출 (최대 10,000개)' : `${targetCount}개까지 보충`;
          sendProgress('additional', 0, 100, `⚡ ${targetMsg} 중...`);
          console.log(`[KEYWORD-EXPANSIONS] 🚀 v12.0 무제한 확장 시작! 현재 ${allKeywords.length}개, ${targetMsg}`);

          const existingKeywords = new Set(allKeywords.map(k => k.keyword));
          const additionalKeywords: string[] = [];

          // 🔥 v12.0: 확장된 자모 + 접미사 (200개 패턴!)
          const suffixes = [
            // 한글 자모 (14개)
            'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
            // 가나다 (14개)
            ' 가', ' 나', ' 다', ' 라', ' 마', ' 바', ' 사', ' 아', ' 자', ' 차', ' 카', ' 타', ' 파', ' 하',
            // 검색의도 접미사 (60개+)
            ' 가격', ' 비용', ' 추천', ' 후기', ' 리뷰', ' 비교', ' 순위', ' 정보', ' 전망', ' 분석',
            ' 장점', ' 단점', ' 방법', ' 종류', ' 차이', ' 신청', ' 조건', ' 기간', ' 출시일',
            ' 채용', ' 연봉', ' 복지', ' 입사', ' 주가', ' 배당', ' 실적', ' 뉴스',
            ' 효과', ' 부작용', ' 성분', ' 원리', ' 사용법', ' 먹는법', ' 복용법',
            ' 위치', ' 주소', ' 전화번호', ' 영업시간', ' 예약', ' 가는길',
            ' 맛집', ' 카페', ' 호텔', ' 숙소', ' 펜션', ' 관광지',
            ' 꿀팁', ' 노하우', ' 핵심', ' 요약', ' 총정리', ' 완벽정리',
            ' 초보', ' 입문', ' 기초', ' 고급', ' 전문', ' 마스터',
            ' 2024', ' 2025', ' 최신', ' 신규', ' 업데이트',
            // 알파벳 (26개)
            ' a', ' b', ' c', ' d', ' e', ' f', ' g', ' h', ' i', ' j', ' k', ' l', ' m',
            ' n', ' o', ' p', ' q', ' r', ' s', ' t', ' u', ' v', ' w', ' x', ' y', ' z'
          ];

          // 🔥 v12.0: 무제한 시 최대 10,000개까지 수집!
          const maxAdditional = isUnlimited ? 10000 : targetCount;

          // 🔥🔥 병렬 처리 함수 (5개씩 동시 호출)
          // v2.44.1: 저사양 모드면 더 적게
          const batchSize = (() => {
            try {
              const { EnvironmentManager } = require('../../utils/environment-manager');
              return Math.min(EnvironmentManager.getInstance().getEffectiveMaxConcurrent(), 5);
            } catch { return 5; }
          })();
          const processInBatches = async (items: string[], processFn: (item: string) => Promise<string[]>) => {
            const results: string[] = [];
            for (let i = 0; i < items.length; i += batchSize) {
              if (additionalKeywords.length >= maxAdditional) break;

              const batch = items.slice(i, i + batchSize);
              const batchResults = await Promise.all(batch.map(processFn));
              batchResults.forEach(r => results.push(...r));

              // 진행률 업데이트
              if (i % 20 === 0) {
                sendProgress('additional', additionalKeywords.length, maxAdditional,
                  `⚡ ${allKeywords.length + additionalKeywords.length}개 수집 중... (${Math.round(i / items.length * 100)}%)`);
              }
            }
            return results;
          };

          for (const suffix of suffixes) {
            // 무제한이 아니면 목표 도달 시 중단
            if (!isUnlimited && allKeywords.length + additionalKeywords.length >= targetCount) break;
            // 무제한이어도 최대치 도달 시 중단
            if (isUnlimited && additionalKeywords.length >= maxAdditional) break;

            try {
              const extendedKeyword = trimmedKeyword + suffix;
              const extAutoComplete = await getNaverAutocompleteKeywords(extendedKeyword, {
                clientId: naverClientId,
                clientSecret: naverClientSecret
              });

              for (const kw of extAutoComplete) {
                const trimmed = kw.trim();
                // 🔥 동일한 엄격한 필터 적용
                if (isValidSearchKeyword(trimmed) &&
                  !existingKeywords.has(trimmed) &&
                  !additionalKeywords.includes(trimmed)) {
                  additionalKeywords.push(trimmed);
                  existingKeywords.add(trimmed);

                  // 진행률 업데이트 (무제한일 때)
                  if (isUnlimited && additionalKeywords.length % 50 === 0) {
                    sendProgress('additional', additionalKeywords.length, maxAdditional, `⚡ ${allKeywords.length + additionalKeywords.length}개 키워드 수집 중...`);
                  }

                  if (!isUnlimited && allKeywords.length + additionalKeywords.length >= targetCount) break;
                  if (isUnlimited && additionalKeywords.length >= maxAdditional) break;
                }
              }

              await new Promise(resolve => setTimeout(resolve, 50));
            } catch (e) {
              console.warn(`[KEYWORD-EXPANSIONS] 추가 자동완성 실패 (${suffix}):`, e);
            }
          }

          console.log(`[KEYWORD-EXPANSIONS] 📝 1차 확장 키워드: ${additionalKeywords.length}개`);

          // 🔥🔥 v12.0: 2차 확장 - 수집된 키워드로 다시 자동완성 수집!
          if (isUnlimited && additionalKeywords.length < maxAdditional) {
            console.log(`[KEYWORD-EXPANSIONS] 🔄 2차 확장 시작...`);
            sendProgress('additional', additionalKeywords.length, maxAdditional, `🔄 2차 확장 시작... (${additionalKeywords.length}개)`);

            // 1차에서 수집된 상위 50개 키워드로 2차 확장
            const topKeywordsFor2nd = additionalKeywords.slice(0, 50);
            let secondaryCount = 0;

            for (const baseKw of topKeywordsFor2nd) {
              if (additionalKeywords.length >= maxAdditional) break;

              try {
                // 2차 키워드로 자동완성 수집
                const secondAuto = await getNaverAutocompleteKeywords(baseKw, {
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                });

                for (const kw of secondAuto) {
                  const trimmed = kw.trim();
                  if (isValidSearchKeyword(trimmed) &&
                    !existingKeywords.has(trimmed) &&
                    !additionalKeywords.includes(trimmed)) {
                    additionalKeywords.push(trimmed);
                    existingKeywords.add(trimmed);
                    secondaryCount++;

                    if (additionalKeywords.length >= maxAdditional) break;
                  }
                }

                await new Promise(resolve => setTimeout(resolve, 30));
              } catch (e) {
                // 개별 실패 무시
              }
            }

            console.log(`[KEYWORD-EXPANSIONS] 🔄 2차 확장 완료: +${secondaryCount}개 (총 ${additionalKeywords.length}개)`);
          }

          // 🔥🔥 v12.0: 3차 확장 - 아직 부족하면 더 수집!
          if (isUnlimited && additionalKeywords.length < maxAdditional) {
            console.log(`[KEYWORD-EXPANSIONS] 🔄 3차 확장 시작...`);
            sendProgress('additional', additionalKeywords.length, maxAdditional, `🔄 3차 확장 시작... (${additionalKeywords.length}개)`);

            // 추가 접미사 조합
            const extraSuffixes = [
              ' 어떻게', ' 왜', ' 언제', ' 어디서', ' 누가', ' 무엇',
              ' 좋은', ' 나쁜', ' 싼', ' 비싼', ' 인기', ' 유명',
              ' 서울', ' 강남', ' 부산', ' 대구', ' 인천', ' 광주',
              ' 온라인', ' 오프라인', ' 무료', ' 유료', ' 저렴한', ' 프리미엄'
            ];

            let tertiaryCount = 0;
            for (const suffix of extraSuffixes) {
              if (additionalKeywords.length >= maxAdditional) break;

              try {
                const extKeyword = trimmedKeyword + suffix;
                const thirdAuto = await getNaverAutocompleteKeywords(extKeyword, {
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                });

                for (const kw of thirdAuto) {
                  const trimmed = kw.trim();
                  if (isValidSearchKeyword(trimmed) &&
                    !existingKeywords.has(trimmed) &&
                    !additionalKeywords.includes(trimmed)) {
                    additionalKeywords.push(trimmed);
                    existingKeywords.add(trimmed);
                    tertiaryCount++;

                    if (additionalKeywords.length >= maxAdditional) break;
                  }
                }

                await new Promise(resolve => setTimeout(resolve, 30));
              } catch (e) {
                // 개별 실패 무시
              }
            }

            console.log(`[KEYWORD-EXPANSIONS] 🔄 3차 확장 완료: +${tertiaryCount}개 (총 ${additionalKeywords.length}개)`);
          }

          console.log(`[KEYWORD-EXPANSIONS] 📝 총 확장 키워드: ${additionalKeywords.length}개`);
          sendProgress('additional', additionalKeywords.length, maxAdditional, `✅ ${additionalKeywords.length}개 키워드 수집 완료!`);

          if (shouldComputeMetrics) {
            console.log(`[KEYWORD-EXPANSIONS] 📊 검색량 조회 시작 (병렬 처리)...`);

            for (let i = 0; i < additionalKeywords.length; i += 5) {
              if (!isUnlimited && allKeywords.length >= targetCount) break;

              const batch = additionalKeywords.slice(i, i + 5);

              let volumeData: any[] | null = null;
              try {
                volumeData = await getNaverKeywordSearchVolumeSeparate({
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                }, batch, { includeDocumentCount: false });
              } catch {
                volumeData = null;
              }

              for (let j = 0; j < batch.length; j++) {
                const kw = batch[j];
                const row = volumeData && volumeData[j] ? volumeData[j] : null;
                const pcVol = row?.pcSearchVolume ?? null;
                const mobileVol = row?.mobileSearchVolume ?? null;
                const totalVol: number | null = (pcVol !== null || mobileVol !== null)
                  ? ((pcVol ?? 0) + (mobileVol ?? 0))
                  : null;

                allKeywords.push({
                  keyword: kw,
                  pcSearchVolume: pcVol,
                  mobileSearchVolume: mobileVol,
                  searchVolume: totalVol,
                  type: 'expansion' as const
                });
              }

              if (i % 50 === 0) {
                sendProgress('additional', i, additionalKeywords.length,
                  `📊 검색량 조회 중... (${allKeywords.length}개)`);
              }

              await new Promise(resolve => setTimeout(resolve, 50));
            }
          } else {
            allKeywords.push(...additionalKeywords.map(kw => ({
              keyword: kw,
              pcSearchVolume: null,
              mobileSearchVolume: null,
              searchVolume: null,
              type: 'expansion' as const
            })));
          }

          console.log(`[KEYWORD-EXPANSIONS] ✅ v12.0 무제한 확장 완료: ${allKeywords.length}개`);
        }

        // 6. 🔥 각 키워드의 문서수 조회 (네이버 블로그 검색 API) - 재시도 로직 포함
        if (shouldComputeMetrics) {
          console.log(`[KEYWORD-EXPANSIONS] 📊 문서수 조회 시작 (${allKeywords.length}개 키워드)...`);
        }

        // 전체 진행률 계산을 위한 가중치 설정
        // Step 1-5: 40%, Step 6 (문서수 조회): 60%
        const baseProgress = 40;
        const docCountProgressRange = 60;

        if (shouldComputeMetrics) {
          sendProgress('doccount', 0, allKeywords.length, `📊 문서수 조회 시작 (총 ${allKeywords.length}개)`);
        }

        const keywordsWithDocCount: Array<{
          keyword: string;
          pcSearchVolume?: number | null;
          mobileSearchVolume?: number | null;
          searchVolume?: number | null;
          documentCount?: number;
          goldenRatio?: number | null;
          type: 'original' | 'expansion' | 'related' | 'suggested';
        }> = [];

        // 🔥 API 키 확인 로그
        console.log(`[KEYWORD-EXPANSIONS] 🔑 API 키 확인:`);
        console.log(`  - Client ID: ${naverClientId ? naverClientId.substring(0, 10) + '...' : '❌ 없음'}`);
        console.log(`  - Client Secret: ${naverClientSecret ? naverClientSecret.substring(0, 4) + '...' : '❌ 없음'}`);

        if (!naverClientId || !naverClientSecret) {
          console.error(`[KEYWORD-EXPANSIONS] ❌ API 키가 없습니다! 환경설정에서 네이버 API 키를 확인하세요.`);
        }

        // 🔥 문서수 조회 전역 쓰로틀/백오프 상태 (모든 워커 공유)
        let docCountPauseUntil = 0;
        let docCountLastRequestAt = 0;

        // 🔥 문서수 조회 함수 (재시도 로직 포함 + 상세 로깅)
        const fetchDocumentCount = async (keyword: string, maxRetries = 3): Promise<number> => {
          const verboseDocLog = allKeywords.length <= 80;
          for (let retry = 0; retry < maxRetries; retry++) {
            try {
              // 🔥 글로벌 쓰로틀/백오프 (동시 워커 폭주 방지)
              // - min interval: 요청 간 최소 간격
              // - pauseUntil: 429 발생 시 전체 워커 잠깐 정지
              const minIntervalMs = allKeywords.length >= 400 ? 220 : 180;
              while (Date.now() < docCountPauseUntil) {
                await new Promise(resolve => setTimeout(resolve, 80));
              }

              const now = Date.now();
              const waitForInterval = (docCountLastRequestAt + minIntervalMs) - now;
              if (waitForInterval > 0) {
                await new Promise(resolve => setTimeout(resolve, waitForInterval));
              }
              docCountLastRequestAt = Date.now();

              const encodedKeyword = encodeURIComponent(keyword);
              const docCountUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodedKeyword}&display=1`;

              if (verboseDocLog) console.log(`[DOC-COUNT] 📡 API 호출 (${retry + 1}/${maxRetries}): "${keyword}"`);

              const docCountRes = await fetch(docCountUrl, {
                headers: {
                  'X-Naver-Client-Id': naverClientId,
                  'X-Naver-Client-Secret': naverClientSecret
                }
              });

              if (verboseDocLog) console.log(`[DOC-COUNT] 응답 상태: ${docCountRes.status} ${docCountRes.statusText}`);

              if (docCountRes.ok) {
                try {
                  const docData = (await docCountRes.json()) as { total?: number; lastBuildDate?: string; display?: number; start?: number };
                  if (verboseDocLog) console.log(`[DOC-COUNT] 파싱된 데이터: total=${docData.total}, display=${docData.display}, start=${docData.start}`);

                  const count = docData.total;

                  // total이 undefined가 아니고 숫자인 경우에만 반환
                  if (typeof count === 'number') {
                    if (verboseDocLog) console.log(`[DOC-COUNT] ✅ "${keyword}" 문서수: ${count.toLocaleString()}`);
                    return count;
                  } else {
                    console.warn(`[DOC-COUNT] ⚠️ total이 숫자가 아님: ${typeof count}, 값: ${count}`);
                  }
                } catch (parseError) {
                  console.error(`[DOC-COUNT] ❌ JSON 파싱 실패:`, parseError);
                }
              } else {
                console.warn(`[DOC-COUNT] ⚠️ API 응답 실패: ${docCountRes.status} ${docCountRes.statusText}`);
                try {
                  const errorText = await docCountRes.text();
                  if (verboseDocLog) console.warn(`[DOC-COUNT] 에러 내용: ${errorText}`);
                } catch {
                  // ignore
                }

                // 429 Too Many Requests인 경우 더 오래 대기
                if (docCountRes.status === 429) {
                  const retryAfterRaw = docCountRes.headers?.get?.('retry-after');
                  const retryAfterSec = retryAfterRaw ? parseInt(String(retryAfterRaw), 10) : NaN;
                  const base = Number.isFinite(retryAfterSec) ? (retryAfterSec * 1000) : (1500 * (retry + 1));
                  const jitter = Math.floor(Math.random() * 350);
                  const backoffMs = Math.min(10000, base + jitter);

                  // 전체 워커 일시 정지
                  docCountPauseUntil = Math.max(docCountPauseUntil, Date.now() + backoffMs);
                  if (verboseDocLog) console.log(`[DOC-COUNT] ⏳ Rate Limit! ${backoffMs}ms 대기...`);
                  await new Promise(resolve => setTimeout(resolve, backoffMs));
                }
              }
            } catch (error: any) {
              console.error(`[DOC-COUNT] ⚠️ "${keyword}" 문서수 조회 실패 (시도 ${retry + 1}/${maxRetries}):`, error?.message || error);
            }

            // 재시도 전 대기 (점점 증가)
            const waitTime = 300 * (retry + 1);
            if (verboseDocLog) console.log(`[DOC-COUNT] ⏳ ${waitTime}ms 대기 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }

          // 모든 재시도 실패 시 -1 반환 (0이 아닌 -1로 구분)
          // v2.43.3: 사유 누적 — 마지막 응답 코드 추적 (UI 진단용)
          (globalThis as any).__leword_doccount_lastStatus = (globalThis as any).__leword_doccount_lastStatus || { code: 'unknown', count: 0 };
          console.error(`[DOC-COUNT] ❌ "${keyword}" 문서수 조회 최종 실패`);
          return -1;
        };

        if (!shouldComputeMetrics) {
          for (let i = 0; i < allKeywords.length; i++) {
            const kw = allKeywords[i];
            keywordsWithDocCount.push({
              ...kw,
              documentCount: null,
              goldenRatio: null
            });
          }
        } else {
          const concurrency = allKeywords.length >= 400 ? 3 : 2;
          const progressEvery = allKeywords.length >= 400 ? 10 : 1;

          let nextIndex = 0;
          let doneCount = 0;
          const out: typeof keywordsWithDocCount = new Array(allKeywords.length);

          const worker = async () => {
            while (true) {
              const i = nextIndex++;
              if (i >= allKeywords.length) return;

              const kw = allKeywords[i];

              // 문서수 조회 (재시도 로직 포함)
              let documentCount = await fetchDocumentCount(kw.keyword);

              // v2.42.37: Bilateral Sanity Check — API undercount 시 scrape 재검증 (rich-feed-builder/getNaverKeywordSearchVolumeSeparate 와 동일 정책)
              //   "노사발전재단" 같은 API 70 vs 실제 16,681 케이스 → 재검색 결과 일치 보장
              const _svForCheck = typeof kw.searchVolume === 'number' ? kw.searchVolume : 0;
              if (documentCount > 0 && _svForCheck >= 500 && documentCount < 3000 && _svForCheck / documentCount > 50) {
                try {
                  const axiosMod = await import('axios');
                  const _url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw.keyword)}`;
                  const _resp = await axiosMod.default.get(_url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0.0.0' },
                    timeout: 2000,
                  });
                  const _html = String(_resp.data || '');
                  const _m = _html.match(/([0-9,]+)\s*건/);
                  if (_m && _m[1]) {
                    const _scraped = parseInt(_m[1].replace(/,/g, ''), 10);
                    if (Number.isFinite(_scraped) && _scraped > documentCount * 5) {
                      console.warn(`[DOC-COUNT] 🔧 API undercount "${kw.keyword}": API=${documentCount} → scrape=${_scraped} 채택`);
                      documentCount = _scraped;
                    }
                  }
                } catch { /* scrape 실패 시 API 값 유지 */ }
              }

              // 황금비율 계산 (검색량 / 문서수)
              const searchVol = typeof kw.searchVolume === 'number' ? kw.searchVolume : null;
              let goldenRatio: number | null = null;
              let finalDocCount = documentCount;

              // -1인 경우 (조회 실패) -1로 표시, 0인 경우는 실제 0
              if (documentCount === -1) {
                finalDocCount = -1; // UI에서 "조회실패"로 표시
                goldenRatio = -1;
              } else if (documentCount === 0) {
                goldenRatio = (searchVol !== null && searchVol > 0) ? Infinity : (searchVol === 0 ? 0 : null); // 문서 0개이면 무한대
              } else {
                goldenRatio = (searchVol !== null) ? (searchVol / documentCount) : null;
              }

              out[i] = {
                ...kw,
                documentCount: finalDocCount,
                goldenRatio
              };

              doneCount += 1;
              if (doneCount % progressEvery === 0 || doneCount === allKeywords.length) {
                sendProgress('doccount', doneCount, allKeywords.length, `📊 문서수 조회 중... (${doneCount}/${allKeywords.length})`);
              }

              // API 호출 분산 (과도한 burst 방지)
              await new Promise(resolve => setTimeout(resolve, 120));
            }
          };

          const workers = Array.from({ length: concurrency }, () => worker());
          await Promise.all(workers);
          keywordsWithDocCount.push(...out.filter(Boolean));
        }

        sendProgress('complete', allKeywords.length, allKeywords.length, `✅ 완료! 총 ${allKeywords.length}개 키워드 문서수 조회 완료`, 100);

        // 6. 검색량 기준으로 정렬 (입력 키워드는 항상 1번)
        const originalKeyword = keywordsWithDocCount.find(k => k.type === 'original');
        const otherKeywords = keywordsWithDocCount
          .filter(k => k.type !== 'original')
          .sort((a, b) => {
            const aVol = typeof a.searchVolume === 'number' ? a.searchVolume : null;
            const bVol = typeof b.searchVolume === 'number' ? b.searchVolume : null;
            if (bVol !== null && aVol === null) return 1;
            if (aVol !== null && bVol === null) return -1;
            if (aVol !== null && bVol !== null && bVol !== aVol) return bVol - aVol;
            return 0;
          }); // 검색량 높은 순

        const sortedKeywords = originalKeyword
          ? [originalKeyword, ...otherKeywords]
          : otherKeywords;

        console.log(`[KEYWORD-EXPANSIONS] ✅ 총 ${sortedKeywords.length}개 키워드 수집 완료 (문서수 포함)`);

        // 🔥 황금키워드 판단 기준 추가
        // 황금키워드 조건:
        // 1. 검색량 >= 100 (최소 검색량)
        // 2. 문서수 < 검색량 * 2 (경쟁이 적음)
        // 3. 황금비율 < 2.0 (좋은 비율)
        const isGoldenKeyword = (k: any) => {
          const searchVol = typeof k.searchVolume === 'number' ? k.searchVolume : null;
          const docCount = typeof k.documentCount === 'number' ? k.documentCount : null;
          const ratio = typeof k.goldenRatio === 'number' ? k.goldenRatio : null;

          if (searchVol === null || docCount === null || ratio === null) return false;
          if (searchVol < 100) return false;
          if (docCount <= 0) return docCount === 0 && searchVol > 0;
          if (!Number.isFinite(ratio) || ratio <= 0) return false;
          // 황금비율(searchVol/docCount)은 클수록 좋음: 검색량이 문서수보다 월등히 커야 함
          return ratio >= 5;
        };

        // v2.42.76: 무관 노이즈 키워드 차단 (네이버 자체 광고/UI 라벨/SEO 도구 용어)
        const isNoiseKeyword = (kw: string): boolean => {
          if (!kw) return true;
          const t = kw.trim();
          // 네이버 자체 광고/플랫폼명
          if (/^네이버\s*(프리미엄콘텐츠|광고|광고대행사|파워링크|검색광고|애드포스트|블로그|쇼핑|페이|밴드|카페|메일|뉴스|TV|지도|사전|증권|부동산|날씨|클립|시리즈|웹툰|오디오클립|모바일)/u.test(t)) return true;
          if (/^네이버\s*\S+\s*(가격|이용방법|등록|신청|로그인|아이디|회원가입)$/.test(t)) return true;
          // Naver UI 라벨 (검색 결과 페이지에서 잘못 긁힌 텍스트)
          if (/^(Keep에 저장|모두가 찜하고 싶은|더보기|이전|다음|관련검색|검색사이트|광고|배너|쇼핑|이미지|뉴스|블로그|카페|동영상|어학사전|지도|책)$/u.test(t)) return true;
          // 의미 없는 일반 명사 단독 (1~2자)
          if (t.length < 2) return true;
          // 광고/마케팅 도구명 (대표 SEO 도구)
          if (/^(블랙키위|키워드인사이트|황금키워드마스터|키워드도구)$/u.test(t)) return true;
          return false;
        };

        const filteredKeywords = sortedKeywords.filter(k => !isNoiseKeyword(k.keyword));
        console.log(`[KEYWORD-EXPANSIONS] 노이즈 필터: ${sortedKeywords.length} → ${filteredKeywords.length}건`);

        // v2.43.3: 진단 통계 — docCount 실패율 추적
        const docCountFailed = filteredKeywords.filter(k => k.documentCount === -1).length;
        const docCountTotal = filteredKeywords.length;
        const docCountFailureRate = docCountTotal > 0 ? docCountFailed / docCountTotal : 0;
        const allFailed = docCountFailureRate >= 0.9 && docCountTotal >= 3;
        if (allFailed) {
          console.error(`[KEYWORD-EXPANSIONS] ⚠️ docCount ${docCountFailed}/${docCountTotal}건 모두 실패 — 네이버 Blog Search API 인증/권한/IP차단 의심`);
        }

        return {
          success: true,
          keywords: filteredKeywords.map((k, idx) => ({
            rank: idx + 1,
            keyword: k.keyword,
            pcSearchVolume: typeof k.pcSearchVolume === 'number' ? k.pcSearchVolume : null,
            mobileSearchVolume: typeof k.mobileSearchVolume === 'number' ? k.mobileSearchVolume : null,
            searchVolume: typeof k.searchVolume === 'number' ? k.searchVolume : null,
            documentCount: typeof k.documentCount === 'number' ? k.documentCount : null,
            goldenRatio: typeof k.goldenRatio === 'number' ? k.goldenRatio : null,
            isGolden: isGoldenKeyword(k),
            type: k.type
          })),
          // v2.43.3 진단 정보
          diagnostics: {
            docCountFailed,
            docCountTotal,
            docCountFailureRate: Math.round(docCountFailureRate * 100),
            allFailed,
            warning: allFailed
              ? '⚠️ 네이버 Blog Search API 호출이 모두 실패했습니다. 가능한 원인: (1) Naver Open API 키가 "블로그 검색" 권한 미보유 (developers.naver.com → Application → 사용 API 추가), (2) 일일 호출 한도(25,000건) 초과, (3) IP 일시 차단. 권한 확인 후 다시 시도하세요.'
              : null,
          },
        };
      } catch (error: any) {
        console.error('[KEYWORD-EXPANSIONS] 오류:', error);
        return {
          success: false,
          error: error.message || '키워드 확장 조회 실패',
          keywords: []
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-keyword-expansions 핸들러 등록 완료');
  }

  // v2.42.77: 황금 키워드 자동 발굴 — 시맨틱 sibling 확장 + 황금비율 필터
  // "생각지도 못한 가치 키워드" 발굴: 헤드 명사 공유, modifier 다른 후보군에서 검색량/문서수 측정 후 황금비율 기준 정렬
  if (!ipcMain.listenerCount('discover-golden-keywords')) {
    ipcMain.handle('discover-golden-keywords', async (event, payload: { keyword: string; minRatio?: number; minSearchVolume?: number; maxDocCount?: number }) => {
      try {
        const seed = String(payload?.keyword || '').trim();
        if (!seed) return { success: false, error: '키워드를 입력하세요', keywords: [] };

        const license = await licenseManager.loadLicense();
        if (!license || !license.isValid) {
          return { success: false, error: '라이선스 미등록', requiresLicense: true, keywords: [] };
        }

        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
        if (!clientId || !clientSecret) {
          return { success: false, error: '⚠️ 네이버 Open API 키 필요 (환경설정 → 네이버 Open API Client ID/Secret 입력)', keywords: [] };
        }
        // v2.43.1: SearchAd API 키 별도 검증 — 검색량/문서수 측정에 필수
        const sa1 = env.naverSearchAdAccessLicense || '';
        const sa2 = env.naverSearchAdSecretKey || '';
        if (!sa1 || !sa2) {
          return {
            success: false,
            error: '⚠️ 네이버 SearchAd API 키가 필요합니다. 환경설정 → 검색광고 API → AccessLicense + SecretKey 입력 후 다시 시도하세요.\n\n발급: searchad.naver.com → 도구 → API 관리',
            keywords: [],
            missingKey: 'searchad',
          };
        }

        // 진행 알림
        const send = (type: string, msg: string, data: any = {}) => {
          try { event.sender.send('golden-discovery-progress', { type, message: msg, ...data }); } catch {}
        };

        send('start', `🔍 "${seed}" 시맨틱 sibling 확장 중...`);

        // 1) 마인드맵 sibling + 자동완성 통합으로 후보 풀 구성
        const { getSemanticSiblings } = await import('../../utils/keyword-mindmap');
        const { getNaverAutocompleteKeywords } = await import('../../utils/naver-autocomplete');

        const candidates = new Set<string>();
        candidates.add(seed);

        // sibling 확장 (헤드 명사 공유, modifier 다름)
        try {
          const siblings = await getSemanticSiblings(seed, clientId, clientSecret);
          siblings.forEach(s => candidates.add(s));
          send('progress', `🌱 시맨틱 sibling ${siblings.length}건 확장`);
        } catch (e: any) {
          send('progress', `⚠️ sibling 확장 일부 실패: ${e?.message}`);
        }

        // 자동완성도 함께 (시드 자체 확장)
        try {
          const autoExt = await getNaverAutocompleteKeywords(seed, { clientId, clientSecret });
          autoExt.forEach(a => candidates.add(a));
          send('progress', `🌱 자동완성 ${autoExt.length}건 확장`);
        } catch (e: any) {
          send('progress', `⚠️ 자동완성 실패: ${e?.message}`);
        }

        // 너무 길거나 짧은 키워드 제거 + 노이즈 제거
        const cleaned = Array.from(candidates).filter(k => {
          if (!k || k.length < 2 || k.length > 35) return false;
          if (/^네이버\s*(프리미엄콘텐츠|광고|광고대행사|파워링크|검색광고|애드포스트)/u.test(k)) return false;
          if (/^(Keep에 저장|모두가 찜하고 싶은|더보기|검색사이트)$/u.test(k)) return false;
          if (/^\d+$/.test(k.replace(/\s/g, ''))) return false;
          return true;
        });

        send('progress', `✨ 노이즈 필터 후 ${cleaned.length}개 후보`);

        if (cleaned.length === 0) {
          return { success: true, keywords: [], totalCandidates: 0 };
        }

        // 2) 후보별 검색량 + 문서수 측정 (배치)
        send('progress', `📊 ${cleaned.length}개 검색량/문서수 측정 중... (1~2분)`);
        const measured = await getNaverKeywordSearchVolumeSeparate(
          { clientId, clientSecret },
          cleaned,
          { includeDocumentCount: true }
        );

        // 3) 황금 비율 계산 + 필터
        const minRatio = payload?.minRatio ?? 5;
        const minSearchVolume = payload?.minSearchVolume ?? 300;
        const maxDocCount = payload?.maxDocCount ?? 10000;

        const enriched = measured.map(m => {
          const sv = ((m.pcSearchVolume || 0) + (m.mobileSearchVolume || 0));
          const dc = typeof m.documentCount === 'number' ? m.documentCount : null;
          let ratio: number | null = null;
          if (dc !== null && dc > 0 && sv > 0) ratio = sv / dc;
          else if (dc === 0 && sv > 0) ratio = Infinity;
          return {
            keyword: m.keyword,
            pcSearchVolume: m.pcSearchVolume,
            mobileSearchVolume: m.mobileSearchVolume,
            searchVolume: sv > 0 ? sv : null,
            documentCount: dc,
            goldenRatio: (ratio !== null && Number.isFinite(ratio)) ? Math.round(ratio * 100) / 100 : (ratio === Infinity ? 9999 : null),
            isGolden: false,
          };
        });

        // v2.43.1: 측정 진단 (사용자가 왜 0건인지 파악 가능)
        const stats = {
          measured: measured.length,
          svMeasured: enriched.filter(k => k.searchVolume !== null).length,
          dcMeasured: enriched.filter(k => k.documentCount !== null).length,
          ratioCalc: enriched.filter(k => k.goldenRatio !== null).length,
        };
        send('progress', `📈 측정 결과: sv ${stats.svMeasured}/${stats.measured}, dc ${stats.dcMeasured}/${stats.measured}, ratio ${stats.ratioCalc}/${stats.measured}`);

        // 황금 조건: 검색량 ≥ minSearchVolume, 문서수 ≤ maxDocCount, ratio ≥ minRatio
        const goldenFilter = (k: typeof enriched[0], sv_min: number, dc_max: number, r_min: number) => {
          if (k.keyword === seed) return false;
          const sv = k.searchVolume || 0;
          const dc = k.documentCount;
          const r = k.goldenRatio;
          if (sv < sv_min) return false;
          if (dc !== null && dc > dc_max) return false;
          if (r === null) return false;
          if (r < r_min) return false;
          return true;
        };
        let golden = enriched.filter(k => goldenFilter(k, minSearchVolume, maxDocCount, minRatio)).map(k => ({ ...k, isGolden: true }));
        let relaxedUsed = false;

        // v2.43.1: 0건이면 자동 완화 재시도 (sv 100, dc 30000, ratio 2)
        if (golden.length === 0 && stats.svMeasured > 0) {
          send('progress', `🔧 엄격 컷 0건 → 완화 재시도 (sv≥100, dc≤30000, 비율≥2)`);
          golden = enriched.filter(k => goldenFilter(k, 100, 30000, 2)).map(k => ({ ...k, isGolden: false, _relaxed: true }));
          relaxedUsed = true;
        }

        // 정렬: 황금비율 내림차순 → 검색량 내림차순
        golden.sort((a, b) => {
          const ra = a.goldenRatio ?? 0;
          const rb = b.goldenRatio ?? 0;
          if (rb !== ra) return rb - ra;
          return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        });

        const msg = relaxedUsed
          ? `🔶 완화 컷 ${golden.length}개 발견 (엄격 컷 0건 → sv≥100, dc≤30000, 비율≥2)`
          : `✅ ${golden.length}개 황금 키워드 발견 (후보 ${cleaned.length}개 중)`;
        send('complete', msg, { count: golden.length });

        return {
          success: true,
          keywords: golden.slice(0, 100),
          totalCandidates: cleaned.length,
          totalMeasured: measured.length,
          appliedThresholds: relaxedUsed
            ? { minRatio: 2, minSearchVolume: 100, maxDocCount: 30000, relaxed: true }
            : { minRatio, minSearchVolume, maxDocCount, relaxed: false },
          stats, // sv/dc/ratio 측정 통계
          diagnosis: stats.svMeasured === 0
            ? '검색량 측정 0건 — SearchAd API 키 권한 확인 필요'
            : (golden.length === 0
              ? `후보 ${cleaned.length}개 측정했으나 황금 조건 통과 0건. 시드 키워드를 더 niche한 것으로 시도하거나 후보 부족.`
              : null),
        };
      } catch (error: any) {
        console.error('[GOLDEN-DISCOVERY] 오류:', error);
        return { success: false, error: error.message || '황금 키워드 발굴 실패', keywords: [] };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ discover-golden-keywords 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('search-suffix-keywords')) {
    ipcMain.handle('search-suffix-keywords', async (event, options: { suffix: string; maxResults?: number }) => {
      try {
        const { suffix, maxResults = 100 } = options;

        if (!suffix || suffix.trim().length === 0) {
          return {
            success: false,
            error: '수식어를 입력해주세요 (예: 방법, 꿀팁, 추천)',
            keywords: [],
            total: 0
          };
        }

        console.log(`[SUFFIX-SEARCH] 수식어 키워드 검색 시작: "${suffix}"`);

        // 환경 변수에서 API 키 로드
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

        if (!naverClientId || !naverClientSecret) {
          return {
            success: false,
            error: '네이버 API 키가 설정되지 않았습니다. 환경 설정에서 API 키를 입력해주세요.',
            keywords: [],
            total: 0
          };
        }

        // 1. 네이버 실시간 인기 키워드 가져오기
        const realtimeKeywords = await getNaverRealtimeKeywords(50);
        const seedKeywords = realtimeKeywords.map(k => k.keyword).slice(0, 30);

        console.log(`[SUFFIX-SEARCH] 시드 키워드 ${seedKeywords.length}개 수집 완료`);

        // 2. 각 시드 키워드에 수식어를 붙여서 검색량 조회
        const keywords: Array<{
          keyword: string;
          pcSearchVolume: number | null;
          mobileSearchVolume: number | null;
          totalVolume: number | null;
          documentCount: number | null;
          goldenRatio: number | null;
        }> = [];

        for (const seedKeyword of seedKeywords) {
          if (keywords.length >= maxResults) break;

          const combinedKeyword = `${seedKeyword} ${suffix}`;

          try {
            // 검색량 조회
            const volumeData = await getNaverKeywordSearchVolumeSeparate({
              clientId: naverClientId,
              clientSecret: naverClientSecret
            }, [combinedKeyword]);

            if (volumeData && volumeData.length > 0 && volumeData[0]) {
              const pcVol = volumeData[0].pcSearchVolume ?? null;
              const mobileVol = volumeData[0].mobileSearchVolume ?? null;
              const totalVol: number | null = (pcVol !== null || mobileVol !== null)
                ? ((pcVol ?? 0) + (mobileVol ?? 0))
                : null;

              // 문서수 조회
              let documentCount: number | null = null;
              try {
                const blogApiUrl = 'https://openapi.naver.com/v1/search/blog.json';
                const headers = {
                  'X-Naver-Client-Id': naverClientId,
                  'X-Naver-Client-Secret': naverClientSecret
                };
                const docParams = new URLSearchParams({
                  query: combinedKeyword,
                  display: '1'
                });
                const docResponse = await fetch(`${blogApiUrl}?${docParams}`, {
                  method: 'GET',
                  headers: headers
                });
                if (docResponse.ok) {
                  const docData = await docResponse.json();
                  const rawTotal = (docData as any)?.total;
                  documentCount = typeof rawTotal === 'number'
                    ? rawTotal
                    : (typeof rawTotal === 'string' ? parseInt(rawTotal, 10) : null);
                }
              } catch (docErr) {
                console.warn(`[SUFFIX-SEARCH] "${combinedKeyword}" 문서수 조회 실패:`, docErr);
              }

              // 황금비율 계산
              const goldenRatio: number | null = (typeof documentCount === 'number' && documentCount > 0 && typeof totalVol === 'number')
                ? (totalVol / documentCount)
                : null;

              // 검색량이 있는 키워드만 추가
              if (totalVol !== null && totalVol > 0) {
                keywords.push({
                  keyword: combinedKeyword,
                  pcSearchVolume: pcVol,
                  mobileSearchVolume: mobileVol,
                  totalVolume: totalVol,
                  documentCount: documentCount,
                  goldenRatio: typeof goldenRatio === 'number' ? (Math.round(goldenRatio * 100) / 100) : null
                });
              }
            }

            // Rate Limit 방지
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (err: any) {
            console.warn(`[SUFFIX-SEARCH] "${combinedKeyword}" 조회 실패:`, err.message);
          }
        }

        // 황금비율 높은 순으로 정렬
        keywords.sort((a, b) => {
          const aRatio = typeof a.goldenRatio === 'number' ? a.goldenRatio : null;
          const bRatio = typeof b.goldenRatio === 'number' ? b.goldenRatio : null;
          if (bRatio !== null && aRatio === null) return 1;
          if (aRatio !== null && bRatio === null) return -1;
          if (aRatio !== null && bRatio !== null && bRatio !== aRatio) return bRatio - aRatio;
          return 0;
        });

        console.log(`[SUFFIX-SEARCH] ✅ ${keywords.length}개 키워드 수집 완료`);

        return {
          success: true,
          keywords: keywords,
          total: keywords.length
        };

      } catch (error: any) {
        console.error('[SUFFIX-SEARCH] 오류:', error);
        return {
          success: false,
          error: error.message || '수식어 키워드 검색 실패',
          keywords: [],
          total: 0
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ search-suffix-keywords 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('crawl-blog-index')) {
    ipcMain.handle('crawl-blog-index', async (_event, keyword: string) => {
      try {
        // 라이선스 체크
        const license = await licenseManager.loadLicense();
        if (!license || !license.isValid) {
          return {
            success: false,
            error: '라이선스가 등록되지 않았습니다. 라이선스를 등록해주세요.'
          };
        }

        console.log(`[BLOG-INDEX] 블로그 지수 조회 시작: "${keyword}"`);
        const { crawlBlogIndex } = await import('../../utils/blog-index-crawler');
        const result = await crawlBlogIndex(keyword);
        console.log(`[BLOG-INDEX] ✅ 조회 완료: ${result.averageBlogIndex} (진입가능성: ${result.entryPossibility}점)`);
        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        console.error('[BLOG-INDEX] 조회 실패:', error);
        return {
          success: false,
          error: error.message || '블로그 지수 조회 실패',
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ crawl-blog-index 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('crawl-multiple-blog-index')) {
    ipcMain.handle('crawl-multiple-blog-index', async (event, keywords: string[]) => {
      try {
        console.log(`[BLOG-INDEX] 일괄 조회 시작: ${keywords.length}개 키워드`);
        const { crawlMultipleBlogIndex } = await import('../../utils/blog-index-crawler');

        const results = await crawlMultipleBlogIndex(keywords, (current, total) => {
          // 진행률 이벤트 전송
          event.sender.send('blog-index-progress', { current, total });
        });

        console.log(`[BLOG-INDEX] ✅ 일괄 조회 완료: ${results.length}개`);
        return {
          success: true,
          data: results,
        };
      } catch (error: any) {
        console.error('[BLOG-INDEX] 일괄 조회 실패:', error);
        return {
          success: false,
          error: error.message || '블로그 지수 일괄 조회 실패',
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ crawl-multiple-blog-index 핸들러 등록 완료');
  }

  // ========================================
  // 키워드 경쟁력 분석 핸들러
  // ========================================
  // 기존 핸들러 제거
  try {
    if (ipcMain.listenerCount('analyze-keyword-competition') > 0) {
      console.log('[KEYWORD-MASTER] 기존 analyze-keyword-competition 핸들러 제거 중...');
      ipcMain.removeHandler('analyze-keyword-competition');
    }
  } catch (e) {
    // 무시
  }

  ipcMain.handle('analyze-keyword-competition', async (_event, keyword: string) => {
    try {
      // 라이선스 체크
      const license = await licenseManager.loadLicense();
      if (!license || !license.isValid) {
        return {
          success: false,
          error: '라이선스가 등록되지 않았습니다. 라이선스를 등록해주세요.'
        };
      }

      console.log(`[COMPETITION] 키워드 경쟁력 분석 시작: "${keyword}"`);

      // 환경 변수에서 API 키 로드
      const envManager = EnvironmentManager.getInstance();
      const env = envManager.getConfig();
      const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
      const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

      if (!naverClientId || !naverClientSecret) {
        return {
          success: false,
          error: '네이버 API 키가 설정되지 않았습니다. 환경 설정에서 API 키를 입력해주세요.'
        };
      }

      const { analyzeKeywordCompetition } = await import('../../utils/keyword-competition/competition-analyzer');
      const result = await analyzeKeywordCompetition(keyword, {
        clientId: naverClientId,
        clientSecret: naverClientSecret
      });

      console.log(`[COMPETITION] ✅ 분석 완료: 점수 ${result.competitionScore}, 추천 ${result.recommendation}`);

      return {
        success: true,
        data: result
      };
    } catch (error: any) {
      console.error('[COMPETITION] 분석 실패:', error);
      return {
        success: false,
        error: error.message || '키워드 경쟁력 분석 실패'
      };
    }
  });
  console.log('[KEYWORD-MASTER] ✅ analyze-keyword-competition 핸들러 등록 완료');

  // 🔍 네이버 자동완성 API (마인드맵용) - 🔥 100% 성공률 목표!
  if (!ipcMain.listenerCount('get-autocomplete-suggestions')) {

    // 🔥 fetch with retry 헬퍼 (100% 성공률 목표!)
    const fetchWithRetryAC = async (url: string, options: RequestInit, maxRetries = 5): Promise<Response | null> => {
      for (let retry = 0; retry <= maxRetries; retry++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.ok) return response;

          if (response.status === 429 && retry < maxRetries) {
            const delay = 300 * Math.pow(1.5, retry) * 4;
            console.log(`[AUTOCOMPLETE] 🔄 Rate limit, ${delay}ms 후 재시도`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          if (response.status >= 500 && retry < maxRetries) {
            await new Promise(r => setTimeout(r, 300 * Math.pow(1.5, retry)));
            continue;
          }

          return response;
        } catch (e: any) {
          if (retry < maxRetries) {
            await new Promise(r => setTimeout(r, 300 * Math.pow(1.5, retry)));
            continue;
          }
          return null;
        }
      }
      return null;
    };

    ipcMain.handle('get-autocomplete-suggestions', async (_event, keyword: string) => {
      try {
        console.log(`[AUTOCOMPLETE] 🔥 자동완성 조회 (100% 성공률 목표): ${keyword}`);

        const suggestions: string[] = [];
        const suggestionSet = new Set<string>(); // 중복 방지

        // 기본 자동완성 - 재시도 포함!
        try {
          const baseUrl = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
          const response = await fetchWithRetryAC(baseUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'ko-KR,ko;q=0.9',
              'Referer': 'https://www.naver.com/'
            }
          });

          if (response && response.ok) {
            const data = await response.json();
            console.log(`[AUTOCOMPLETE] 기본 자동완성 응답:`, JSON.stringify(data).substring(0, 500));

            // items 배열 전체 탐색
            if (data.items && Array.isArray(data.items)) {
              for (const group of data.items) {
                if (Array.isArray(group)) {
                  // 각 그룹의 항목 처리
                  for (const item of group) {
                    if (Array.isArray(item) && item.length > 0) {
                      const suggestion = item[0].toString().trim();
                      if (suggestion && suggestion.length >= 2 && suggestion.length <= 50) {
                        if (!suggestionSet.has(suggestion)) {
                          suggestionSet.add(suggestion);
                          suggestions.push(suggestion);
                        }
                      }
                    }
                  }
                }
              }
            }

            console.log(`[AUTOCOMPLETE] 기본 자동완성 ${suggestions.length}개 발견`);
          }
        } catch (e) {
          console.warn('[AUTOCOMPLETE] 기본 자동완성 실패:', e);
        }

        // 자모 확장 (ㄱ~ㅎ) - 🔥 재시도 포함!
        console.log(`[AUTOCOMPLETE] 🔥 자모 확장 시작 (현재 ${suggestions.length}개)`);
        const jamoList = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

        for (const jamo of jamoList) {
          try {
            const jamoUrl = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword + ' ' + jamo)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
            const response = await fetchWithRetryAC(jamoUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Referer': 'https://www.naver.com/'
              }
            }, 3);

            if (response && response.ok) {
              const data = await response.json();
              if (data.items && Array.isArray(data.items)) {
                for (const group of data.items) {
                  if (Array.isArray(group)) {
                    for (const item of group) {
                      if (Array.isArray(item) && item.length > 0) {
                        const suggestion = item[0].toString().trim();
                        if (suggestion && suggestion.length >= 2 && suggestion.length <= 50) {
                          if (!suggestionSet.has(suggestion)) {
                            suggestionSet.add(suggestion);
                            suggestions.push(suggestion);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            await new Promise(r => setTimeout(r, 30)); // API 제한 방지
          } catch (e) {
            // 자모 확장 실패는 무시
          }
        }
        console.log(`[AUTOCOMPLETE] ✅ 자모 확장 후 ${suggestions.length}개`);

        // 한글 음절 확장 (가~하) - 🔥 재시도 포함!
        console.log(`[AUTOCOMPLETE] 🔥 음절 확장 시작 (현재 ${suggestions.length}개)`);
        const syllables = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

        for (const syllable of syllables) {
          try {
            const syllableUrl = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword + ' ' + syllable)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
            const response = await fetchWithRetryAC(syllableUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Referer': 'https://www.naver.com/'
              }
            }, 3);

            if (response && response.ok) {
              const data = await response.json();
              if (data.items && Array.isArray(data.items)) {
                for (const group of data.items) {
                  if (Array.isArray(group)) {
                    for (const item of group) {
                      if (Array.isArray(item) && item.length > 0) {
                        const suggestion = item[0].toString().trim();
                        if (suggestion && suggestion.length >= 2 && suggestion.length <= 50) {
                          if (!suggestionSet.has(suggestion)) {
                            suggestionSet.add(suggestion);
                            suggestions.push(suggestion);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            await new Promise(r => setTimeout(r, 30)); // API 제한 방지
          } catch (e) {
            // 음절 확장 실패는 무시
          }
        }
        console.log(`[AUTOCOMPLETE] ✅ 음절 확장 후 ${suggestions.length}개`);

        console.log(`[AUTOCOMPLETE] ✅ ${suggestions.length}개 자동완성 결과`);

        return {
          success: true,
          suggestions: suggestions
        };
      } catch (error: any) {
        console.error('[AUTOCOMPLETE] 오류:', error);
        return {
          success: false,
          suggestions: [],
          error: error.message
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-autocomplete-suggestions 핸들러 등록 완료');
  }

  // 🌊 키워드 흐름 분석 (연상 키워드)
  if (!ipcMain.listenerCount('analyze-keyword-flow')) {
    ipcMain.handle('analyze-keyword-flow', async (_event, keyword: string) => {
      try {
        console.log(`[KEYWORD-FLOW] 🌊 키워드 흐름 분석: "${keyword}"`);

        const { analyzeKeywordFlow } = await import('../../utils/keyword-flow-analyzer');
        const result = await analyzeKeywordFlow(keyword);

        console.log(`[KEYWORD-FLOW] ✅ 분석 완료: 상품 ${result.products.length}개, 흐름 ${result.flows.length}개`);

        return {
          success: true,
          data: result
        };
      } catch (error: any) {
        console.error('[KEYWORD-FLOW] ❌ 오류:', error.message);
        return {
          success: false,
          error: error.message || '키워드 흐름 분석 실패'
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ analyze-keyword-flow 핸들러 등록 완료');
  }

  ipcMain.handle('get-niche-keywords', async (_event, options: any) => {
    console.log('[KEYWORD-MASTER] 틈새 키워드 발굴 요청 수신');
    try {
      const api = getFreshKeywordsAPI();
      const result = await api.getNicheKeywords(options);
      return result;
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 틈새 키워드 발굴 실패:', error);
      throw error;
    }
  });

  // 🏆 Ultimate Niche Finder - 끝판왕 핸들러
  ipcMain.handle('find-ultimate-niche-keywords', async (event, options: { seeds?: string[]; maxDepth?: number; targetCount?: number }) => {
    console.log('[KEYWORD-MASTER] 🏆 Ultimate Niche Finder 요청:', options);

    // 진행 상황 전송 헬퍼
    const sendProgress = (message: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('ultimate-niche-progress', { message });
      }
    };

    try {
      sendProgress('🚀 1단계: Deep Mining 시작 (자동완성 깊이 파기)...');

      const result = await findUltimateNicheKeywords({
        ...options,
        // 진행 상황 콜백은 추후 ultimate-niche-finder에 추가할 수 있음
      });

      if (result.success) {
        sendProgress(`✅ 완료! ${result.keywords.length}개 틈새 키워드 발견`);
      } else {
        sendProgress(`❌ 실패: ${result.error}`);
      }

      return result;
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] Ultimate Niche Finder 오류:', error);
      return { success: false, error: error.message };
    }
  });
}
