const path = require('path');
const r = require(path.resolve('./manus-validation-report-1778430724847.json'));
const failed = r.results.filter(x => !x.parseOk);
console.log(`실패 ${failed.length}건 분석:\n`);
for (const f of failed) {
  console.log(`▶ ${f.caseName}#${f.runIdx} — ${(f.elapsedMs/1000).toFixed(1)}s, ${f.assistantMessageCount}msgs, ${f.jsonAttachmentCount}files`);
  console.log(`  agentStatusHistory: ${JSON.stringify(f.agentStatusHistory)}`);
  console.log(`  taskId: ${f.taskId}`);
  console.log(`  rawSample (1500자):`);
  console.log(`  ${f.rawSample.substring(0, 1500)}`);
  console.log('');
}
