const fs = require('node:fs');
const crypto = require('node:crypto');
const template = require('./leword-monthly-billing-template.cjs');
const renewalTemplate = require('./leword-monthly-renewal-template.cjs');
const EXPECTED_LIVE_SHA256 = '6a1f85187048eed3233e4a28d9fb6b9076cefaaac70dade94c86a8a7eb0843ef';
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Expected exactly one patch anchor: ' + before.slice(0, 90));
  return source.replace(before, after);
}
function patchMonthlyBilling(source, { verifyHash = true } = {}) {
  if (verifyHash && crypto.createHash('sha256').update(source).digest('hex') !== EXPECTED_LIVE_SHA256) throw new Error('Live source changed; inspect current deployment before applying patch.');
  let out = source;
  out = replaceOnce(out, "'leword-monthly':  { name: 'Leword 1개월 정기구독',       amount: 30000,", "'leword-monthly':  { name: 'LEWORD 1개월 정기구독',       amount: 19900,");
  // Route only after canonical product resolution, so the legacy amount fallback cannot bypass the guard.
  const start = out.indexOf('function handleRegisterBillingJSONP(params) {');
  const end = out.indexOf('function handleStartTrialJSONP(', start);
  if (start < 0 || end < 0) throw new Error('Billing function anchors missing');
  let register = out.slice(start, end);
  register = replaceOnce(register, "  var authHeader = 'Basic ' + Utilities.base64Encode(getTossSecretKey() + ':');", "  if (productId === 'leword-monthly') return handleLewordMonthlyBilling_(Object.assign({}, params, { product: productId }));\n\n  var authHeader = 'Basic ' + Utilities.base64Encode(getTossSecretKey() + ':');");
  out = out.slice(0, start) + register + out.slice(end);
  // New monthly purchases must use the immediate billing endpoint, not the unrelated 7-day trial.
  out = replaceOnce(out, 'function handleStartTrialJSONP(params) {', "function handleStartTrialJSONP(params) {\n  if (params.product === 'leword-monthly' || (!params.product && (Number(params.amount) === 19900 || Number(params.amount) === 30000))) return jsonpResponse(params.callback || 'callback', { ok: false, error: 'LEWORD 월 구독은 구매 페이지에서 카드 정기결제로 시작해주세요.' });");
  out = replaceOnce(out, '  /* [2026-09-15] 키 환경이 어긋나면 무슨 짓을 해도 발급이 안 된다.', "  if (productId === 'leword-monthly') return jsonpResponse(callback, { ok: false, error: 'LEWORD 월 구독은 구매 페이지에서 카드 정기결제로 시작해주세요.' });\n\n  /* [2026-09-15] 키 환경이 어긋나면 무슨 짓을 해도 발급이 안 된다.");
  out = replaceOnce(out, "function handleBankOrder(data) {\n", "function handleBankOrder(data) {\n  try { lewordMonthlyBankInfo_(data.product, data.amount); } catch (priceErr) { return jsonReply_({ ok: false, error: priceErr.message }); }\n");
  out = replaceOnce(out, "      var amount = Number(allData[i][4]) || 0;\n\n      sheet.getRange(rowNum, 6).setValue('approved');", "      var amount = Number(allData[i][4]) || 0;\n      try { lewordMonthlyBankInfo_(product, amount, true); } catch (priceErr) { return jsonReply_({ ok: false, error: priceErr.message }); }\n\n      sheet.getRange(rowNum, 6).setValue('approved');");
  out = replaceOnce(out, '        var productInfo = BANK_PRODUCT_MAP[amount];', '        var productInfo = lewordMonthlyBankInfo_(product, amount, true) || BANK_PRODUCT_MAP[amount];');
  out = replaceOnce(out, "    var oldCode = String(data[i][9]);\n\n    Logger.log('[자동갱신]", "    var oldCode = String(data[i][9]);\n    if (isManagedLewordMonthly_(data[i])) { renewLewordMonthly_(customerKey); continue; }\n\n    Logger.log('[자동갱신]");
  return out + '\n' + template + '\n' + renewalTemplate;
}
module.exports = { patchMonthlyBilling, EXPECTED_LIVE_SHA256 };
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/patch-leword-monthly-billing.cjs LIVE_CODE OUTPUT_CODE');
  fs.writeFileSync(output, patchMonthlyBilling(fs.readFileSync(input, 'utf8')));
  console.log('Verified patch written; no API or deployment was performed.');
}
