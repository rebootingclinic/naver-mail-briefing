const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'briefings.db'));

db.exec(`
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

module.exports = db;
