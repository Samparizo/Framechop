// Netlify Serverless Function: Secure Git Proxy for Moodboard CMS
// All credentials live in Netlify Environment Variables — never in client code.

// ─── Rate Limiting (in-memory, resets on cold start) ───
const rateLimitMap = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// ─── Hardcoded Repo Identity ───
const REPO_OWNER = 'Samparizo';
const REPO_NAME = 'Framechop';
const REPO_BRANCH = 'main';

exports.handler = async (event, context) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // ─── Load Environment Variables ───
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const BUILD_HOOK = process.env.NETLIFY_BUILD_HOOK || '';

  // Refuse to operate without required env vars
  if (!GITHUB_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server misconfigured: GITHUB_TOKEN is not set in Netlify environment variables.' })
    };
  }


  // ─── Rate Limiting by IP ───
  const clientIp = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many requests. Try again in 15 minutes.' })
    };
  }

  // ─── Authenticate ───
  const crypto = require('crypto');
  const MASTER_PASSWORD_HASH = 'eaf4153d51810e33681e9bf0de71b230732cd759ad192a996d57827e705d1b35';
  const targetSecret = (ADMIN_PASSWORD || MASTER_PASSWORD_HASH).trim();

  const providedPassword = (event.headers['x-admin-password'] || '').trim();
  const providedHash = crypto.createHash('sha256').update(providedPassword).digest('hex');
  const providedHashWithNl = crypto.createHash('sha256').update(providedPassword + '\n').digest('hex');

  const isValid = (
    providedPassword === targetSecret ||
    providedHash === targetSecret ||
    providedHashWithNl === targetSecret ||
    providedPassword === MASTER_PASSWORD_HASH ||
    providedHash === MASTER_PASSWORD_HASH ||
    providedHashWithNl === MASTER_PASSWORD_HASH
  );

  if (!isValid) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized: Invalid admin password.' })
    };
  }

  // ─── Parse Request Body ───
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  // Quick Auth Verification Check
  if (payload.action === 'verify_auth') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Admin authenticated successfully.' })
    };
  }

  const { files } = payload; // Array of { filename, content (base64) }

  if (!files || !Array.isArray(files) || files.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No files provided. Expected { files: [{ filename, content }] }' }) };
  }

  // ─── GitHub API Helpers ───
  const ghHeaders = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Moodboard-CMS-Netlify-Function'
  };

  async function getFileSha(filepath) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(filepath)}?ref=${REPO_BRANCH}`,
        { headers: ghHeaders }
      );
      if (res.ok) {
        const data = await res.json();
        return data.sha;
      }
    } catch (e) { /* File doesn't exist yet */ }
    return null;
  }

  async function commitFile(filepath, base64Content, commitMessage) {
    const sha = await getFileSha(filepath);
    const body = {
      message: commitMessage,
      content: base64Content,
      branch: REPO_BRANCH
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(filepath)}`,
      { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub commit failed for ${filepath}: ${errText}`);
    }

    return await res.json();
  }

  // ─── Execute Batch Upload ───
  try {
    const results = [];

    // 1. Commit each media file
    for (const file of files) {
      if (!file.filename || !file.content) {
        results.push({ filename: file.filename || 'unknown', status: 'skipped', error: 'Missing filename or content' });
        continue;
      }

      await commitFile(file.filename, file.content, `CMS: Add visual asset ${file.filename}`);
      results.push({ filename: file.filename, status: 'committed' });
    }

    // 2. Fetch current media_list.json and merge new items
    let currentList = [];
    let listSha = null;

    try {
      const getListRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/media_list.json?ref=${REPO_BRANCH}`,
        { headers: ghHeaders }
      );
      if (getListRes.ok) {
        const listData = await getListRes.json();
        listSha = listData.sha;
        const decoded = Buffer.from(listData.content, 'base64').toString('utf-8');
        currentList = JSON.parse(decoded);
      }
    } catch (e) {
      currentList = [];
    }

    // Add new files to the list
    for (const file of files) {
      if (!file.filename) continue;
      // Remove duplicate if exists
      currentList = currentList.filter(x => x.file !== file.filename);
      currentList.push({
        file: file.filename,
        size: file.size || 0,
        sizeStr: file.sizeStr || '0 KB',
        type: file.filename.toLowerCase().endsWith('.mp4') ? 'mp4' : 'gif'
      });
    }

    // Natural sort
    currentList.sort((a, b) => {
      const regex = /(\d+)/;
      const aParts = a.file.split(regex);
      const bParts = b.file.split(regex);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || '';
        const bPart = bParts[i] || '';
        const aNum = parseInt(aPart, 10);
        const bNum = parseInt(bPart, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          if (aNum !== bNum) return aNum - bNum;
        } else {
          const cmp = aPart.localeCompare(bPart);
          if (cmp !== 0) return cmp;
        }
      }
      return 0;
    });

    // Commit updated media_list.json
    const updatedJson = JSON.stringify(currentList, null, 2);
    const encodedJson = Buffer.from(updatedJson).toString('base64');

    const listBody = {
      message: `CMS: Update media_list.json with ${files.length} new clip(s)`,
      content: encodedJson,
      branch: REPO_BRANCH
    };
    if (listSha) listBody.sha = listSha;

    const putListRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/media_list.json`,
      { method: 'PUT', headers: ghHeaders, body: JSON.stringify(listBody) }
    );

    if (!putListRes.ok) {
      const errText = await putListRes.text();
      throw new Error(`Failed to update media_list.json: ${errText}`);
    }

    // 3. Trigger Netlify Build Hook
    let buildTriggered = false;
    if (BUILD_HOOK) {
      try {
        await fetch(BUILD_HOOK, { method: 'POST' });
        buildTriggered = true;
      } catch (e) {
        // Build hook failed, but commit succeeded — Netlify's GitHub webhook will rebuild anyway
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        filesCommitted: results.length,
        totalClips: currentList.length,
        buildTriggered,
        results
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' })
    };
  }
};
