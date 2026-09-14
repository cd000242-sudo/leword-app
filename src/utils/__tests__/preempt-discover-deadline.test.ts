import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 발굴 샤드가 240분 제한에 잘리지 않는다 (2026-09-15).
 *
 * 실사고: 09-12 부터 선점 보드 발굴 샤드 4개가 매 회차 240분 제한에 걸려 취소됐다.
 * 황금키워드 보드가 09-09 이후 6일간 안 바뀌었다. 잘리면 주제 하나도 못 끝내 partial 도 없고,
 * 합치기가 "쓸 수 있는 샤드가 하나도 없다"로 죽는다 — 4시간 태우고 빈손이다.
 *
 * 원인은 둘이 곱해진 것이다(샤드 0 로그 실측):
 *   자동완성 한 번  3.2초(09-07) → 21초   검색광고 폴백이 20초 abort 까지 매달림
 *   샤드당 확장 수  902회 → 2,361회+     secondarySeeds=40 으로 표본을 6.7배 연 결과
 *   21초 × 2,361 = 13.8시간
 *
 * 세 겹으로 막는다. 여기서 잠그는 것은 그 세 겹이 실제로 배선되어 있는가다:
 *   ① 발굴의 자동완성은 검색광고 폴백을 건너뛴다(1단계에서 이미 씨앗마다 200개 받았다)
 *   ② 스크립트가 스스로 마감을 지키고, 마감 뒤엔 더 넓히지 않되 모은 것은 실측·저장까지 끝낸다
 *   ③ 워크플로가 잡 제한보다 넉넉히 앞선 마감을 주고, 연관어 씨앗 수를 줄인다
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const candidates = fs.readFileSync(path.join(ROOT, 'scripts', 'preemption-candidates.js'), 'utf8');
const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'preemption-board.yml'), 'utf8');

describe('① 발굴의 자동완성은 검색광고 폴백을 건너뛴다', () => {
  it('확장 루프가 skipSearchAdRelated 를 켠 설정으로 자동완성을 부른다', () => {
    expect(candidates).toContain('const autocompleteConfig = { ...openApi, skipSearchAdRelated: true };');
    expect(candidates).toMatch(/getNaverAutocompleteKeywords\(seed, autocompleteConfig\)/);
    // 옛 호출이 남아 있으면 검색광고를 씨앗마다 또 두드린다
    expect(candidates).not.toMatch(/getNaverAutocompleteKeywords\(seed, openApi\)/);
  });

  it('자동완성 쪽이 그 플래그를 실제로 읽는다 — 안 읽으면 켜도 소용없다', () => {
    const autocomplete = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'naver-autocomplete.ts'), 'utf8');
    expect(autocomplete).toMatch(/fetchRelatedKeywords\(baseKeyword, config\.skipSearchAdRelated === true\)/);
  });
});

describe('② 스크립트가 스스로 마감을 지킨다', () => {
  it('--deadlineMinutes 를 받고, 기본은 마감 없음(예전과 같다)', () => {
    expect(candidates).toMatch(/const deadlineMinutes = Number\(arg\('deadlineMinutes'\)\) \|\| 0;/);
    expect(candidates).toMatch(/deadlineMinutes > 0 \? Date\.now\(\) \+ deadlineMinutes \* 60_000 : Infinity/);
  });

  it('마감이 지나면 확장 씨앗을 더 넓히지 않는다 — 루프 맨 앞에서 가른다', () => {
    const loop = candidates.slice(candidates.indexOf('for (const seed of expansionSeeds) {'));
    const head = loop.slice(0, loop.indexOf('getNaverAutocompleteKeywords'));
    expect(head, '마감 판정이 자동완성 호출보다 앞에 있어야 한다').toContain('if (pastDeadline()) { expansionSkipped += 1; continue; }');
  });

  it('잘라 낸 것을 주제마다·회차 끝에 로그로 남긴다 — 조용한 상한은 두지 않는다', () => {
    expect(candidates).toContain("deadlineCuts.push(`${topic}: 확장 씨앗 ${expansionSkipped}/${expansionSeeds.size}개 안 넓힘`)");
    expect(candidates).toContain('마감 ${deadlineMinutes}분에 걸려 덜 넓힌 주제 ${deadlineCuts.length}개');
  });

  it('마감은 확장만 끊고 실측·저장은 그대로 간다 — 그래야 partial 이 올라가고 합치기가 산다', () => {
    // 마감 판정이 실측 단계(검색광고 검색량)나 저장(savePartial)에는 걸려 있지 않다
    const measure = candidates.slice(candidates.indexOf('const sampleCap = Number(arg'));
    const beforeSave = measure.slice(0, measure.indexOf('savePartial()'));
    expect(beforeSave).not.toContain('pastDeadline()');
  });
});

describe('③ 워크플로가 마감과 표본을 맞춘다', () => {
  const discover = workflow.slice(workflow.indexOf('preemption-candidates.js'), workflow.indexOf('--starvedFloor'));
  const num = (key: string) => Number((discover.match(new RegExp(`--${key}=(\\d+)`)) || [])[1]);

  it('마감이 잡 제한보다 넉넉히 앞선다 — 실측·저장할 시간이 남아야 한다', () => {
    const jobTimeout = Number((workflow.match(/discover:[\s\S]*?timeout-minutes:\s*(\d+)/) || [])[1]);
    const deadline = num('deadlineMinutes');
    expect(deadline, '마감 인자가 없다').toBeGreaterThan(0);
    expect(jobTimeout - deadline, `여유 ${jobTimeout - deadline}분 — 실측·저장에 모자란다`).toBeGreaterThanOrEqual(60);
  });

  it('연관어 씨앗을 40 에서 줄였다 — 그대로면 마감 안에 주제 하나도 못 끝낸다', () => {
    expect(num('secondarySeeds')).toBeLessThanOrEqual(20);
  });
});
