const { db, getSetting, setSetting } = require('./db');

const REDIRECT_URI = 'https://naver-mail-briefing-production.up.railway.app/auth/kakao/callback';

async function getKey() {
  return await getSetting('kakao_rest_key');
}

// 카카오 로그인 URL 생성
async function getAuthUrl() {
  const key = await getKey();
  const params = new URLSearchParams({
    client_id: key,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'talk_message',
  });
  return `https://kauth.kakao.com/oauth/authorize?${params}`;
}

// 인가 코드로 토큰 발급
async function getTokens(code) {
  const key = await getKey();
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: key,
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });
  return res.json();
}

// 토큰 갱신
async function refreshTokens(refreshToken) {
  const key = await getKey();
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: key,
      refresh_token: refreshToken,
    }),
  });
  return res.json();
}

// 저장된 토큰 불러오기
async function loadTokens() {
  const result = await db.execute('SELECT * FROM kakao_tokens LIMIT 1');
  return result.rows[0] || null;
}

// 토큰 저장
async function saveTokens(accessToken, refreshToken) {
  await db.execute('DELETE FROM kakao_tokens');
  await db.execute({
    sql: 'INSERT INTO kakao_tokens (access_token, refresh_token) VALUES (?, ?)',
    args: [accessToken, refreshToken],
  });
}

// 유효한 액세스 토큰 가져오기
async function getValidAccessToken() {
  const tokens = await loadTokens();
  if (!tokens) return null;
  try {
    const refreshed = await refreshTokens(tokens.refresh_token);
    if (refreshed.access_token) {
      const newRefresh = refreshed.refresh_token || tokens.refresh_token;
      await saveTokens(refreshed.access_token, newRefresh);
      return refreshed.access_token;
    }
  } catch (e) {
    console.error('[카카오] 토큰 갱신 실패:', e.message);
  }
  return tokens.access_token;
}

// 나에게 카카오톡 메시지 전송
async function sendKakaoMessage(subject, pdfFilename, mailDate) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.log('[카카오] 토큰 없음 — 알림 건너뜀');
    return;
  }
  const text = `📋 새 브리핑 도착!\n\n📅 ${mailDate}\n📄 ${subject}\n🗂 ${pdfFilename}\n\n👉 https://naver-mail-briefing-production.up.railway.app`;
  const template = JSON.stringify({
    object_type: 'text',
    text,
    link: {
      web_url: 'https://naver-mail-briefing-production.up.railway.app',
      mobile_web_url: 'https://naver-mail-briefing-production.up.railway.app',
    },
  });
  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ template_object: template }),
  });
  const data = await res.json();
  if (data.result_code === 0) {
    console.log('[카카오] 알림 전송 성공');
  } else {
    console.error('[카카오] 알림 전송 실패:', JSON.stringify(data));
  }
}

module.exports = { getAuthUrl, getTokens, saveTokens, sendKakaoMessage, setSetting };
