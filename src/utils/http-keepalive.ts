/**
 * v2.43.52: 글로벌 HTTP/HTTPS keep-alive
 *
 * 효과:
 *  - TCP handshake 비용 절감 (소켓 재사용)
 *  - axios 기본 + node http.globalAgent 둘 다 커버
 *  - 외부 API 호출 N건 → keep-alive로 연결 풀링 → 전체 벽시계 단축
 *
 * 단일 진입점: main.ts 가 import 만 하면 모든 axios 호출에 자동 적용
 */
import http from 'http';
import https from 'https';
import axios from 'axios';

const KEEP_ALIVE_OPTS = {
    keepAlive: true,
    keepAliveMsecs: 15_000,
    maxSockets: 64,
    maxFreeSockets: 32,
    timeout: 30_000,
    scheduling: 'lifo' as const,
};

const httpAgent = new http.Agent(KEEP_ALIVE_OPTS);
const httpsAgent = new https.Agent(KEEP_ALIVE_OPTS);

// 노드 글로벌 (axios 외에 fetch/got 등도 영향)
http.globalAgent = httpAgent;
https.globalAgent = httpsAgent;

// axios 기본 instance + 새 instance 모두 적용
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = axios.defaults.timeout || 20_000;

export const sharedHttpAgent = httpAgent;
export const sharedHttpsAgent = httpsAgent;
