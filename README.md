# Moodboard Motion Vault 🎬

A single-page, responsive, dark-mode visual scroll gallery for previewing animated GIFs and video clips on the go, with a Git-backed CMS for instant browser uploads.

---

## ⚡ How to Run Locally

1. **Direct View**: Open [`index.html`](./index.html) in your browser. It is self-contained and works 100% offline.
2. **CMS Studio**: Open [`admin.html`](./admin.html) directly in your browser.
3. **Local Server (Optional)**:
   ```bash
   npm start
   # or: python3 -m http.server 8000
   ```
   - Main Gallery: `http://localhost:8000/index.html`
   - Admin CMS: `http://localhost:8000/admin.html`

---

## 🚀 The CMS & Netlify Git-Backed Workflow

Upload new GIFs and video clips directly from **any device** without installing an IDE or writing terminal commands.

### How it Works:
1. **Open Admin CMS**: Navigate to `/admin` or click "Admin CMS" in the footer of [`index.html`](./index.html).
2. **Unlock**: Enter your admin password. (Protected by SHA-256 client validation + rate-limited server verification).
3. **Drag & Drop**: Drop any `.gif` or `.mp4` clips. The CMS previews them, calculates file sizes, and assigns the next sequential clip number.
4. **Click "Save & Publish"**:
   - The CMS sends a batch payload to your Netlify serverless function (`/.netlify/functions/save`).
   - The serverless function uses your server-side `GITHUB_TOKEN` to commit the files directly to `Samparizo/Moodboard-Site` (`main` branch).
   - It updates `media_list.json` and optionally pings your Netlify Build Hook.
   - Netlify rebuilds and publishes your live site in ~30–60 seconds.
   - **Zero configuration on client devices**: No token typing or storage on mobile or client browsers!

---

## 🔑 Netlify Environment Variables Setup (One-time Setup)

All credentials live securely in **Netlify Environment Variables** (Site settings > Environment variables) — never in the client code or repository.

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | **Yes** | Personal Access Token (classic) with `repo` scope from [github.com/settings/tokens](https://github.com/settings/tokens). |
| `ADMIN_PASSWORD` | **Yes** | Admin password (e.g. `Aryan@97`) checked server-side on every commit. |
| `NETLIFY_BUILD_HOOK` | Optional | Netlify Build Hook URL (Site settings > Build & deploy > Build hooks) for instant rebuild triggering. |

---

## 🛡️ Security Guardrails

- **No Plaintext Passwords**: Password is hashed with SHA-256 before client comparison. Server verifies against `ADMIN_PASSWORD` env var.
- **Client Brute-Force Shield**: 5 failed unlock attempts triggers a 30-second lockout timer.
- **Server-Side Rate Limiting**: Max 10 commit requests per 15-minute window per IP.
- **Zero Token Leakage**: The GitHub PAT never touches the client browser, localStorage, or network payload.
