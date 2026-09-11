import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 황금키워드 발굴 입력 줄을 목업대로(2026-09-12).
 *
 * 사장님이 세 번 말씀하셨다 — "황금키워드 발굴은 목업 여전히 안 바껴있는데".
 * 내가 계속 "결과가 나오면 보입니다"라고 답했는데, 그건 질문에 대한 답이 아니었다.
 * 스크린샷을 보니 **입력 화면 자체가 옛 그라데이션 스타일**이었다:
 *   가운데 보라 그라데이션 제목 · 흰 칩 여섯 개가 한 줄 · 파랑/보라 그라데이션 버튼 넷
 *   세로로 다섯 덩어리 → 결과 표가 화면 밖으로 밀린다.
 *
 * 승인된 목업(scratchpad/golden-workbench.html, 2026-09-10 17:18 "황금키워드 발굴 작업대"):
 *   [발굴함] [건강/의료] [100개] [보강 없음] [9월 10일 16:41]      조건 펴기 ▾
 *   카테고리▾  보강 키워드[      ]  10 50 100 500 1000 무제한  [발굴 시작][키워드 조회][마인드맵][접기]
 *   → 어두운 평면 · 노란 단색 주버튼 하나 · 한 줄
 *
 * 내가 옮긴 것은 결과 표뿐이었다. 입력 줄은 그대로 뒀다.
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
const body = html.slice(html.indexOf('id="goldenCondBody"'), html.indexOf('<!-- 진행 상태 -->'));

describe('입력 줄이 한 줄 그리드다', () => {
  it('세로로 쌓지 않는다', () => {
    expect(body, '아직 세로 스택이다').not.toContain('flex-direction: column; gap: 16px;');
    expect(body).toMatch(/flex-wrap:\s*wrap/);
  });

  it('개수는 칩 여섯 개가 아니라 붙은 눈금 하나다', () => {
    expect(body).toContain('data-golden-segs');
    // 46px 짜리 흰 칩이 남아 있으면 옛 모양이다
    expect(body, '옛 흰 칩이 남아 있다').not.toContain('rgba(248,250,252,0.96)');
  });
});

describe('옛 그라데이션을 걷어낸다', () => {
  it('입력 줄에 그라데이션 버튼이 없다', () => {
    for (const g of ['#0ea5e9 0%, #6366f1', '#2563eb 0%, #7c3aed', '#a855f7 0%, #6366f1']) {
      expect(body, `그라데이션이 남아 있다: ${g}`).not.toContain(g);
    }
  });

  it('화면 제목이 가운데 보라 그라데이션이 아니다 — 다른 화면과 같은 결로', () => {
    const head = html.slice(html.indexOf('data-screen="golden"'), html.indexOf('id="goldenCondFolded"'));
    expect(head, '가운데 정렬 제목이 남아 있다').not.toContain('justify-content: center; gap: 12px; margin-bottom: 16px;');
  });
});

/*
 * 한 줄이 진짜 한 줄인지 (2026-09-12 실측).
 *
 * 클래스로 폭을 줄여도 마인드맵이 계속 두 번째 줄로 내려갔다. 범인은 두 가지였다:
 *   ① 같은 규격을 인라인에도 적어 둬서 클래스가 졌다 — 줄여도 안 줄어든다
 *   ② box-sizing 이 없어 padding·테두리 22px 이 폭 밖에 붙었다
 * 고친 뒤 실측: 줄높이 95px → 56px, 마인드맵 첫 줄.
 */
describe('폭 규격은 한 곳에만 둔다', () => {
  it('보강 키워드 칸이 인라인으로 제 폭을 다시 정하지 않는다', () => {
    const tag = body.slice(body.indexOf('id="keywordInput"'));
    const end = tag.indexOf('>');
    expect(tag.slice(0, end), '인라인이 클래스를 이긴다').not.toMatch(/flex:|min-width:/);
  });

  it('칸 규격에 box-sizing 이 있다 — 없으면 padding 이 폭 밖에 붙어 줄이 넘어간다', () => {
    const rule = html.slice(html.indexOf('.golden-cond-row input[type="text"] {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('box-sizing: border-box');
  });
});

describe('기능은 하나도 안 잃는다', () => {
  it('창구와 값이 그대로 있다', () => {
    for (const id of ['keywordCategory', 'keywordSource', 'keywordLookupBtn', 'categoryGoldenDiscoveryBtn', 'mindmapLimitSelect', 'stopBtn']) {
      expect(body, `사라진 요소: ${id}`).toContain(`id="${id}"`);
    }
    for (const fn of ['startKeywordLookupFromInput()', 'startKeywordDiscovery()', 'openRelatedKeywordModal()', 'stopKeywordDiscovery()']) {
      expect(body, `사라진 동작: ${fn}`).toContain(fn);
    }
  });

  it('개수 라디오 여섯 값이 그대로다 — 이름도 값도 안 바뀐다', () => {
    for (const v of ['10', '50', '100', '500', '1000', 'unlimited']) {
      expect(body).toContain(`name="keywordLimit" value="${v}"`);
    }
  });

  it('접기·펴기는 그대로 산다', () => {
    expect(html).toContain('goldenUnfoldConditions()');
    expect(html).toContain('goldenFoldConditions');
  });
});
