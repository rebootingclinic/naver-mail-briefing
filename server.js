require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { db, initDb, getSetting, setSetting } = require('./db');
const { checkMail } = require('./mail-checker');
const { getAuthUrl, getTokens, saveTokens } = require('./kakao');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// 메인 페이지
app.get('/', async (req, res) => {
  const result = await db.execute(`
    SELECT id, subject, sender, mail_date, pdf_filename, created_at,
           SUBSTR(pdf_content, 1, 300) AS preview
    FROM briefings ORDER BY created_at DESC
  `);
  const kakaoResult = await db.execute('SELECT id FROM kakao_tokens LIMIT 1');
  const kakaoConnected = kakaoResult.rows.length > 0;
  res.render('index', { briefings: result.rows, query: req.query, kakaoConnected });
});

// 브리핑 상세
app.get('/briefing/:id', async (req, res) => {
  const result = await db.execute({ sql: 'SELECT * FROM briefings WHERE id = ?', args: [req.params.id] });
  if (result.rows.length === 0) return res.status(404).send('브리핑을 찾을 수 없습니다.');
  res.render('detail', { briefing: result.rows[0] });
});

// 수동 메일 확인
app.post('/check', async (req, res) => {
  const result = await checkMail();
  res.redirect('/?checked=1&new=' + result.newCount);
});

// 설정 페이지
app.get('/settings', async (req, res) => {
  const kakaoKey = await getSetting('kakao_rest_key') || '';
  const tokenResult = await db.execute('SELECT access_token, refresh_token FROM kakao_tokens LIMIT 1');
  const accessToken = tokenResult.rows[0]?.access_token || '';
  const refreshToken = tokenResult.rows[0]?.refresh_token || '';
  res.render('settings', { kakaoKey, accessToken, refreshToken, query: req.query });
});

// 설정 저장
app.post('/settings', async (req, res) => {
  const { kakao_rest_key, kakao_access_token, kakao_refresh_token } = req.body;
  if (kakao_rest_key) await setSetting('kakao_rest_key', kakao_rest_key.trim());
  if (kakao_access_token) {
    await saveTokens(kakao_access_token.trim(), kakao_refresh_token?.trim() || null);
  }
  res.redirect('/settings?saved=1');
});

// 카카오 로그인 시작
app.get('/auth/kakao', async (req, res) => {
  const url = await getAuthUrl();
  res.redirect(url);
});

// 카카오 OAuth 콜백
app.get('/auth/kakao/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?kakao=error');
  try {
    const tokens = await getTokens(code);
    if (!tokens.access_token) return res.redirect('/?kakao=error');
    await saveTokens(tokens.access_token, tokens.refresh_token);
    res.redirect('/?kakao=success');
  } catch (e) {
    console.error('[카카오] 콜백 오류:', e.message);
    res.redirect('/?kakao=error');
  }
});

// 1시간마다 자동 확인
cron.schedule('0 * * * *', async () => {
  console.log('[자동확인] 1시간 주기 메일 체크');
  await checkMail();
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
    checkMail();
  });
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});
