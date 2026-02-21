const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // 정적 파일 서빙 추가

// ============================================================================
// 🛠️ 네이버 실시간 데이터 조회 도구 (Native Tool)
// ============================================================================

// 캐시 (메모리)
const keywordCache = new Map();

/**
 * 네이버 연관검색어 조회 함수
 * @param {string} keyword 
 */
async function fetchNaverRelatedKeywords(keyword) {
    if (!keyword) return [];

    // 1. 캐시 확인
    if (keywordCache.has(keyword)) {
        console.log(`[CACHE] "${keyword}" 연관검색어 히트`);
        return keywordCache.get(keyword);
    }

    try {
        console.log(`[NAVER] "${keyword}" 실시간 데이터 조회 중...`);
        const response = await axios.get('https://ac.search.naver.com/nx/ac', {
            params: {
                q: keyword,
                con: 0,
                frm: 'nv',
                ans: 2,
                r_format: 'json',
                r_enc: 'UTF-8',
                r_unicode: 0,
                t_koreng: 1,
                run: 2,
                rev: 4,
                q_enc: 'UTF-8',
                st: 100
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.naver.com/',
                'Accept': '*/*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 3000
        });

        const results = [];
        if (response.data && response.data.items) {
            for (const itemGroup of response.data.items) {
                if (Array.isArray(itemGroup)) {
                    for (const item of itemGroup) {
                        if (Array.isArray(item) && item[0]) {
                            const kw = String(item[0]).trim();
                            if (kw !== keyword) results.push(kw);
                        }
                    }
                }
            }
        }

        const uniqueResults = [...new Set(results)].slice(0, 10);

        // 캐시 저장 (1시간)
        keywordCache.set(keyword, uniqueResults);
        setTimeout(() => keywordCache.delete(keyword), 60 * 60 * 1000);

        console.log(`[NAVER] "${keyword}" 조회 성공: ${uniqueResults.length}개`);
        return uniqueResults;
    } catch (error) {
        console.error(`[NAVER] 오류: ${error.message}`);
        return [];
    }
}

// ============================================================================
// 🧠 AI 채팅 처리 (ReAct 패턴 적용)
// ============================================================================

const SYSTEM_PROMPT = `
당신은 'LEWORD AI'라는 이름의 키워드 분석 전문가입니다.
사용자가 블로그나 콘텐츠 소재를 찾을 때, 데이터를 기반으로 한 '100점짜리 답변'을 줘야 합니다.

## 핵심 기능: 실시간 데이터 검색
사용자가 특정 주제나 키워드에 대해 물어보면, 당신은 먼저 실시간 연관검색어가 필요한지 판단해야 합니다.
데이터가 필요하다면, **반드시** 아래 형식으로만 응답하세요. (설명 금지)

[SEARCH:검색할키워드]

예시:
User: "겨울 간식 키워드 추천해줘"
AI: [SEARCH:겨울 간식]

User: "아이폰16 관련해서 뭐 쓸까?"
AI: [SEARCH:아이폰16]

## 답변 가이드
1. 검색 결과가 제공되면("Context"로 주어짐), 그 키워드들을 분석해서 '황금 키워드'를 추천하세요.
2. 각 키워드별로 추천 제목을 1개씩 만들어주세요.
3. 톤앤매너: 전문적이지만 친절하게, "비평가 모드"를 섞어서 분석해주세요.
4. 글을 직접 써주지는 말고, '제목'과 '공략 포인트'만 짚어주세요.
5. 출력은 깔끔한 마크다운 형식으로 해주세요.
`;

app.post('/chat', async (req, res) => {
    try {
        const { message, history, apiKey, modelName } = req.body;
        const userApiKey = apiKey || process.env.GEMINI_API_KEY;

        if (!userApiKey) {
            return res.status(400).json({ reply: "API 키가 없습니다. 설정(⚙️)에서 키를 입력해주세요!" });
        }

        const genAI = new GoogleGenerativeAI(userApiKey);

        // 🚀 모델 설정: 사용자가 선택한 모델 사용 (기본값: gemini-1.5-pro)
        const targetModel = modelName || "gemini-1.5-pro";
        const model = genAI.getGenerativeModel({ model: targetModel });

        console.log(`[USER] ${message} (Model: ${targetModel})`);

        // 1. Tool Use 판단을 위한 1차 호출
        // history 관리 생략 (단발성 질문 처리 위주, 필요 시 history 추가 가능)
        // 여기서는 채팅 세션을 새로 시작하되, 이전 대화 내용이 있다면 context에 포함시킬 수 있음
        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
                { role: "model", parts: [{ text: "알겠습니다. 실시간 데이터가 필요하면 [SEARCH:키워드] 명령을 사용하겠습니다." }] }
                // 만약 클라이언트에서 history를 보내준다면 여기에 추가
            ]
        });

        const result1 = await chat.sendMessage(message);
        const text1 = result1.response.text();

        // 2. 검색 명령 감지 ([SEARCH:키워드])
        const searchMatch = text1.match(/\[SEARCH:(.+?)\]/);

        if (searchMatch) {
            const keywordToSearch = searchMatch[1].trim();
            console.log(`[AI-DECISION] 검색 필요 감지: "${keywordToSearch}"`);

            // 3. 네이버 API 호출
            const relatedKeywords = await fetchNaverRelatedKeywords(keywordToSearch);

            // 4. 결과와 함께 재질문
            const contextPrompt = `
[네이버 실시간 데이터 결과]
키워드 "${keywordToSearch}"의 실제 연관검색어:
${relatedKeywords.length > 0 ? relatedKeywords.join(', ') : "(실시간 데이터 없음)"}

위 데이터를 바탕으로 사용자에게 답변하세요. 연관검색어들을 활용하여 구체적인 전략을 제시하세요.
사용자 질문이 뭐였는지 잊지 마세요.
            `;

            console.log(`[AI-FINAL] 데이터 기반 최종 답변 생성 중...`);
            const result2 = await chat.sendMessage(contextPrompt);
            return res.json({ reply: result2.response.text() });
        }

        // 검색 불필요 시 바로 응답
        res.json({ reply: text1 });

    } catch (error) {
        console.error("서버 에러:", error);
        res.status(500).json({ reply: `에러가 발생했습니다 ㅠㅠ\n${error.message}` });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`
========================================
🤖 AI 키워드 챗봇 서버 가동 (Port ${PORT})
----------------------------------------
👉 http://localhost:${PORT}
========================================
`);
});
