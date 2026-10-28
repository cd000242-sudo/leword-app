// 마지막 전송 시각·결과만 보여 준다. 쿠키 값은 다루지 않는다.
const RESULT_TEXT = {
  ok: '전송 성공',
  empty: '보낼 로그인 쿠키가 없습니다',
  'app-off': 'LEWORD 앱이 꺼져 있습니다 (다음 알람에 다시 시도)',
};

function render(last) {
  const at = document.getElementById('at');
  if (!last) { at.textContent = '마지막 전송: 아직 없음'; return; }
  at.textContent = '마지막 전송: ' + new Date(last.at).toLocaleString('ko-KR');
  document.getElementById('result').textContent =
    '결과: ' + (RESULT_TEXT[last.result] || (String(last.result).startsWith('http-') ? '앱이 거절했습니다 (' + last.result + ')' : last.result));
  if (typeof last.naverLogin === 'boolean') {
    document.getElementById('naver').textContent = '네이버: 로그인 쿠키 ' + (last.naverLogin ? '있음' : '없음');
    document.getElementById('toss').textContent = '토스: 쿠키 ' + (last.tossCount > 0 ? '있음' : '없음');
  }
}

chrome.storage.local.get('last').then((v) => render(v.last));
document.getElementById('now').addEventListener('click', async () => {
  document.getElementById('now').disabled = true;
  await chrome.runtime.sendMessage({ type: 'send-now' });
  render((await chrome.storage.local.get('last')).last);
  document.getElementById('now').disabled = false;
});
