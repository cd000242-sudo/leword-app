/** Dedicated renewal implementation: only receipts from the new 19,900 plan qualify. */
module.exports = String.raw`
function isManagedLewordMonthly_(row) {
  return String(row[3]) === 'leword-monthly' && Number(row[5]) === 19900 && !!PropertiesService.getScriptProperties().getProperty('LEWORD_MONTHLY_RECEIPT_' + String(row[0]));
}
function ensureLewordMonthlyRenewalTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) if (triggers[i].getHandlerFunction() === 'processLewordMonthlyRenewals') return;
  ScriptApp.newTrigger('processLewordMonthlyRenewals').timeBased().everyDays(1).atHour(2).create();
}
function processLewordMonthlyRenewals() {
  var rows = getSubscriptionSheet().getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (isManagedLewordMonthly_(rows[i])) renewLewordMonthly_(String(rows[i][0]));
}
function renewLewordMonthly_(customerKey) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, pending: true };
  try {
    var sheet = getSubscriptionSheet();
    var rows = sheet.getDataRange().getValues();
    var at = -1;
    for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === customerKey) { at = i; break; }
    if (at < 0) return { ok: false };
    var row = rows[at];
    if (!isManagedLewordMonthly_(row)) return { ok: false, skipped: true };
    var due = new Date(row[6]);
    if (isNaN(due.getTime()) || due.getTime() > Date.now()) return { ok: true, skipped: true };
    var props = PropertiesService.getScriptProperties();
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, customerKey + '|' + due.toISOString(), Utilities.Charset.UTF_8);
    var hex = digest.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    var orderId = 'LMR-' + hex.slice(0, 40);
    var stateKey = 'LEWORD_RENEW_' + orderId;
    var raw = props.getProperty(stateKey);
    var state = raw ? JSON.parse(raw) : { startedAt: new Date().toISOString() };
    var save = function () { props.setProperty(stateKey, JSON.stringify(state)); };
    if (String(row[7]) !== 'active' && !state.paidAt) {
      if (!raw) return { ok: false, skipped: true };
      // Cancellation forbids another charge, but a timed-out charge may already have succeeded.
      var lookup = UrlFetchApp.fetch('https://api.tosspayments.com/v1/payments/orders/' + orderId, {
        method: 'get', headers: { Authorization: 'Basic ' + Utilities.base64Encode(getTossSecretKey() + ':') }, muteHttpExceptions: true
      });
      var settled = JSON.parse(lookup.getContentText());
      if (lookup.getResponseCode() !== 200 || settled.orderId !== orderId || Number(settled.totalAmount) !== 19900 || settled.status !== 'DONE') return { ok: false, pending: true };
      state.paidAt = settled.approvedAt || new Date().toISOString();
      state.paymentKey = settled.paymentKey;
      state.nextPaymentDate = new Date(new Date(state.paidAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      save();
    }
    if (!state.paidAt) {
      if (Date.now() - new Date(state.startedAt).getTime() > 7 * 24 * 60 * 60 * 1000) return { ok: false, pending: true };
      save();
      var response = UrlFetchApp.fetch('https://api.tosspayments.com/v1/billing/' + String(row[2]), {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Basic ' + Utilities.base64Encode(getTossSecretKey() + ':'), 'Idempotency-Key': orderId },
        payload: JSON.stringify({ customerKey: customerKey, amount: 19900, orderId: orderId, orderName: 'LEWORD 1개월 정기구독 갱신', customerEmail: String(row[1]) }), muteHttpExceptions: true
      });
      var payment = JSON.parse(response.getContentText());
      var httpStatus = response.getResponseCode();
      if (httpStatus !== 200 || payment.orderId !== orderId || Number(payment.totalAmount) !== 19900 || payment.status !== 'DONE') {
        if (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429) {
          var failedRow = sheet.getDataRange().getValues()[at].slice();
          if (String(failedRow[0]) !== customerKey) throw new Error('subscription row moved');
          if (String(failedRow[7]) === 'active') {
            failedRow[8] = (Number(failedRow[8]) || 0) + 1;
            if (failedRow[8] >= 3) { failedRow[7] = 'expired'; failedRow[11] = new Date().toISOString(); }
            sheet.getRange(at + 1, 1, 1, row.length).setValues([failedRow]);
            SpreadsheetApp.flush();
          }
        }
        return { ok: false, pending: true };
      }
      state.paidAt = payment.approvedAt || new Date().toISOString();
      state.paymentKey = payment.paymentKey;
      state.nextPaymentDate = new Date(new Date(state.paidAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      save();
    }
    var licenseSheet = getSheet();
    var headers = ensureHeaders(licenseSheet);
    var codeCol = findColumnIndex(headers, 'code');
    var platformCol = findColumnIndex(headers, 'platform');
    var expiryCol = findColumnIndex(headers, 'expiresAt');
    if (!codeCol || !platformCol || !expiryCol) throw new Error('license schema missing');
    var licenses = licenseSheet.getDataRange().getValues();
    var licenseAt = -1;
    for (var j = 1; j < licenses.length; j++) if (String(licenses[j][codeCol - 1]) === String(row[9]) && String(licenses[j][platformCol - 1]) === 'LEWORD') { licenseAt = j; break; }
    if (licenseAt < 0) throw new Error('paid license not found');
    var oldExpiry = new Date(licenses[licenseAt][expiryCol - 1]).getTime();
    var nextExpiry = new Date(state.nextPaymentDate).getTime();
    if (!isFinite(oldExpiry) || oldExpiry < nextExpiry) {
      licenseSheet.getRange(licenseAt + 1, expiryCol).setValue(new Date(state.nextPaymentDate));
      SpreadsheetApp.flush();
    }
    var orderSheet = getOrderSheet();
    var orders = orderSheet.getDataRange().getValues();
    var found = false;
    for (var o = 1; o < orders.length; o++) if (String(orders[o][0]) === orderId) found = true;
    if (!found) {
      orderSheet.appendRow([orderId, state.paymentKey || '', 19900, String(row[1]), 'leword-monthly', 'LEWORD 1개월 정기구독 갱신', String(row[9]), 'completed', state.paidAt]);
      SpreadsheetApp.flush();
    }
    var nextRow = sheet.getDataRange().getValues()[at].slice();
    if (String(nextRow[0]) !== customerKey) throw new Error('subscription row moved');
    nextRow[6] = state.nextPaymentDate; nextRow[8] = 0; nextRow[12] = state.paidAt;
    sheet.getRange(at + 1, 1, 1, row.length).setValues([nextRow]);
    SpreadsheetApp.flush();
    props.deleteProperty(stateKey);
    return { ok: true, nextPaymentDate: state.nextPaymentDate };
  } catch (err) {
    Logger.log('[LEWORD monthly renewal] confirmation incomplete');
    return { ok: false, pending: true };
  } finally { lock.releaseLock(); }
}
`;
