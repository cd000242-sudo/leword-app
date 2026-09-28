const fs = require('fs');
const { roundAt } = require('./today-picks-rounds');
const { completeRound } = require('./today-picks-selection');

async function readCompletedRound(url, keep, fetchImpl = fetch, now = Date.now()) {
  try {
    const response = await fetchImpl(`${url}?t=${now}`, {cache:'no-store',signal:AbortSignal.timeout(20000)});
    return response.ok && completeRound(await response.json(),roundAt(now).id,keep);
  } catch { return false; }
}

async function main() {
  const arg = name => process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
  const done = await readCompletedRound(arg('url') || 'https://leaderspro.kr/data/today-picks.json',Number(arg('keep')) || 30);
  console.log(`done=${done}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,`done=${done}\n`);
}
module.exports = {readCompletedRound};
if (require.main === module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
