# AI 키워드 탐지기 (AI Keyword Miner)

네이버 실시간 연관검색어를 조회하여 Gemini가 분석해주는 지능형 챗봇입니다.

## 🚀 실행 방법

1. 터미널을 열고 `ai-tool` 폴더로 이동합니다.
   ```bash
   cd ai-tool
   ```

2. 필요한 라이브러리를 설치합니다. (최초 1회만)
   ```bash
   npm install
   ```
   *(express, cors, axios, dotenv, @google/generative-ai 설치됨)*

3. 서버를 실행합니다.
   ```bash
   npm start
   ```

4. 브라우저 주소창에 아래 주소를 입력합니다.
   👉 **http://localhost:3000**

5. 화면 우측 상단 설정(⚙️) 버튼을 눌러 **Gemini API Key**를 입력합니다.

## ✨ 주요 기능
- **실시간 데이터**: 질문에 따라 AI가 스스로 네이버 검색이 필요한지 판단하고 조회합니다.
- **고급 UI**: Tailwind CSS 기반의 깔끔한 디자인과 애니메이션.
- **플로팅 버튼**: 모바일 환경을 고려한 우측 하단 플로팅 버튼.
