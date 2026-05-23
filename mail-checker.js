require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const SENDER = 'ch-aide@aidepartners.com';
const PDF_DIR = path.join(__dirname, 'pdfs');

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR);

async function checkMail() {
  console.log(`[${new Date().toLocaleString('ko-KR')}] 메일 확인 시작...`);

  if (!process.env.NAVER_EMAIL || !process.env.NAVER_PASSWORD) {
    console.error('NAVER_EMAIL / NAVER_PASSWORD 환경변수가 없습니다.');
    return { newCount: 0 };
  }

  const client = new ImapFlow({
    host: 'imap.naver.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.NAVER_EMAIL,
      pass: process.env.NAVER_PASSWORD,
    },
    logger: false,
  });

  let newCount = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const messages = client.fetch(
        { from: SENDER },
        { uid: true, envelope: true, source: true }
      );

      for await (const msg of messages) {
        const uid = String(msg.uid);

        // 이미 저장된 메일은 건너뜀
        const exists = db.prepare('SELECT id FROM briefings WHERE uid = ?').get(uid);
        if (exists) continue;

        const subject = msg.envelope?.subject || '(제목 없음)';
        const mailDate = msg.envelope?.date
          ? new Date(msg.envelope.date).toLocaleString('ko-KR')
          : '날짜 미상';

        const parsed = await simpleParser(msg.source);
        const pdfs = (parsed.attachments || []).filter(
          (a) => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
        );

        if (pdfs.length === 0) continue;

        for (const pdf of pdfs) {
          const safeName = (pdf.filename || `attachment_${uid}.pdf`).replace(/[\\/:*?"<>|]/g, '_');
          const filePath = path.join(PDF_DIR, safeName);
          fs.writeFileSync(filePath, pdf.content);

          // PDF 텍스트 추출
          let pdfContent = '';
          try {
            const data = await pdfParse(pdf.content);
            pdfContent = data.text.trim();
          } catch (e) {
            pdfContent = '(PDF 텍스트 추출 실패)';
          }

          // DB 저장
          db.prepare(`
            INSERT OR IGNORE INTO briefings (uid, subject, sender, mail_date, pdf_filename, pdf_content)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(uid, subject, SENDER, mailDate, safeName, pdfContent);

          console.log(`[저장] ${subject} - ${safeName}`);
          newCount++;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[오류]', err.message);
  }

  console.log(`[완료] 새 브리핑 ${newCount}건 저장`);
  return { newCount };
}

module.exports = { checkMail };
