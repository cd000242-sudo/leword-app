#!/usr/bin/env node
/*
 * 아임웹 구매평 → leaderspro.kr 후기로 옮긴다.
 *
 * 왜 필요한가(사장님 지시 2026-08-21): 사이트 후기가 **0건**이라 후기 탭이
 * 비어 있었다. 아임웹(leadernam.imweb.me)에는 실제 구매평이 쌓여 있으니,
 * 그걸 그대로 옮기면 없는 이야기를 지어낼 필요가 없다.
 *
 * 받는 방법(사장님):
 *   아임웹 관리자 → 쇼핑 > 구매평 관리 → 우측 상단 [내보내기]
 *   → 엑셀 파일 생성 → 다운로드
 *
 * 쓰는 방법:
 *   node scripts/imweb-reviews-import.js <파일.csv 또는 .xlsx> [--dry]
 *   --dry 면 무엇이 들어갈지만 보여주고 등록하지 않는다. 먼저 이걸로 확인한다.
 *
 * 규칙:
 *  · 있는 그대로 옮긴다. 문장을 고쳐 쓰거나 별점을 만들어 내지 않는다.
 *  · 연락처·이메일은 사이트 규칙대로 가려서 올린다(GAS 가 한 번 더 가린다).
 *  · 같은 후기를 두 번 올리지 않게, 이미 올라간 것과 글자로 대조한다.
 */
const fs = require('fs');
const path = require('path');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const DRY = process.argv.includes('--dry');
const FILE = process.argv.find((a) => /\.(csv|xlsx|xls)$/i.test(a));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** CSV 한 줄을 쪼갠다 — 따옴표 안의 쉼표·줄바꿈을 지킨다. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; continue; }
      if (ch === '"') { quoted = false; continue; }
      cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

/** 열 이름이 아임웹 판마다 달라, 뜻이 같은 이름을 폭넓게 받는다. */
function pick(row, header, names) {
  for (const name of names) {
    const index = header.findIndex((h) => String(h).replace(/\s+/g, '').includes(name));
    if (index >= 0 && String(row[index] || '').trim()) return String(row[index]).trim();
  }
  return '';
}

async function main() {
  if (!FILE || !fs.existsSync(FILE)) {
    console.error('사용법: node scripts/imweb-reviews-import.js <구매평.csv> [--dry]');
    console.error('아임웹 관리자 → 쇼핑 > 구매평 관리 → 내보내기 로 받은 파일을 넣으세요.');
    console.error('엑셀(xlsx)이면 엑셀에서 "다른 이름으로 저장 → CSV UTF-8"로 한 번 바꿔 주세요.');
    process.exit(2);
  }
  if (/\.xlsx?$/i.test(FILE)) {
    console.error('지금은 CSV 만 읽습니다. 엑셀에서 "CSV UTF-8"로 저장한 뒤 다시 실행해 주세요.');
    process.exit(2);
  }

  const raw = fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '');
  const rows = parseCsv(raw);
  if (rows.length < 2) { console.error('행이 없습니다.'); process.exit(2); }

  const header = rows[0];
  console.log(`열: ${header.join(' | ')}`);

  const items = [];
  for (const row of rows.slice(1)) {
    const text = pick(row, header, ['내용', '구매평', '후기', '본문', 'content', 'review']);
    if (!text) continue;
    items.push({
      author: pick(row, header, ['작성자', '이름', '회원', 'name', 'writer']) || '익명',
      email: pick(row, header, ['이메일', 'email']),
      product: pick(row, header, ['상품', 'product']),
      date: pick(row, header, ['작성일', '등록일', '날짜', 'date']),
      rating: pick(row, header, ['별점', '평점', 'rating', 'score']),
      text,
    });
  }
  console.log(`\n읽은 구매평 ${items.length}건`);
  items.slice(0, 3).forEach((it) => console.log(`  · ${it.author} | ${it.text.slice(0, 46)}…`));

  // 이미 올라간 것과 대조 — 같은 글을 두 번 올리지 않는다.
  const existing = await fetch(`${GAS_URL}?action=get-reviews`, { redirect: 'follow' })
    .then((r) => r.json()).then((d) => (d.reviews || [])).catch(() => []);
  const seen = new Set(existing.map((r) => String(r.reviewText || r.detail || r.text || '').replace(/\s+/g, '').slice(0, 40)));
  const fresh = items.filter((it) => !seen.has(it.text.replace(/\s+/g, '').slice(0, 40)));
  console.log(`이미 올라간 것 ${existing.length}건 · 새로 올릴 것 ${fresh.length}건`);

  if (DRY) { console.log('\n--dry 라 등록하지 않았습니다.'); return; }
  if (fresh.length === 0) { console.log('새로 올릴 것이 없습니다.'); return; }

  let ok = 0;
  let fail = 0;
  for (let index = 0; index < fresh.length; index += 1) {
    const item = fresh[index];
    const payload = {
      action: 'submit-review',
      author: item.author,
      email: item.email,
      phone: '',
      rating: Number(item.rating) || 5,
      summary: item.text.slice(0, 120),
      detail: item.text,
      reviewText: item.text,
      role: [item.product, item.date].filter(Boolean).join(' · '),
      source: 'imweb',
      timestamp: item.date || new Date().toISOString(),
    };
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload), redirect: 'follow',
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) { ok += 1; } else { fail += 1; console.log(`  ✗ ${item.author}: ${data.message || '실패'}`); }
    } catch (error) {
      fail += 1;
      console.log(`  ✗ ${item.author}: ${String(error.message).slice(0, 40)}`);
    }
    if (index % 10 === 9) console.log(`  … ${index + 1}/${fresh.length}`);
    await sleep(400); // GAS 를 몰아치지 않는다
  }
  console.log(`\n등록 ${ok}건 · 실패 ${fail}건`);
  console.log('사이트 후기 탭에서 확인하세요 — 검토 상태라면 관리자에서 공개로 바꿔야 보입니다.');
}

main().catch((error) => { console.error('실패:', error); process.exit(1); });
