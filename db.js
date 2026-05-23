const { createClient } = require('@libsql/client');
const path = require('path');

const db = createClient({
  url: process.env.DATABASE_URL || `file:${path.join(__dirname, 'briefings.db')}`,
});

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT UNIQUE,
      subject TEXT,
      sender TEXT,
      mail_date TEXT,
      pdf_filename TEXT,
      pdf_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS kakao_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_token TEXT,
      refresh_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
}

async function getSetting(key) {
  const result = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
  return result.rows[0]?.value || null;
}

async function setSetting(key, value) {
  await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    args: [key, value],
  });
}

module.exports = { db, initDb, getSetting, setSetting };
