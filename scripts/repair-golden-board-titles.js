#!/usr/bin/env node
'use strict';

// Offline repair only: never refresh measurement/publishing timestamps or API metrics.
require('ts-node/register/transpile-only');
const fs = require('fs');
const path = require('path');
const { repairBoardTitles } = require('../src/utils/title-forge/board-titles');

function repairGoldenBoardTitles(board) {
  const collections = ['rows', 'trendCandidates'];
  const allRows = collections.flatMap(key => Array.isArray(board[key]) ? board[key] : []);
  const candidateRows = allRows.filter(row => row && typeof row.keyword === 'string')
    .map(row => ({ keyword: row.keyword, searchVolume: row.searchVolume ?? null, seed: row.seed }));
  const result = { ...board };
  const stats = { inspected: 0, changed: 0, withheld: 0 };
  for (const key of collections) {
    if (!Array.isArray(board[key])) continue;
    result[key] = board[key].map(row => {
      if (!row || typeof row.keyword !== 'string' || !row.titles) return row;
      const candidates = [
        ...candidateRows,
        ...(Array.isArray(row.subKeywords) ? row.subKeywords : []),
        ...(Array.isArray(row.keywordPool) ? row.keywordPool : []),
      ].filter(candidate => candidate && typeof candidate.keyword === 'string');
      const serpTitles = Array.isArray(row.serp?.topTitles) ? row.serp.topTitles : [];
      const titles = repairBoardTitles(row, candidates, serpTitles, row.titles);
      stats.inspected += 1;
      if (!titles.seo.text && !titles.home.text) stats.withheld += 1;
      if (JSON.stringify(titles) === JSON.stringify(row.titles)) return row;
      stats.changed += 1;
      return { ...row, titles };
    });
  }
  return { board: result, stats };
}

function main(argv = process.argv.slice(2)) {
  const value = name => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const input = value('in');
  if (!input || argv.some(arg => !/^--(?:in|out)=/.test(arg) && arg !== '--write')) {
    throw new Error('사용법: node scripts/repair-golden-board-titles.js --in=board.json [--out=repaired.json] [--write]');
  }
  const { board, stats } = repairGoldenBoardTitles(JSON.parse(fs.readFileSync(input, 'utf8')));
  const write = argv.includes('--write');
  const output = path.resolve(value('out') || input);
  if (write) fs.writeFileSync(output, JSON.stringify(board, null, 1), 'utf8');
  console.log(JSON.stringify({ ...stats, mode: write ? 'written' : 'dry-run', output, measurementsPreserved: true }));
  return stats;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { repairGoldenBoardTitles, main };
