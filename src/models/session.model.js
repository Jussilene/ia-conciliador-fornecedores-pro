// src/models/session.model.js
import { getDb, initDb } from "./db.js";

export async function createSession(userId, token, deviceInfo) {
  await initDb();
  const db = await getDb();

  // Remove sessões antigas desse usuário (sessão única)
  await db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);

  const result = await db.run(
    `
      INSERT INTO sessions (user_id, token, device_info)
      VALUES (?, ?, ?)
    `,
    [userId, deviceInfo || null, token]
  );

  return {
    id: result.lastID,
    userId,
    token,
    deviceInfo,
  };
}

export async function getSessionByToken(token) {
  await initDb();
  const db = await getDb();

  const session = await db.get(
    `
      SELECT s.*, u.name AS user_name, u.email AS user_email
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `,
    [token]
  );

  return session || null;
}

export async function deleteSessionByToken(token) {
  await initDb();
  const db = await getDb();
  await db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
}

export async function deleteSessionsByUser(userId) {
  await initDb();
  const db = await getDb();
  await db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
}

export async function touchSession(token) {
  // Atualiza last_seen_at pra saber se está ativo
  await initDb();
  const db = await getDb();
  await db.run(
    `
      UPDATE sessions
      SET last_seen_at = datetime('now')
      WHERE token = ?
    `,
    [token]
  );
}
