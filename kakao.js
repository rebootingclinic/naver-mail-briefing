const { db, getSetting, setSetting } = require('./db');

const REDIRECT_URI = 'https://naver-mail-briefing-production.up.railway.app/auth/kakao/callback';

// 기본 하드코딩 키
const DEFAULT_REST_KEY = '35eb44058d00ea86a0745ecfd468b544';

async function getKey() {
  const fromDb = await getSetting('kakao_rest_key');
  return fromDb || DEFAULT_REST_KEY;
}

// 저장된 액세스 토큰 가져오기
async function getValidAccessToken() {
  // DB에 저장된 토큰 우선
  const tokens = await db.execute('SELECT * FROM kakao_tokens LIMIT 1');
  const stored = tokens.rows[0];

  if (!stored) return null;

  // 리프레시 토큰으로 갱신 시도
  if (stored.refresh_token) {
    try {
      const key = await getKey();
      const res = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: key,
          refresh_token: stored.refresh_token,
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        const newRefresh = data.refresh_token || stored.refresh_token;
        await saveTokens(data.access_token, newRefresh);
        return data.access_token;
      }
    } catch (e) {
      console.error('[카카오] 토큰 갱신 실패:', e.message);
    }
  }

  return stored.access_token;
}

// 토큰 저장
async function saveTokens(accessToken, refreshToken) {
  await db.execute('DELETE FROM kakao_tokens');
  await db.execute({
    sql: 'INSERT INTO kakao_tokens (access_token, refresh_token) VALUES (?, ?)',
    args: [accessToken, refreshToken || null],
  });
}

// 카카오 로그인 URL
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

module.exports = { getAuthUrl, getTokens, saveTokens, sendKakaoMessage };
