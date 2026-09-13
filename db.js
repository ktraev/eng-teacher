// Folder + user storage.
//
//  - If DATABASE_URL is set  -> Postgres (persistent; use this on Render).
//  - Otherwise               -> a local JSON file on your computer (data/folders.json).
//
// Folders are scoped to a user. The FIRST user created claims any pre-existing
// folders that have no owner (so your original folders move to your new account).
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DATA_DIR || join(APP_DIR, 'data');
const FILE = join(DIR, 'folders.json');

const backend = process.env.DATABASE_URL
  ? await postgresBackend(process.env.DATABASE_URL)
  : await fileBackend();

// users
export const createUser     = (u)              => backend.createUser(u);
export const getUserByEmail = (email)          => backend.getUserByEmail(email);
export const getUserById    = (id)             => backend.getUserById(id);

// folders (all scoped to a userId)
export const listFolders  = (userId)           => backend.list(userId);
export const createFolder = (userId, folder)   => backend.create(userId, folder);
export const updateFolder = (userId, id, patch)=> backend.update(userId, id, patch);
export const deleteFolder = (userId, id)       => backend.remove(userId, id);

// ---------------------------------------------------------------------------
// Postgres (Neon, Supabase, Render Postgres, ...)
// ---------------------------------------------------------------------------
async function postgresBackend(connectionString) {
  const { default: pg } = await import('pg');

  let host = '(could not parse)';
  try { host = new URL(connectionString).hostname; } catch {}

  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    BIGINT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id         TEXT PRIMARY KEY,
        name       TEXT   NOT NULL,
        words      JSONB  NOT NULL,
        last_score JSONB,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`);
    await pool.query(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS user_id TEXT`);
    console.log(`  Database: Postgres (persistent) @ ${host}`);
  } catch (err) {
    const masked = connectionString.replace(/(:\/\/[^:@/]*:)[^@]*(@)/, '$1***$2');
    console.error('\n  ✗ DATABASE ERROR — could not connect to Postgres.');
    console.error(`    Parsed host: "${host}"`);
    console.error(`    Reason: ${err.message}`);
    console.error(`    DATABASE_URL seen: ${JSON.stringify(masked)}`);
    console.error('    It must be ONLY the URL, e.g.:');
    console.error('    postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require\n');
  }

  const asJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const toFolder = (r) => ({
    id: r.id, name: r.name, words: asJson(r.words) || [],
    lastScore: r.last_score ? asJson(r.last_score) : null, createdAt: Number(r.created_at),
  });

  return {
    async createUser({ email, passwordHash }) {
      const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
      const isFirst = countRows[0].n === 0;
      const id = randomUUID();
      await pool.query(
        'INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)',
        [id, email, passwordHash, Date.now()]
      );
      if (isFirst) {
        const { rowCount } = await pool.query('UPDATE folders SET user_id = $1 WHERE user_id IS NULL', [id]);
        if (rowCount) console.log(`  Claimed ${rowCount} pre-existing folder(s) for first user ${email}`);
      }
      return { id, email };
    },
    async getUserByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return rows[0] ? { id: rows[0].id, email: rows[0].email, passwordHash: rows[0].password_hash } : null;
    },
    async getUserById(id) {
      const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async list(userId) {
      const { rows } = await pool.query(
        'SELECT * FROM folders WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      return rows.map(toFolder);
    },
    async create(userId, { name, words }) {
      const now = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO folders (id, name, words, last_score, created_at, updated_at, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [randomUUID(), name, JSON.stringify(words || []), null, now, now, userId]
      );
      return toFolder(rows[0]);
    },
    async update(userId, id, patch) {
      const { rows: found } = await pool.query(
        'SELECT * FROM folders WHERE id = $1 AND user_id = $2', [id, userId]);
      if (!found.length) return null;   // not found or not owned
      const cur = toFolder(found[0]);
      const name      = patch.name      !== undefined ? patch.name      : cur.name;
      const words     = patch.words     !== undefined ? patch.words     : cur.words;
      const lastScore = patch.lastScore !== undefined ? patch.lastScore : cur.lastScore;
      const { rows } = await pool.query(
        `UPDATE folders SET name = $1, words = $2, last_score = $3, updated_at = $4
         WHERE id = $5 AND user_id = $6 RETURNING *`,
        [name, JSON.stringify(words), lastScore ? JSON.stringify(lastScore) : null, Date.now(), id, userId]
      );
      return toFolder(rows[0]);
    },
    async remove(userId, id) {
      await pool.query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [id, userId]);
    },
  };
}

// ---------------------------------------------------------------------------
// Local JSON file (used when DATABASE_URL is not set)
// ---------------------------------------------------------------------------
async function fileBackend() {
  await fs.mkdir(DIR, { recursive: true });
  let store = { users: [], folders: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'));
    if (Array.isArray(parsed)) store = { users: [], folders: parsed };   // migrate old shape
    else store = { users: parsed.users || [], folders: parsed.folders || [] };
  } catch { /* fresh */ }

  console.log(`  Database: local file (${FILE})`);

  let writing = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      const tmp = FILE + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(store, null, 2));
      try { await fs.copyFile(FILE, FILE + '.bak'); } catch {}
      await fs.rename(tmp, FILE);
    });
    return writing;
  };

  return {
    async createUser({ email, passwordHash }) {
      const isFirst = store.users.length === 0;
      const user = { id: randomUUID(), email, passwordHash, createdAt: Date.now() };
      store.users.push(user);
      if (isFirst) {
        let claimed = 0;
        for (const f of store.folders) if (!f.userId) { f.userId = user.id; claimed++; }
        if (claimed) console.log(`  Claimed ${claimed} pre-existing folder(s) for first user ${email}`);
      }
      await persist();
      return { id: user.id, email: user.email };
    },
    async getUserByEmail(email) {
      const u = store.users.find((x) => x.email === email);
      return u ? { id: u.id, email: u.email, passwordHash: u.passwordHash } : null;
    },
    async getUserById(id) {
      const u = store.users.find((x) => x.id === id);
      return u ? { id: u.id, email: u.email } : null;
    },
    async list(userId) {
      return store.folders.filter((f) => f.userId === userId)
        .slice().sort((a, b) => b.createdAt - a.createdAt)
        .map(({ userId, ...f }) => f);
    },
    async create(userId, { name, words }) {
      const folder = { id: randomUUID(), name, words: words || [], lastScore: null, createdAt: Date.now(), userId };
      store.folders.push(folder);
      await persist();
      const { userId: _, ...out } = folder;
      return out;
    },
    async update(userId, id, patch) {
      const f = store.folders.find((x) => x.id === id && x.userId === userId);
      if (!f) return null;
      if (patch.name      !== undefined) f.name      = patch.name;
      if (patch.words     !== undefined) f.words     = patch.words;
      if (patch.lastScore !== undefined) f.lastScore = patch.lastScore;
      await persist();
      const { userId: _, ...out } = f;
      return out;
    },
    async remove(userId, id) {
      store.folders = store.folders.filter((x) => !(x.id === id && x.userId === userId));
      await persist();
    },
  };
}
