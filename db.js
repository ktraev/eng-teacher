// Simple local database: stores folders in a JSON file on your computer.
// Location: ./data/folders.json (override with DATA_DIR in .env).
// Writes are atomic (temp file + rename) and serialized so the file can't corrupt.
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

const DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DIR, 'folders.json');

let data = [];
let ready = init();
let writing = Promise.resolve();

async function init() {
  await fs.mkdir(DIR, { recursive: true });
  try { data = JSON.parse(await fs.readFile(FILE, 'utf8')); }
  catch { data = []; }
  if (!Array.isArray(data)) data = [];
}

function persist() {
  // chain writes so two saves never overlap
  writing = writing.then(async () => {
    const tmp = FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, FILE);
  });
  return writing;
}

export async function listFolders() {
  await ready;
  return data.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export async function createFolder({ name, words }) {
  await ready;
  const folder = { id: randomUUID(), name, words: words || [], lastScore: null, createdAt: Date.now() };
  data.push(folder);
  await persist();
  return folder;
}

export async function updateFolder(id, patch) {
  await ready;
  const f = data.find(x => x.id === id);
  if (!f) return null;
  if (patch.name !== undefined) f.name = patch.name;
  if (patch.words !== undefined) f.words = patch.words;
  if (patch.lastScore !== undefined) f.lastScore = patch.lastScore;
  await persist();
  return f;
}

export async function deleteFolder(id) {
  await ready;
  data = data.filter(x => x.id !== id);
  await persist();
}
