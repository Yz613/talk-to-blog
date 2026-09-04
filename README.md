# VoxScribe — Talk to Blog

VoxScribe turns a spoken brainstorm, pasted notes, or a voice memo into an editable Medium-style article with SEO metadata, tags, and export tools.

---

## Quick Start — Running Locally

### Prerequisites
- **Node.js**: Version 20 or newer (`node -v` to verify)
- **npm**: Version 9 or newer
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/Yz613/talk-to-blog.git
cd talk-to-blog
```

### 2. Install Dependencies
```bash
npm install
```

### 3. (Optional) Configure Your Gemini API Key
VoxScribe supports two ways to supply a [Google Gemini API key](https://aistudio.google.com/app/apikey):

- **Option A: In the `.env` file (Persistent local key)**
  ```bash
  cp .env.example .env
  ```
  Open `.env` in your editor and insert your key:
  ```dotenv
  GEMINI_API_KEY=your_gemini_api_key_here
  ```

- **Option B: In the Web UI (Zero-configuration session key)**
  You don't need to create or edit any `.env` file! You can simply start the app and paste your API key directly into the UI when prompted (see [Providing Keys via the UI](#providing-keys-via-the-ui) below).

> [!NOTE]
> **No API key?** You can still run the app! VoxScribe automatically falls back to **Local Writing Mode**, which formats and structures your drafts offline without external AI services.

### 4. Start the Development Server
```bash
npm run dev
```

### 5. Open the App
Visit [http://localhost:3000](http://localhost:3000) in your browser. The connection chip in the header indicates whether **Gemini Mode** or **Local Writing Mode** is active.

---

## API Keys & Operating Modes

| Mode | Requirements | Capabilities |
| :--- | :--- | :--- |
| **Gemini AI Mode** | Gemini API Key (in `.env` or in UI) | Full AI article drafting, style refinement, custom voice matching, and audio file transcription. |
| **Local Writing Mode** | None (Runs offline) | Algorithmic note structuring, SEO tag generation, Markdown export, and local draft storage. |

### Providing Keys via the UI
If you prefer not to touch `.env` files:
1. Click the **connection chip** in the header or select **My Voice**.
2. Paste your Gemini API key and click **Verify**.
3. The key is verified live against Google AI and stored only in browser `sessionStorage` (sent via the `x-gemini-api-key` header).
4. It is never written to disk or drafts, and is cleared when you close the tab or select **Forget session key**.

---

## Teach Gemini Your Voice ("My Voice")

You can personalize how articles are written by teaching the app your natural speaking and writing cadence:

1. Click **My Voice** in the top navigation.
2. Ensure your Gemini key is connected (or configured via `.env` / Cloudflare Worker secret).
3. Answer any of the **12 targeted voice questions**:
   - **Quick Multiple Choice**: Pick your humor style, sentence rhythm, opening hook instincts, jargon philosophy, visual formatting, and closing sign-off (or customize them in your own words).
   - **Concise Sentence Prompts**: Single-sentence hot takes, micro-lessons, pet peeves/clichés to avoid, explaining an idea to a friend, or speaking freely with your mic.
   - **Skip Anytime**: You can skip any question or jump directly using the top step indicators.
   - **Build Early**: You only need to answer **at least 2 questions** to generate a profile—the more you answer, the more nuanced and sharp your voice profile becomes.
4. Click **Build my voice profile**. Gemini evaluates your cadence, vocabulary, sentence rhythm, humor, signature moves, and stylistic avoidances.
5. Review your generated **Voice Profile**. Once saved, all subsequent article drafts and revisions will automatically write in your distinct style.

---

## Privacy & Local Storage

- **100% Private to Your Browser**: Your drafts, voice interview answers, and voice profile are saved in your browser's `localStorage`. No external database is used.
- **Secure API Key Handling**: Session keys remain in `sessionStorage` and are never committed or logged. Server `.env` keys are ignored by git (`.gitignore`).
- **Data Portability**: You can export individual articles as Markdown or rich text, or back up all drafts as a JSON file.

---

## Useful Commands

```bash
npm run dev      # Start dev server with hot reload (http://localhost:3000)
npm run check    # Run TypeScript check, tests, and build verification
npm test         # Run unit tests
npm run build    # Create production bundle in dist/
npm start        # Serve production build locally
```

---

## Production Deployment

### Standard Node.js Server (Render, Railway, Fly.io, etc.)
The production server serves both the React client and the Express `/api` backend on the port specified by the host's `PORT` environment variable (default: `3000`):

```bash
npm run build
NODE_ENV=production npm start
```

### Cloudflare Workers
VoxScribe includes a Cloudflare Worker bridge (`worker.ts` and `wrangler.jsonc`):

```bash
npm run deploy
```

For Cloudflare deployments, individual users can enter their own session key in the UI, or you can supply a shared server key with:
```bash
npx wrangler secret put GEMINI_API_KEY
```
