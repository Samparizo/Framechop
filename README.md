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

## 🚀 The CMS & Netlify Git-Backed Workflow (Same as AEC Profile Mapping)

You can upload new GIFs and video clips directly from your browser without opening an IDE or writing terminal commands.

### How it Works:
1. **Click "Admin CMS"** in the footer of [`index.html`](./index.html).
2. **Drag & drop** any `.gif` or `.mp4` files into the upload dropzone.
3. The CMS will automatically preview them, display file sizes, and assign the next sequential clip name (e.g. `clip (67).gif`).
4. **Click "Save & Publish to Git"**:
   - The CMS encodes each file and commits it directly to your GitHub repository via the GitHub REST API.
   - It updates `media_list.json` in your repository.
   - Netlify detects the GitHub commit, executes `node build.js` via `netlify.toml`, and automatically publishes your live site.
   - In ~60 seconds, your Netlify site is live with the newly added clips!

---

## 🔑 Initial GitHub & Netlify Setup (One-time Setup)

### 1. GitHub Token Configuration
1. Go to [GitHub Tokens](https://github.com/settings/tokens) (Settings > Developer settings > Personal access tokens > Tokens classic).
2. Click **Generate new token (classic)** with note: `Moodboard CMS`.
3. Check the **`repo`** scope (full control of private repositories) and click **Generate**.
4. In your CMS window ([`admin.html`](./admin.html)), click **"Git Config"** in the top bar.
5. Paste your GitHub token, your repository name, and click **Save Settings**. (This token is stored safely in your browser's `localStorage` on your device).

### 2. Connect to Netlify
1. Log into [Netlify](https://app.netlify.com/) and click **Add new site > Import an existing project**.
2. Select your GitHub repository (`Samparizo/...`).
3. Build Settings are automatically configured by [`netlify.toml`](./netlify.toml):
   - **Build command**: `node build.js`
   - **Publish directory**: `.`
4. Click **Deploy Site**.

Now, every time you upload a GIF from the CMS and click **Save & Publish**, your GitHub repository updates and Netlify automatically refreshes the live site!
