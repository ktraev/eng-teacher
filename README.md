# English Teacher 📚

A voice vocabulary tutor for a Bulgarian-speaking child, powered by OpenAI.

**The flow**

1. She photographs her English–Bulgarian word sheets and uploads them from her phone browser.
2. GPT-4o reads (OCRs) the photos, checks the English spelling and the Bulgarian translations, and flags anything that looks wrong.
3. She reviews the words, taps **"Готова ли си?"** (Are you ready?).
4. The app speaks each English word aloud, one at a time, in random order. If she says *"не те чух" / "repeat"*, it repeats the word.
5. She says all the Bulgarian meanings out loud. If she misses one or makes a mistake, the app corrects her and brings that word back later.
6. When every word is answered correctly, it gives her Bulgarian sentences to translate into English out loud.

Everything is turn-based: **OpenAI TTS** speaks, the mic records, **Whisper** transcribes, **GPT-4o** judges. Your API key stays on the server — never on the phone.

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
