// src/models/user.model.js
import bcrypt from "bcryptjs";
import { getDb, initDb } from "./db.js";

export async function createUser({ name, email, password }) {
  await initDb();
  const db = await getDb();

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await db.run(
    `
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `,
    [name.trim(), email.toLowerCase().trim(), passwordHash]
  );

  return {
    id: result.lastID,
    name,
    email: email.toLowerCase().trim(),
  };
}

export async function findUserByEmail(email) {
  await initDb();
  const db = await getDb();

  const user = await db.get(
    `SELECT * FROM users WHERE email = ?`,
    [email.toLowerCase().trim()]
  );

  return user || null;
}

export async function findUserById(id) {
  await initDb();
  const db = await getDb();
  const user = await db.get(`SELECT * FROM users WHERE id = ?`, [id]);
  return user || null;
}

export async function updateUserPassword(userId, newPassword) {
  await initDb();
  const db = await getDb();

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.run(
    `
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    [passwordHash, userId]
  );
}

export async function setResetToken(userId, token, expiresAt) {
  await initDb();
  const db = await getDb();

  await db.run(
    `
      UPDATE users
      SET reset_token = ?, reset_token_expires_at = ?
      WHERE id = ?
    `,
    [token, expiresAt, userId]
  );
}

export async function findUserByResetToken(token) {
  await initDb();
  const db = await getDb();

  const user = await db.get(
    `
      SELECT * FROM users
      WHERE reset_token = ?
        AND reset_token_expires_at IS NOT NULL
        AND datetime(reset_token_expires_at) > datetime('now')
    `,
    [token]
  );

  return user || null;
}

export async function clearResetToken(userId) {
  await initDb();
  const db = await getDb();

  await db.run(
    `
      UPDATE users
      SET reset_token = NULL,
          reset_token_expires_at = NULL
      WHERE id = ?
    `,
    [userId]
  );
}

export async function updateUserProfile(userId, { name, email }) {
  await initDb();
  const db = await getDb();

  await db.run(
    `
      UPDATE users
      SET name = ?, email = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    [name.trim(), email.toLowerCase().trim(), userId]
  );
}
