/**
 * 네이버 메일 PDF 브리핑 스크립트
 * ch-aide@aidepartners.com 발신 메일에서 PDF를 추출합니다.
 */

require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const SENDER = 'ch-aide@aidepartners.com';
const PDF_DIR = path.join(__dirname, 'pdfs');
const PROCESSED_FILE = path.join(__dirname, 'processed.json');

// 이미 처리한 메일 UID 목록 로드
function loadProcessed() {
  if (fs.existsSync(PROCESSED_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8')));
  }
  return new Set();
}

// 처리 완료 UID 저장
function saveProcessed(uids) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...uids]), 'utf8');
}

async function checkMail() {
  if (!process.env.NAVER_EMAIL || !process.env.NAVER_PASSWORD) {
    console.error('[오류] .env 파일에 NAVER_EMAIL과 NAVER_PASSWORD를 설정해주세요.');
    process.exit(1);
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

  const processed = loadProcessed();
  const results = [];

  try {
    await client.connect();
    console.log('[연결] 네이버 메일 IMAP 연결 성공');

    const lock = await client.getMailboxLock('INBOX');

    try {
      // 발신자로 검색
      const messages = client.fetch(
        { from: SENDER },
        { uid: true, envelope: true, bodyStructure: true, source: true }
      );

      for await (const msg of messages) {
        const uid = String(msg.uid);
        const subject = msg.envelope?.subject || '(제목 없음)';
        const date = msg.envelope?.date
          ? new Date(msg.envelope.date).toLocaleDateString('ko-KR')
          : '날짜 미상';

        if (processed.has(uid)) continue; // 이미 처리된 메일 건너뜀

        // 메일 파싱
        const parsed = await simpleParser(msg.source);
        const attachments = parsed.attachments || [];
        const pdfs = attachments.filter(
          (a) => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
        );

        if (pdfs.length === 0) {
          processed.add(uid);
          continue;
        }

        const savedFiles = [];
        for (const pdf of pdfs) {
          const safeName = pdf.filename
            ? pdf.filename.replace(/[\\/:*?"<>|]/g, '_')
            : `attachment_${uid}.pdf`;

          // 날짜 접두사 추가 (중복 방지)
          const fileName = `${date.replace(/\./g, '-')}_${safeName}`;
          const filePath = path.join(PDF_DIR, fileName);
          fs.writeFileSync(filePath, pdf.content);
          savedFiles.push(filePath);
          console.log(`[저장] ${fileName}`);
        }

        results.push({ uid, subject, date, files: savedFiles });
        processed.add(uid);
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[오류]', err.message);
    process.exit(1);
  }

  saveProcessed(processed);

  // 결과 출력 (JSON → Claude가 읽음)
  if (results.length === 0) {
    console.log('[결과] 새로운 PDF 메일이 없습니다.');
  } else {
    console.log('[결과] 새 PDF 발견:');
    results.forEach((r) => {
      console.log(`  - [${r.date}] ${r.subject}`);
      r.files.forEach((f) => console.log(`    파일: ${f}`));
    });

    // Claude가 읽을 JSON 출력
    console.log('\n__BRIEFING_TARGET__');
    console.log(JSON.stringify(results, null, 2));
  }
}

checkMail();
