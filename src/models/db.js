// src/models/db.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";

sqlite3.verbose();

let dbPromise = null;
let initialized = false;

// Abre (ou cria) o arquivo auth.db dentro da pasta /data
export function getDb() {
  if (!dbPromise) {
    dbPromise = open({
      filename: "./data/auth.db",
      driver: sqlite3.Database,
    });
  }
  return dbPromise;
}

// Cria as tabelas se ainda não existirem
export async function initDb() {
  if (initialized) return;

  const db = await getDb();

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      reset_token TEXT,
      reset_token_expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      device_info TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  initialized = true;
}
