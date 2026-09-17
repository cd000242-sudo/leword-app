/** Hand-authored contract fixtures; these are not live AI quality evaluations. */
import { EDITORIAL_VERSION, type EditorialBrief, type EditorialContent, type EditorialSelection, type EditorialSource } from '../homefeed/editorial-types';

export const editorialFact = '서울고법은 남산 곤돌라 사업 관련 용도구역 변경 처분을 취소했다.';
export const editorialSource = (): EditorialSource => ({ id: 'source-one', url: 'https://n.news.naver.com/mnews/article/001/0010000000', title: '남산 곤돌라 사업 항소심 패소', press: '연합뉴스', publishedAt: '2026-09-17T06:00:00Z', level: 'body', text: `${editorialFact} 시는 판결문을 검토한 뒤 후속 대응을 결정하겠다고 밝혔다.`, contentHash: 'hash-one', fetchStatus: 'ok', imageUrl: null });
export const editorialContent = (): EditorialContent => ({
  summary: editorialFact, summaryFactIds: ['f1'], whyNow: '항소심에서 용도구역 변경 처분 취소 판단이 나왔다.', whyNowFactIds: ['f1'], audience: '남산 방문을 계획하며 사업 진행 상황이 궁금한 독자',
  facts: [{ id: 'f1', text: editorialFact, supports: [{ sourceId: 'source-one', excerpt: editorialFact }] }],
  recommendedAngleId: 'a1', angles: [{ id: 'a1', label: '이번 판결이 취소한 대상', readerQuestion: '항소심은 사업의 어떤 처분을 취소했을까?', difference: '수집한 기사 제목의 패소 소식에서 한발 나아가 취소 대상의 범위를 설명한다.', sectionIds: ['s1'], suggestedTitle: '남산 곤돌라 항소심 판결, 취소된 처분은 무엇일까?', firstCard: { line1: '남산 곤돌라 항소심 판결', line2: '어떤 처분이 취소됐을까?' } }],
  sections: [{ id: 's1', question: '법원이 취소한 대상은 무엇인가?', answer: editorialFact, factIds: ['f1'] }], unresolved: [],
});
export const editorialBrief = (): EditorialBrief => ({ ...editorialContent(), id: 'brief-one', version: EDITORIAL_VERSION, revision: 'brief-r1', evidenceRevision: 'ev-r1', sourceRevision: 'src-r1', createdAt: '2026-09-17T06:00:00Z', provider: 'test-fixture', sources: [editorialSource()], readiness: 'ready', problems: [], review: { passed: true, issues: [] } });
export const editorialSelection = (): EditorialSelection => ({ revision: 1, briefRevision: 'brief-r1', evidenceRevision: 'ev-r1', angleId: 'a1', title: editorialContent().angles[0].suggestedTitle, card: editorialContent().angles[0].firstCard, imageId: null, selectedAt: '2026-09-17T06:00:00Z' });
