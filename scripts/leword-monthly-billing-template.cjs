/** Runtime template for the dedicated LEWORD monthly purchase. No credentials. */
module.exports = String.raw`
function lewordMonthlyBankInfo_(product, amount, allowLegacy) {
  var label = String(product || '').trim();
  var monthly = /^LEWORD\s+(?:1개월|월간|월 구독)(?:\s*\([^)]*\))?$/i.test(label);
  if (monthly && allowLegacy === true && (Number(amount) === 9900 || Number(amount) === 30000)) return { licenseType: 'CUSTOM', customDays: 30, platform: 'LEWORD' };
  if (!monthly && Number(amount) !== 19900) return null;
  if (!monthly || Number(amount) !== 19900) throw new Error('LEWORD 1개월 이용권은 19,900원입니다. 구매 페이지를 새로고침해주세요.');
  return { licenseType: 'CUSTOM', customDays: 30, platform: 'LEWORD' };
}

function handleLewordMonthlyBilling_(params) {
  var callback = params.callback || 'callback';
  var reply = function (data) { return jsonpResponse(callback, data); };
  var customerKey = String(params.customerKey || '');
  var email = String(params.email || '').trim().toLowerCase();
  if (Number(params.amount) !== 19900 || params.product !== 'leword-monthly') return reply({ ok: false, error: 'LEWORD 월 구독 결제 금액은 19,900원입니다. 구매 페이지를 새로고침해주세요.' });
  if (!params.authKey || !/^[A-Za-z0-9_-]{1,40}$/.test(customerKey) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ ok: false, error: '카드 등록 정보를 확인해주세요.' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return reply({ ok: false, error: '결제 확인 중입니다. 잠시 후 같은 페이지에서 다시 확인해주세요.' });
  try {
    var props = PropertiesService.getScriptProperties();
    var hash = function (value) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)); };
    var authHash = hash(String(params.authKey));
    var stateKey = 'LEWORD_MONTHLY_' + customerKey;
    var receiptKey = 'LEWORD_MONTHLY_RECEIPT_' + customerKey;
    var emailPendingKey = 'LEWORD_MONTHLY_PENDING_' + hash(email);
    var raw = props.getProperty(stateKey);
    var state = raw ? JSON.parse(raw) : { email: email, authHash: authHash, orderId: 'LWM-' + customerKey, startedAt: new Date().toISOString() };
    var receiptHash = props.getProperty(receiptKey);
    if (state.email !== email || state.authHash !== authHash || (receiptHash && receiptHash !== authHash)) return reply({ ok: false, error: '기존 결제 정보와 일치하지 않습니다.' });
    var subSheet = getSubscriptionSheet();
    var rows = subSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === customerKey) {
        if (String(rows[i][1]).toLowerCase() !== email || String(rows[i][3]) !== 'leword-monthly') return reply({ ok: false, error: '기존 결제 정보와 일치하지 않습니다.' });
        if (rows[i][9] && (receiptHash === authHash || (raw && state.authHash === authHash))) {
          props.setProperty(receiptKey, authHash);
          if (props.getProperty(emailPendingKey) === customerKey) props.deleteProperty(emailPendingKey);
          props.deleteProperty(stateKey);
          return reply({ ok: true, code: String(rows[i][9]), product: String(rows[i][4]), nextPaymentDate: new Date(rows[i][6]).toISOString(), reused: true, emailSent: false });
        }
        return reply({ ok: false, error: '결제 확인 중입니다. 고객 지원에 문의해주세요.' });
      }
      if (String(rows[i][1]).toLowerCase() === email && String(rows[i][3]) === 'leword-monthly' && String(rows[i][7]) === 'active') return reply({ ok: false, error: '이미 LEWORD 월 구독을 이용 중입니다. 주문 조회에서 확인해주세요.' });
    }
    var emailPending = props.getProperty(emailPendingKey);
    if (emailPending && emailPending !== customerKey) return reply({ ok: false, error: '이 이메일의 이전 결제 결과를 확인 중입니다. 이전 결제 페이지에서 확인하거나 고객 지원에 문의해주세요.' });
    props.setProperty(emailPendingKey, customerKey);
    var persist = function () { props.setProperty(stateKey, JSON.stringify(state)); };
    ensureLewordMonthlyRenewalTrigger_();
    var authHeader = 'Basic ' + Utilities.base64Encode(getTossSecretKey() + ':');
    if (!state.billingKey) {
      if (state.authorizing) return reply({ ok: false, error: '카드 등록 결과 확인이 필요합니다. 다시 결제하지 말고 고객 지원에 문의해주세요.' });
      state.authorizing = true;
      persist();
      var issueResponse = UrlFetchApp.fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
        method: 'post', contentType: 'application/json', headers: { Authorization: authHeader },
        payload: JSON.stringify({ authKey: params.authKey, customerKey: customerKey }), muteHttpExceptions: true
      });
      var issued = JSON.parse(issueResponse.getContentText());
      var issueStatus = issueResponse.getResponseCode();
      if (issueStatus !== 200 || !issued.billingKey) {
        if (issueStatus >= 400 && issueStatus < 500 && issueStatus !== 408 && issueStatus !== 429) {
          props.deleteProperty(stateKey);
          props.deleteProperty(emailPendingKey);
        }
        return reply({ ok: false, error: '카드 등록을 완료하지 못했습니다. 구매 페이지에서 다시 진행하거나 고객 지원에서 상태를 확인해주세요.' });
      }
      state.billingKey = issued.billingKey;
      persist();
    }
    if (!state.paidAt) {
      if (Date.now() - new Date(state.startedAt).getTime() > 24 * 60 * 60 * 1000) return reply({ ok: false, error: '결제 확인 시간이 지났습니다. 고객 지원에 문의해주세요.' });
      var payResponse = UrlFetchApp.fetch('https://api.tosspayments.com/v1/billing/' + state.billingKey, {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: authHeader, 'Idempotency-Key': state.orderId },
        payload: JSON.stringify({ customerKey: customerKey, amount: 19900, orderId: state.orderId, orderName: 'LEWORD 1개월 정기구독', customerEmail: email }),
        muteHttpExceptions: true
      });
      var paid = JSON.parse(payResponse.getContentText());
      if (payResponse.getResponseCode() !== 200 || paid.orderId !== state.orderId || Number(paid.totalAmount) !== 19900 || paid.status !== 'DONE') return reply({ ok: false, error: '결제를 확인하지 못했습니다. 같은 페이지에서 다시 확인하거나 고객 지원에 문의해주세요.' });
      state.paidAt = paid.approvedAt || new Date().toISOString();
      state.paymentKey = paid.paymentKey;
      state.code = generateLicenseCode();
      state.nextPaymentDate = new Date(new Date(state.paidAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      persist();
    }
    var licenseSheet = getSheet();
    var headers = ensureHeaders(licenseSheet);
    var codeCol = findColumnIndex(headers, 'code');
    var platformCol = findColumnIndex(headers, 'platform');
    var typeCol = findColumnIndex(headers, 'type');
    var usedCol = findColumnIndex(headers, 'used');
    var customDaysCol = findColumnIndex(headers, 'customDays');
    if (!codeCol || !platformCol || !typeCol || !usedCol || !customDaysCol) throw new Error('license columns missing');
    var licenses = licenseSheet.getDataRange().getValues();
    var found = false;
    for (var j = 1; j < licenses.length; j++) if (String(licenses[j][codeCol - 1]) === state.code) found = true;
    if (!found) {
      var licenseRow = [];
      for (var h = 0; h < headers.length; h++) licenseRow.push('');
      licenseRow[codeCol - 1] = state.code; licenseRow[platformCol - 1] = 'LEWORD';
      licenseRow[typeCol - 1] = 'CUSTOM'; licenseRow[usedCol - 1] = false; licenseRow[customDaysCol - 1] = 30;
      licenseSheet.appendRow(licenseRow);
      SpreadsheetApp.flush();
    }
    var orderSheet = getOrderSheet();
    var orders = orderSheet.getDataRange().getValues();
    var orderFound = false;
    for (var o = 1; o < orders.length; o++) if (String(orders[o][0]) === state.orderId) orderFound = true;
    if (!orderFound) {
      orderSheet.appendRow([state.orderId, state.paymentKey || '', 19900, email, 'leword-monthly', 'LEWORD 1개월 정기구독', state.code, 'completed', state.paidAt]);
      SpreadsheetApp.flush();
    }
    props.setProperty(receiptKey, authHash);
    subSheet.appendRow([customerKey, email, state.billingKey, 'leword-monthly', 'LEWORD 1개월 정기구독', 19900, state.nextPaymentDate, 'active', 0, state.code, state.paidAt, '', state.paidAt]);
    SpreadsheetApp.flush();
    props.deleteProperty(emailPendingKey);
    try { props.deleteProperty(stateKey); } catch (cleanupErr) { /* Subscription row is now authoritative. */ }
    var emailSent = false;
    try { sendLicenseEmail(email, state.code, 'LEWORD 1개월 정기구독', 'LEWORD'); emailSent = true; } catch (mailErr) { Logger.log('[LEWORD monthly] receipt email pending'); }
    return reply({ ok: true, code: state.code, product: 'LEWORD 1개월 정기구독', nextPaymentDate: state.nextPaymentDate, emailSent: emailSent });
  } catch (err) {
    Logger.log('[LEWORD monthly] confirmation incomplete');
    return reply({ ok: false, error: '결제 결과 확인 중입니다. 다시 구매하지 말고 같은 페이지에서 확인해주세요.' });
  } finally { lock.releaseLock(); }
}
`;
