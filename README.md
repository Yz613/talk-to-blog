# VoxScribe — Talk to Blog

VoxScribe turns a spoken brainstorm, pasted notes, or a voice memo into an editable Medium-style article with SEO metadata, tags, and export tools.

It works immediately after cloning:

- **Local writing mode** needs no account or API key. It structures the source notes into a complete draft, SEO bundle, and five Medium tags.
- **Gemini mode** creates a deeper AI-written article and unlocks uploaded-audio transcription when `GEMINI_API_KEY` is present.
- Browser speech recognition provides live dictation when the browser supports it.
- Stories are saved in the browser, can be edited and refined, copied as rich text, downloaded as Markdown, or backed up as JSON.

## Teach Gemini your voice

Open **My Voice** in the header or select the connection chip on the first screen.

1. Paste a Gemini API key and let VoxScribe verify it.
2. Answer the six short interview prompts in your natural words.
3. Gemini analyzes your cadence, vocabulary, directness, humor, sentence rhythm, signature moves, and stylistic avoidances.
4. Review the resulting voice profile. It is automatically included with every new Gemini article and refinement.

Keys entered in the app are held only in browser `sessionStorage`, so they survive a reload in that tab but are cleared when the browser session ends or when **Forget session key** is selected. The key is never written to the project, drafts, or persistent local storage. The voice profile and its interview answers are saved in browser `localStorage` so the writing style remains available on later visits.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app is usable as-is in local mode.

For AI writing and audio-file transcription, add a Gemini API key to `.env`:

```dotenv
GEMINI_API_KEY=your_key_here
```

Restart the development server after changing `.env`. The status chip on the first screen shows whether Gemini or local mode is active.

## Useful commands

```bash
npm run dev      # full app with API and live frontend reload
npm run check    # type-check, tests, and production build
npm run build    # create the production bundle in dist/
npm start        # serve the production bundle
```

## Production

The production server serves both the built React app and the `/api` routes. It reads the host-provided `PORT` value and falls back to port 3000.

```bash
npm run build
NODE_ENV=production npm start
```

Never commit `.env`; it is already ignored. Drafts remain in each browser's local storage unless the user exports a JSON backup.

## Deploy to Cloudflare Workers

The project includes a Cloudflare Worker entry point and Workers Static Assets configuration. The Express API runs through Cloudflare's Node.js HTTP bridge while the React build is served from the edge.

```bash
npm run deploy
```

Wrangler will use your existing Cloudflare login or prompt you to authenticate. The in-app session-key flow works without configuring a Worker secret. If you prefer one server-managed Gemini key for everyone using the deployment, add it with `npx wrangler secret put GEMINI_API_KEY`.
