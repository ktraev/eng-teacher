# English Teacher 📚

A voice vocabulary tutor for a Bulgarian-speaking child, powered by OpenAI.

**The flow**

*Screen 1 — Folders.* A list of saved word sets ("папки"). Each shows how many words it has and a coloured badge with her last error % so she can see which sets need more practice. Tap **＋ Нова папка** to make a new one.

*Screen 1b — Create/edit a folder.* Upload many page photos at once. GPT-4o reads (OCRs) them, checks English spelling and Bulgarian translations, and flags anything odd. The words appear in an editable table where she can fix, add, or delete entries. She gives the folder a name and saves it. (✏️ edits an existing folder, 🗑️ deletes one.)

*Screen 2 — Exercise.* Tap a folder to start. Each English word is shown as text (with a 🔊 button to hear it), and for each word she answers one of two ways, chosen at random ~50/50: **tap the meanings** — six Bulgarian options appear and she selects the correct one or ones (a word can have several) — or **type the meaning** in a field (typed answers accept synonyms). When she errs the correct answer is shown on screen and she taps **Напред ▶** to continue at her own pace. Missed words are gathered and repeated in fresh shuffled rounds until she gets them all. Then come Bulgarian sentences to translate into English out loud (this final part still uses voice). Her first-round error % is saved back to the folder.

Everything is turn-based: **OpenAI TTS** speaks, the mic records, **Whisper** transcribes, **GPT-4o** judges. Your API key stays on the server — never on the phone. Folders are stored **in the phone's browser** (localStorage), so they persist across sessions and app redeploys without any database. (They live on that one device/browser; clearing browser data removes them.)

---

## 1. Setup (about 5 minutes)

You need [Node.js 18+](https://nodejs.org).

```bash
cd "English teacher"
npm install
cp .env.example .env
```

Open `.env` and paste your OpenAI key (get one at https://platform.openai.com/api-keys):

```
OPENAI_API_KEY=sk-...
```

## 2. Run it

```bash
npm start
```

Open http://localhost:3000 on your computer to test.

## 3. Use it from her phone

The mic needs a secure (https) address on a phone. Two easy options:

**a) Same wifi + your computer's IP** — quick test only; some phones block mic on plain http.

**b) Deploy free to Render (recommended):**

1. Push this folder to a GitHub repo.
2. On https://render.com create a **New → Web Service**, connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Add an environment variable `OPENAI_API_KEY` with your key.
5. Render gives you an `https://…onrender.com` URL — open that on her phone. Mic + camera work over https.

(Railway, Fly.io, or a $5 VPS work the same way. Vercel needs the code restructured into serverless functions, so Render is simpler here.)

## Cost

Each session is a handful of cents of OpenAI usage (vision OCR + short TTS/Whisper calls). Set a monthly spend limit in the OpenAI dashboard to be safe.

## Tweaks

- Change models or the voice in `.env` (`TTS_VOICE` options: nova, alloy, shimmer, echo, fable, onyx).
- Number of final sentences: `count` in the `/api/sentences` call in `public/index.html`.
- All tutor wording is in `server.js` prompts and `public/index.html`.
