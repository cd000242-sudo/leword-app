import { describe, expect, it } from 'vitest';
import { judgeNamedPersonRisk } from '../named-person-risk';

/**
 * 사장님 지적: "정형외과 임형태 이런건 임형태라는 분이 글을 작성해야 되지 않니.
 * 내가 글을 써서 잘못된 정보를 주면 거기서 문제가 생길 텐데."
 */
describe('judgeNamedPersonRisk — 막아야 하는 것', () => {
    it('의료인 실명은 막는다', () => {
        const out = judgeNamedPersonRisk('정형외과 임형태');
        expect(out.risky).toBe(true);
        expect(out.reason).toContain('임형태');
    });

    it('다른 전문직 실명도 막는다', () => {
        expect(judgeNamedPersonRisk('김철수 변호사 상담').risky).toBe(true);
        expect(judgeNamedPersonRisk('강남 치과 박지훈 원장').risky).toBe(true);
    });
});

describe('judgeNamedPersonRisk — 두어야 하는 것', () => {
    // 기관만 있는 건 누구나 쓸 수 있는 글이다.
    it('실명 없는 기관 키워드는 통과시킨다', () => {
        for (const keyword of ['정형외과 예약 방법', '치과 스케일링 비용', '동네 병원 야간진료']) {
            expect(judgeNamedPersonRisk(keyword).risky).toBe(false);
        }
    });

    // 상표·제품은 누구나 후기를 쓴다. 실제로 이 보드의 값어치가 거기서 나온다.
    it('상표·제품명은 통과시킨다', () => {
        for (const keyword of ['강아지이발기 에이블미', '강아지치석제거 케어덴', '멜론티켓 동접']) {
            expect(judgeNamedPersonRisk(keyword).risky).toBe(false);
        }
    });

    it('이름 모양이 아니면 잡지 않는다', () => {
        expect(judgeNamedPersonRisk('정형외과 도수치료').risky).toBe(false);
        expect(judgeNamedPersonRisk('병원 진료의뢰서').risky).toBe(false);
    });

    it('한 어절짜리는 판단하지 않는다', () => {
        expect(judgeNamedPersonRisk('정형외과').risky).toBe(false);
    });

    it('성씨가 아닌 두 글자는 이름으로 안 본다', () => {
        expect(judgeNamedPersonRisk('병원 응급실').risky).toBe(false);
    });
});

/**
 * 성씨 목록만 쓰면 '방법'('방'씨)·'비용'('비'는 성씨 아님)·'주차장'('주'씨)이
 * 이름으로 잡힌다. 실측에서 '정형외과 예약 방법'이 바로 걸렸다.
 */
describe('judgeNamedPersonRisk — 이름이 아닌 흔한 말', () => {
    it('성씨로 시작하는 흔한 낱말을 이름으로 안 본다', () => {
        for (const keyword of [
            '정형외과 예약 방법', '병원 주차장 무료', '치과 진료비 얼마',
            '한의원 상담실 위치', '약국 영업시간 확인',
        ]) {
            expect(judgeNamedPersonRisk(keyword).risky).toBe(false);
        }
    });

    it('세 글자 실명은 그대로 잡는다', () => {
        expect(judgeNamedPersonRisk('정형외과 임형태').risky).toBe(true);
        expect(judgeNamedPersonRisk('한의원 최민수 원장').risky).toBe(true);
    });
});
