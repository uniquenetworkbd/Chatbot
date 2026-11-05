# Unique Chat — Chatbot

A responsive chatbot front-end demo built with plain HTML, CSS and JavaScript.

## Features
- Responsive desktop and mobile layout
- Chat composer with Enter / Shift+Enter support
- Predefined local demo replies (no AI service connected)
- Conversation history stored in browser localStorage
- New chat, clear history and light/dark theme
- GitHub Pages deployment workflow

## Run locally
Open `index.html` in a modern browser. No build step or dependencies are required.

## Deployment
GitHub Actions workflow: `.github/workflows/pages.yml` deploys the repository root to GitHub Pages on pushes to `main`.
If Pages is not enabled, go to **Settings → Pages** and select **GitHub Actions** as the source.

## Important scope
This is a static front-end prototype. It does not include a live AI model, API integration, backend, authentication or server-side storage. A production AI chatbot requires a secure server-side API integration; never expose private API keys in browser JavaScript.

## Files
- `index.html` — page structure
- `style.css` — responsive styling
- `app.js` — chat UI and local demo logic
- `.github/workflows/pages.yml` — deployment workflow
