import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  OPENAI_API_KEY,
  OCR_MODEL = 'gpt-4o',
  CHAT_MODEL = 'gpt-4o',
  STT_MODEL = 'whisper-1',
  TTS_MODEL = 'tts-1',
  TTS_VOICE = 'nova',
  PORT = 3000,
} = process.env;

if (!OPENAI_API_KEY) {
  console.error('\nMissing OPENAI_API_KEY. Copy .env.example to .env and add your key.\n');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dirname, 'public')));

// Small helper: pull JSON out of a model reply even if it wraps it in prose/fences.
function parseJson(text) {
  if (!text) throw new Error('Empty model response');
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const startArr = cleaned.indexOf('[');
    const s = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (s !== -1 && end !== -1) return JSON.parse(cleaned.slice(s, end + 1));
    throw new Error('Could not parse JSON from model');
  }
}

// ---------------------------------------------------------------------------
// 1. OCR + validation of the photographed word lists
// ---------------------------------------------------------------------------
app.post('/api/ocr', upload.array('photos', 8), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No photos uploaded.' });

    const imageParts = req.files.map((f) => ({
      type: 'image_url',
      image_url: { url: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`, detail: 'high' },
    }));

    const system = `You read photos of a child's English-vocabulary study sheets.
Each sheet lists English words with their Bulgarian translation(s).
For every entry you find:
1. Read the English word and every Bulgarian meaning written next to it.
2. Correct obvious spelling mistakes in the English word AND in the Bulgarian.
3. If the child's written English spelling looks wrong, OR a Bulgarian translation looks wrong or does not actually match the English word, add a short warning (written in Bulgarian) explaining the issue. Do NOT invent problems where the pair is fine.
Return STRICT JSON only, no prose, in this exact shape:
{
  "words": [
    { "english": "run", "meanings": ["тичам", "бягам"], "warnings": ["..."] }
  ]
}
"warnings" is an array (empty [] if the entry is fine). Merge duplicate English words into one entry. Keep meanings deduplicated.`;

    const resp = await openai.chat.completions.create({
      model: OCR_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Here are the photo(s) of the vocabulary sheet(s). Extract and validate every word.' },
            ...imageParts,
          ],
        },
      ],
    });

    const data = parseJson(resp.choices[0].message.content);
    const words = (data.words || [])
      .filter((w) => w.english && Array.isArray(w.meanings) && w.meanings.length)
      .map((w) => ({
        english: String(w.english).trim(),
        meanings: w.meanings.map((m) => String(m).trim()).filter(Boolean),
        warnings: Array.isArray(w.warnings) ? w.warnings.filter(Boolean) : [],
      }));

    res.json({ words });
  } catch (err) {
    console.error('OCR error:', err.message);
    res.status(500).json({ error: 'Could not read the photos. ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. Text to speech (speak the English word / the Bulgarian feedback)
// ---------------------------------------------------------------------------
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: 'No text.' });
    const speech = await openai.audio.speech.create({
      model: TTS_MODEL,
      voice: voice || TTS_VOICE,
      input: text,
      response_format: 'mp3',
    });
    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. Speech to text (transcribe what she said)
// ---------------------------------------------------------------------------
app.post('/api/stt', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio.' });
    const lang = req.body.lang || 'bg';
    const file = await toFile(req.file.buffer, 'answer.webm', { type: req.file.mimetype || 'audio/webm' });
    const tr = await openai.audio.transcriptions.create({
      file,
      model: STT_MODEL,
      language: lang,
    });
    res.json({ text: (tr.text || '').trim() });
  } catch (err) {
    console.error('STT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Check her spoken Bulgarian meanings against the known list
// ---------------------------------------------------------------------------
app.post('/api/check', async (req, res) => {
  try {
    const { english, meanings, answer } = req.body;
    if (!english || !answer) return res.status(400).json({ error: 'Missing data.' });

    const system = `You are a warm, encouraging English teacher testing a Bulgarian child.
You said an English word out loud. The child answered (in Bulgarian) with what she thinks it means.
Her spoken answer was transcribed by speech-to-text, so expect small transcription noise; judge by meaning, not exact spelling.
Compare her answer to the correct Bulgarian meanings.
IMPORTANT — accept synonyms: a meaning counts as CORRECT if she says ANY Bulgarian word or phrase with the same sense, even if it is not the exact word written on the sheet (e.g. "щастлив" for "радостен", "голям" for "едър"). Also accept different grammatical forms (verb aspect, gender, plural). Only treat a meaning as missed if she gave no equivalent for it at all.
Decide:
- "correct" = she covered ALL the important meanings (exact words OR valid synonyms) with no wrong ones.
- "incorrect" = she missed a meaning entirely, or gave a meaning that is genuinely wrong.
Reply in STRICT JSON only:
{
  "status": "correct" | "incorrect",
  "missed": ["meanings she did not cover, not even with a synonym"],
  "wrong": ["things she said that are genuinely wrong"],
  "feedback": "one short, kind sentence to the child, in Bulgarian"
}`;

    const user = `English word: "${english}"
Correct Bulgarian meanings: ${JSON.stringify(meanings)}
Child's spoken answer (Bulgarian): "${answer}"`;

    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const result = parseJson(resp.choices[0].message.content);
    res.json({
      status: result.status === 'correct' ? 'correct' : 'incorrect',
      missed: Array.isArray(result.missed) ? result.missed : [],
      wrong: Array.isArray(result.wrong) ? result.wrong : [],
      feedback: result.feedback || '',
    });
  } catch (err) {
    console.error('Check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. Generate Bulgarian sentences for the final translation exercise
// ---------------------------------------------------------------------------
app.post('/api/sentences', async (req, res) => {
  try {
    const { words, count = 5 } = req.body;
    if (!Array.isArray(words) || !words.length) return res.status(400).json({ error: 'No words.' });

    const system = `You are an English teacher for a Bulgarian child.
Given a list of English words she just practised, write short, simple Bulgarian sentences.
Each sentence, when translated to English, should naturally use one or more of the given words.
Keep them age-appropriate and easy. Return STRICT JSON only:
{ "sentences": [ { "bg": "Bulgarian sentence", "targets": ["english words expected in the translation"] } ] }`;

    const user = `Words she practised: ${JSON.stringify(words)}
Make ${count} sentences.`;

    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const data = parseJson(resp.choices[0].message.content);
    const sentences = (data.sentences || [])
      .filter((s) => s.bg)
      .map((s) => ({ bg: String(s.bg).trim(), targets: Array.isArray(s.targets) ? s.targets : [] }));
    res.json({ sentences });
  } catch (err) {
    console.error('Sentences error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. Check her English translation of a Bulgarian sentence
// ---------------------------------------------------------------------------
app.post('/api/check-translation', async (req, res) => {
  try {
    const { bg, answer } = req.body;
    if (!bg || !answer) return res.status(400).json({ error: 'Missing data.' });

    const system = `You are a warm English teacher for a Bulgarian child.
She translated a Bulgarian sentence into English (transcribed by speech-to-text, so ignore small transcription noise).
Judge whether her English conveys the meaning correctly. Minor grammar slips are OK but mention them gently.
Reply in STRICT JSON only:
{
  "status": "correct" | "incorrect",
  "correctTranslation": "a natural English translation",
  "feedback": "one short kind sentence in Bulgarian telling her how she did"
}`;

    const user = `Bulgarian sentence: "${bg}"
Her English translation: "${answer}"`;

    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const result = parseJson(resp.choices[0].message.content);
    res.json({
      status: result.status === 'correct' ? 'correct' : 'incorrect',
      correctTranslation: result.correctTranslation || '',
      feedback: result.feedback || '',
    });
  } catch (err) {
    console.error('Translation check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  English teacher running at http://localhost:${PORT}\n`);
});
