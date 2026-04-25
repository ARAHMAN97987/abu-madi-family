// Vercel Function: receives dashboard saves and commits to GitHub.
// Uses two env vars set in Vercel dashboard:
//   DASHBOARD_PASSWORD  – the password the user types in the dashboard
//   GITHUB_TOKEN        – fine-grained PAT with Contents: Read+Write on this repo

const REPO = 'ARAHMAN97987/abu-madi-family';
const PATH = 'assets/tree-data.json';
const BRANCH = 'main';

export default async function handler(req, res) {
  // CORS for safety (same-origin in Vercel by default but be explicit)
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { password, data } = body || {};

  if (!process.env.DASHBOARD_PASSWORD || !process.env.GITHUB_TOKEN) {
    res.status(500).json({ error: 'Server misconfigured: missing env vars' });
    return;
  }
  if (password !== process.env.DASHBOARD_PASSWORD) {
    res.status(401).json({ error: 'كلمة السر غير صحيحة' });
    return;
  }
  if (!data || !data.tree) {
    res.status(400).json({ error: 'بيانات غير صالحة' });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const apiBase = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    // Get current SHA
    const getRes = await fetch(`${apiBase}?ref=${BRANCH}`, { headers });
    if (!getRes.ok) {
      const t = await getRes.text();
      res.status(500).json({ error: `GitHub read failed (${getRes.status}): ${t.slice(0, 200)}` });
      return;
    }
    const current = await getRes.json();

    // PUT new content
    const json = JSON.stringify(data, null, 2);
    const content = Buffer.from(json, 'utf-8').toString('base64');
    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update tree data via dashboard',
        content,
        sha: current.sha,
        branch: BRANCH,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      res.status(500).json({ error: err.message || `GitHub write failed (${putRes.status})` });
      return;
    }
    const result = await putRes.json();
    res.status(200).json({ ok: true, commit: result.commit && result.commit.html_url });
  } catch (e) {
    res.status(500).json({ error: e.message || 'خطأ غير متوقع' });
  }
}
