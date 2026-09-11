/**
 * 무료 맛보기 다섯 — 발행기가 쓰는 쪽.
 *
 * ⚠ **사이트 레포에 쌍둥이가 있다**: `spa/src/lib/freeSample.mjs`.
 * 발행기는 이 레포(CommonJS + ts-node), 화면은 사이트 레포(ESM) 라 한 파일을 공유할 수 없다.
 * 둘은 같은 규칙이어야 하고, 양쪽 테스트가 **같은 실측 붙박이**로 잠근다
 * (2026-09-09 발행본: 행 43개 · 발행본의 다섯 중 '제주렌트카 본사' 하나만 살아남음).
 * 한쪽을 고치면 반드시 다른 쪽도 고칠 것.
 *
 * 규칙: **하루 동안 고정하되, 사라진 자리만 메운다.**
 *   · 하루 고정의 이유(사장님 2026-08-20): "5건을 랜덤으로 보여주면 굳이 구매 안 해도
 *     새로고침하면 새 키워드를 볼 수 있다고 생각한다고." 그래서 이름을 발행본에 박아 둔다.
 *   · 그런데 보드 행은 회차마다 바뀐다(신규·이월·만료). 살아남았는지 확인하지 않아
 *     이름이 증발했고, 화면은 **순번이 아니라 이름**으로 잠금을 푸니 카드가 한 장만 열렸다
 *     (사장님 2026-09-11 "황금키워드는 1개만 보인다고 문의왔어요").
 *   · 살아남은 이름은 그대로 두고 모자란 만큼만 보드 **발행 순서** 앞줄에서 채운다.
 */

/** 비로그인 방문자가 선명하게 보는 카드 수. */
export const FREE_SAMPLE_SIZE = 5;

/**
 * @param board rows 만 본다(발행 순서 그대로).
 * @param published 직전 발행본이 하루 고정으로 박아 둔 이름들. 없으면 앞줄로만 채운다.
 * @returns 실제로 열어 줄 이름들. 보드가 다섯보다 적으면 있는 만큼만 — 없는 이름을 지어내지 않는다.
 */
export function repairFreeSample(
  board: { rows?: Array<{ keyword?: string }> } | null | undefined,
  published: readonly string[] | null | undefined,
): string[] {
  const rows = (board && Array.isArray(board.rows)) ? board.rows : [];
  const names = rows.map((row) => String((row && row.keyword) || '')).filter(Boolean);
  const onBoard = new Set(names);

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    if (!name || seen.has(name) || out.length >= FREE_SAMPLE_SIZE) return;
    seen.add(name);
    out.push(name);
  };

  // ① 발행본이 준 이름 중 아직 보드에 있는 것 — 자리를 그대로 지킨다.
  for (const name of (Array.isArray(published) ? published : [])) {
    if (onBoard.has(String(name))) push(String(name));
  }
  // ② 모자란 만큼 보드 앞줄에서 메운다.
  for (const name of names) push(name);

  return out;
}
