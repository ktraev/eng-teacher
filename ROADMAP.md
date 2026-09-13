# English Teacher — Product Roadmap

*A plan to grow the app from a family tool into a small, profitable language-learning product.*
Last updated: 2026-09-13

---

## The core bet

Every big language app hands you *their* curriculum. This app is different: it drills **the learner's own material** — the vocabulary list from school, the words underlined in a book, the terms for an exam — captured from a photo in seconds. That "bring your own content" wedge is underserved. The strategy is to win a narrow audience for whom that problem is acute, not to fight Duolingo head-on.

**Beachhead audience: private language tutors and teachers.** They are reachable directly (no app-store lottery), they already pay for tools, they have their own students' material, and serving adults-with-a-professional avoids most of the children's-data legal burden. The students/parents market you started from is the *expansion*, entered once the product and the money model are proven.

**Commitment model:** serious side project with **validation gates** between phases. Each phase ends with a specific question; if the answer is no, you stop or pivot before spending the next chunk of effort.

---

## Guiding principles

- **Retention over features.** In language apps the hard part is people coming back, not the feature list. Spaced repetition is the retention engine — it comes before almost everything else.
- **Watch unit economics from day one.** Every OCR, voice line, and answer-check is a paid API call. A heavy user must not cost more than they pay. Measure cost-per-active-user early.
- **Validate with strangers.** Family and friends will be polite. The only signal that matters is someone you don't know using it two weeks in a row.
- **Don't build the business scaffolding (payments, auth, legal) until there's evidence someone wants the product.**

---

## Phase 0 — Foundation (now → ~2 weeks)

Goal: make the current app solid, multi-user, and safe to put in a stranger's hands.

- **User accounts & login.** ✅ Done — email + password (bcrypt-hashed), session in a signed httpOnly cookie. Register / login / logout / "who am I" endpoints.
- **Per-user data isolation.** ✅ Done — every folder belongs to a user id; all folder operations are ownership-checked, so users can only see and edit their own. All API routes (including the OpenAI ones) require login, which also protects the API budget from strangers. The first account created claims any pre-existing ownerless folders (migrates your original folders automatically).
- **Fix the local-dev issue** so you can iterate (Node 20 LTS resolves the `Premature close` problem). *— environment step, do when convenient.*
- **Basic reliability:** the backup/export buttons, plus Neon's automatic database backups. ✅ In place.
- **Move the Bulgarian-only UI to be language-neutral** or translatable — *deferred to later* (add an English UI when reaching a wider audience).

**Still to add before the gate:** password reset (needs an email service — deferred with the login method choice), and a short "how it works" first-run hint.

**Gate:** Can a person who isn't you sign up, photograph a word list, and complete a session without help? If not, fix that before going further.

---

## Phase 1 — The learning engine (~3–5 weeks)

Goal: make it genuinely better at *teaching*, so people want to return daily. This is the most important phase.

- **Spaced repetition (SRS).** Track every word per user with a review schedule (start with a proven algorithm like SM-2 / the FSRS approach). Each day the app surfaces the words due for review. This single feature is what turns a quiz into a habit.
- **A daily "review" home screen:** "You have 24 words to review today" — the hook that brings people back.
- **Pronunciation & speaking practice** using the voice infrastructure you already built (word → she says it → feedback), as an optional mode.
- **Better answer modes mix:** keep the tap/type split, add "reveal & self-rate" (how Anki works) for fast review sessions.
- **Progress & streaks:** simple stats — words mastered, review streak, per-folder mastery %.
- **Interest fields (onboarding / cold-start fix).** Let the user pick topics they care about — biology, business English, art, travel, etc. A brand-new user (or one who doesn't want to photograph anything yet) can pick a field and get a starter set immediately, so the app delivers value in the first 30 seconds instead of showing a blank screen. Keep this as a *discovery helper*, not the core loop — the app should still orbit the user's own material.

**Gate:** Do 5–10 test users (recruited outside your circle) come back and do reviews on at least 3 separate days in two weeks? Weekly active return is the make-or-break signal for any language app.

---

## Phase 2 — Multi-language & content depth (~2–4 weeks)

Goal: widen the addressable audience and deepen the material.

- **Full multi-language support.** The OCR and checking are already language-agnostic; expose language pickers (source + target), pick voices per language, and test 3–4 popular pairs (e.g. English↔Spanish, English↔German, plus your Bulgarian).
- **Auto-enrichment (optional, cost-controlled):** when a word is saved, optionally generate an example sentence, part of speech, or a mnemonic — cached once, not regenerated every session.
- **Smart word suggestions — "extend what you already have."** This is the "library grows without effort" feature, and its framing is what protects the product's moat. The strong version: the user saved 40 words from their biology class, and the app suggests ~10 *adjacent* words — same domain, similar frequency, near their level — that plausibly appear alongside the ones they already have. This deepens the personalization advantage. Avoid the weak version (generic "here's a B2 business pack"), which just makes you a thinner Duolingo on ground where the big players are strongest.
  - *Proficiency signal:* infer a rough CEFR level from the frequency of the words the user already saved, or ask once during onboarding — don't over-engineer it.
  - *Cost & overwhelm control:* make it opt-in and rate-limited ("add 5 suggested words?"), never an unbounded firehose. More words means more reviews and more API calls; an exploding review pile makes people quit. Generate suggestions in a cached batch, not per-session.
- **Import beyond photos:** paste a list, import from Quizlet/CSV, or a browser extension to grab words while reading.

**Gate:** Is at least one non-English language pair used by a real user? Do suggested words get accepted and actually reviewed (not just added and ignored)? Does enrichment improve retention enough to justify its API cost?

---

## Phase 3 — The business model (~3–5 weeks, only after Phase 1 gate passes)

Goal: turn usage into revenue. Do **not** start this until people demonstrably keep coming back.

- **Freemium tiers:**
  - *Free:* a limited number of folders / words, basic drilling.
  - *Paid (~monthly subscription):* unlimited folders, spaced repetition, all languages, speaking practice.
- **The tutor/teacher plan (the real wedge):** one account managing multiple students, assigning each their own word sets and seeing their progress. Price per seat. This audience is cheaper to reach and pays more reliably than consumers.
- **Payments:** integrate a provider (Stripe is the standard). Handle subscriptions, trials, cancellations.
- **Usage metering & cost guardrails:** cap or throttle the expensive AI operations on the free tier; make sure a paid seat's API cost stays well under its price. Track cost-per-active-user as a first-class metric.

**Gate:** Will anyone pay? Even 5–10 paying users (or one tutor paying for a handful of seats) is the proof. If nobody converts after using it, the price, audience, or value needs rethinking before scaling.

---

## Phase 4 — Growth & polish (ongoing, only after first paying users)

Goal: get more of the right users, affordably.

- **Distribution to tutors:** direct outreach, language-teaching communities, a simple landing page with a demo. This channel beats consumer app-store competition.
- **Referral / classroom sharing:** a tutor invites students; students may become individual subscribers — built-in, low-cost acquisition.
- **Mobile app wrapper** (PWA first — installable, cheap; native later only if retention justifies it).
- **Onboarding & retention loops:** reminders/notifications for due reviews, first-session guidance.
- **Content marketing** around vocabulary learning and exam prep, aimed at your beachhead.

---

## Expansion: the students/parents market

Once the tutor model works, the students/parents audience (your original use case) is the growth market. Before entering it, budget for the legal weight of minors' data: **GDPR-K in Europe and COPPA in the US** — parental consent, data minimization, deletion rights, no behavioral advertising. Manageable, but it shapes the product and shouldn't be improvised. The tutor channel is actually a softer on-ramp here, since tutors mediate the relationship with the child.

---

## The risks, kept honest

- **Retention is the real battle**, not building. Most language apps lose users fast. Phase 1's gate exists precisely to test this cheaply.
- **Unit economics can invert:** a heavy free user can cost more in API calls than they'll ever pay. Cache aggressively, meter the expensive operations, and know your cost-per-user.
- **Consumer acquisition is expensive.** The tutor/B2B2C channel is the mitigation.
- **Children's data is a real compliance cost** if/when you target kids directly.
- **This is unlikely to become "the next Duolingo,"** but a focused, profitable small product for a specific audience is realistic. Aim for that.

*Not financial advice — the money-side items are things to investigate and validate, not guarantees.*

---

## What I'd do next, concretely

The two features that unlock both learning value and any paid tier are **user accounts** and **spaced repetition**. I'd build them in that order. Say the word and I'll start on accounts (Phase 0), or on the spaced-repetition engine (Phase 1) if you'd rather prove the learning value first.
