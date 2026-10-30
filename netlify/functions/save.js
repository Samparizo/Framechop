// Netlify Serverless Function: Save & Commit to GitHub (AEC Profile Mapping Architecture)
exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const tokenGH = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'Samparizo';
  const repo = process.env.GITHUB_REPO || 'Moodboard-Site';
  const branch = process.env.GITHUB_BRANCH || 'main';

  const expectedPassword = process.env.ADMIN_PASSWORD || 'Aryan@97';
  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {}

  const providedPassword = event.headers['x-admin-password'] || payload.password;
  if (providedPassword && providedPassword !== expectedPassword) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized: Invalid Admin Password.' })
    };
  }

  if (!tokenGH) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GITHUB_TOKEN is not configured in Netlify Environment Variables.' })
    };
  }

  try {
    const payload = JSON.parse(event.body);
    const { filename, content, isJson } = payload;

    if (!filename || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing filename or content.' }) };
    }

    // 1. Fetch current file SHA if exists
    let currentSha = undefined;
    try {
      const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}?ref=${branch}`, {
        headers: {
          'Authorization': `token ${tokenGH}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Netlify-CMS-Agent'
        }
      });
      if (getRes.ok) {
        const fileData = await getRes.json();
        currentSha = fileData.sha;
      }
    } catch (e) {
      // New file
    }

    // 2. Put file to GitHub
    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${tokenGH}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Netlify-CMS-Agent'
      },
      body: JSON.stringify({
        message: `CMS: Upload ${filename} via Netlify function`,
        content: content,
        sha: currentSha,
        branch: branch
      })
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return { statusCode: putRes.status, body: JSON.stringify({ error: errText }) };
    }

    const resData = await putRes.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, commit: resData.commit })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' })
    };
  }
};
