# Crystal

A communication clarity tool. Analyses messages before they are sent — helping you say what you actually mean, more clearly, more honestly, more directly.

## What it does

1. User writes or pastes a message
2. Crystal analyses it using AI (Groq / Llama 3.1 8B)
3. Returns a clarity score, emotional state, and annotated message
4. User answers coaching questions on specific phrases
5. Crystal refines the message based on answers

## Stack

| Layer | Choice |
|---|---|
| Frontend | Plain HTML / CSS / JS |
| Backend | Vercel Edge Functions |
| AI inference | Groq API (Llama 3.1 8B, free tier) |
| Hosting | Vercel |
| Database | None (stateless free tier) |

## Project structure

```
crystal/
  index.html        ← Main UI
  style.css         ← All styles
  app.js            ← Frontend logic
  vercel.json       ← Vercel config
  api/
    analyse.js      ← Edge function — calls Groq API
```

## Setup

### 1. Get a Groq API key

- Create account at [console.groq.com](https://console.groq.com)
- API Keys → Create new key
- Copy and keep it safe

### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# From the project root
vercel

# Follow the prompts — link to your GitHub repo
```

### 3. Add the API key

In Vercel dashboard → Project → Settings → Environment Variables:

```
GROQ_API_KEY = gsk_xxxxxxxxxxxxxxxxxxxx
```

Redeploy once after adding it.

### 4. Connect your domain

Vercel dashboard → Project → Settings → Domains → Add domain

## Local development

```bash
# Install Vercel CLI
npm install -g vercel

# Run locally (serves the edge function at localhost:3000/api/analyse)
vercel dev
```

You need a `.env.local` file for local runs:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
```

This file is gitignored and must never be committed.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Your Groq API key |

## Roadmap

1. **Website** ← current
2. **Browser extension** — will call this site's API instead of local Ollama
3. **Mobile app** — same backend

## Free tier limits

Groq free tier is very generous for low-to-medium volume. If limits are hit, the error is surfaced to the user cleanly. Paid tier will switch to a larger model (Llama 70B or Claude).
