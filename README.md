# My AI Hub

A personal Next.js workspace that bundles a set of AI-powered tools behind a single dark-themed sidebar:

- **Dashboard** — overview of every tool
- **Earnings Summarizer** — distill earnings transcripts into key takeaways
- **Financial Models** — DCF, comps, three-statement, LBO templates
- **Property Images** — generate and organize real-estate visuals
- **Spotting Board** — pipeline-style tracker for ideas and leads
- **SIE Tutor** — practice questions and topic study for the SIE exam
- **Research Assistant** — deep research with synthesized answers and sources
- **Weekly Briefing** — on-demand markets / macro / portfolio briefing

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router) + React 18 + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [lucide-react](https://lucide.dev/) for icons
- Deploys cleanly on [Vercel](https://vercel.com/)

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  layout.tsx              # Root layout with sidebar
  page.tsx                # Dashboard
  earnings-summarizer/    # Each tool is its own route segment
  financial-models/
  property-images/
  spotting-board/
  sie-tutor/
  research-assistant/
  weekly-briefing/
components/
  Sidebar.tsx             # Desktop sidebar nav
  MobileNav.tsx           # Collapsible mobile nav
  PageHeader.tsx          # Shared page header
  Card.tsx                # Card primitives
lib/
  navigation.ts           # Single source of truth for nav items
```

The sidebar is driven by [`lib/navigation.ts`](lib/navigation.ts) — add a tool there and it shows up in both the desktop and mobile nav. Each tool then needs a corresponding folder under `app/`.

## Deploying to Vercel

1. Push this folder to a GitHub repo.
2. In the [Vercel dashboard](https://vercel.com/new), import the repo.
3. Framework preset: **Next.js** (auto-detected). No env vars required out of the box.
4. Click **Deploy**.

Subsequent pushes to the default branch will trigger automatic deployments.

## Adding functionality

Each page is intentionally a clean shell. Wire up your own backends, API routes, or LLM calls inside the relevant page (e.g. `app/earnings-summarizer/page.tsx`) — the layout, navigation, and styling will stay consistent across the hub.
