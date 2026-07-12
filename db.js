// Folder storage.
//
//  - If DATABASE_URL is set  -> Postgres (persistent; use this on Render).
//  - Otherwise               -> a local JSON file on your computer (data/folders.json).
//
// Both backends expose the same four functions, so the rest of the app doesn't care.
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

export const listFolders  = ()          => backend.list();
export const createFolder = (folder)    => backend.create(folder);
export const updateFolder = (id, patch) => backend.update(id, patch);
export const deleteFolder = (id)        => backend.remove(id);

// ---------------------------------------------------------------------------
// Postgres (Neon, Supabase, Render Postgres, ...)
// ---------------------------------------------------------------------------
async function postgresBackend(connectionString) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },   // hosted Postgres requires SSL
    max: 5,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      name       TEXT   NOT NULL,
      words      JSONB  NOT NULL,
      last_score JSONB,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`);

  console.log('  Database: Postgres (persistent)');

  const asJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const toFolder = (r) => ({
    id: r.id,
    name: r.name,
    words: asJson(r.words) || [],
    lastScore: r.last_score ? asJson(r.last_score) : null,
    createdAt: Number(r.created_at),
  });

  return {
    async list() {
      const { rows } = await pool.query('SELECT * FROM folders ORDER BY created_at DESC');
      return rows.map(toFolder);
    },
    async create({ name, words }) {
      const now = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO folders (id, name, words, last_score, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [randomUUID(), name, JSON.stringify(words || []), null, now, now]
      );
      return toFolder(rows[0]);
    },
    async update(id, patch) {
      const { rows: found } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
      if (!found.length) return null;
      const cur = toFolder(found[0]);
      const name      = patch.name      !== undefined ? patch.name      : cur.name;
      const words     = patch.words     !== undefined ? patch.words     : cur.words;
      const lastScore = patch.lastScore !== undefined ? patch.lastScore : cur.lastScore;
      const { rows } = await pool.query(
        `UPDATE folders SET name = $1, words = $2, last_score = $3, updated_at = $4
         WHERE id = $5 RETURNING *`,
        [name, JSON.stringify(words), lastScore ? JSON.stringify(lastScore) : null, Date.now(), id]
      );
      return toFolder(rows[0]);
    },
    async remove(id) {
      await pool.query('DELETE FROM folders WHERE id = $1', [id]);
    },
  };
}

// ---------------------------------------------------------------------------
// Local JSON file (used when DATABASE_URL is not set)
// ---------------------------------------------------------------------------
async function fileBackend() {
  await fs.mkdir(DIR, { recursive: true });
  let data = [];
  try { data = JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { data = []; }
  if (!Array.isArray(data)) data = [];

  console.log(`  Database: local file (${FILE})`);

  let writing = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      const tmp = FILE + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      try { await fs.copyFile(FILE, FILE + '.bak'); } catch {}
      await fs.rename(tmp, FILE);
    });
    return writing;
  };

  return {
    async list() {
      return data.slice().sort((a, b) => b.createdAt - a.createdAt);
    },
    async create({ name, words }) {
      const folder = { id: randomUUID(), name, words: words || [], lastScore: null, createdAt: Date.now() };
      data.push(folder);
      await persist();
      return folder;
    },
    async update(id, patch) {
      const f = data.find((x) => x.id === id);
      if (!f) return null;
      if (patch.name      !== undefined) f.name      = patch.name;
      if (patch.words     !== undefined) f.words     = patch.words;
      if (patch.lastScore !== undefined) f.lastScore = patch.lastScore;
      await persist();
      return f;
    },
    async remove(id) {
      data = data.filter((x) => x.id !== id);
      await persist();
    },
  };
}
