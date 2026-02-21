# LEWORD - 키워드 마스터 독립 앱

LEWORD는 키워드 분석 및 트렌드 조회를 위한 독립 Electron 앱입니다.

## 설치

```bash
npm install
```

## 개발 모드 실행

```bash
npm run dev
```

## 빌드

```bash
npm run build
```

## 배포용 빌드

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac
```

## 기능

- 네이버 실시간 검색어 조회
- 구글 트렌드 키워드 분석
- 유튜브 트렌드 키워드 조회
- 골든 키워드 발굴
- 키워드 트렌드 분석
- 엑셀 내보내기

## 환경 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
GOOGLE_API_KEY=your_google_api_key
YOUTUBE_API_KEY=your_youtube_api_key
```

