#!/usr/bin/env node
require('ts-node/register/transpile-only');
const { createDefaultAgentChain } = require('../src/utils/agent-cli/defaultChain');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');

const prompt = process.env.AGENT_TEST_PROMPT || '다른 작업을 하지 말고 다음 단어만 출력해라: 연동확인';
runWithAnyAgent(prompt, createDefaultAgentChain(), { timeoutMs: 90_000 })
  .then(({ provider, tried, failures, reply }) => {
    console.log(JSON.stringify({ provider, tried, failures, reply: reply.slice(0, 200) }));
    process.exit(0);
  })
  .catch((error) => { console.error(error.message); process.exit(1); });
