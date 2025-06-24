// /api/cf-samples.js
// Vercel/Next.js API route for scraping Codeforces sample test cases

import cheerio from 'cheerio';
// Use node-fetch for server-side fetch compatibility
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { contestId, index } = req.query;
  // Validate inputs
  if (!contestId || !index || !/^[0-9]+$/.test(contestId) || !/^[A-Za-z0-9]+$/.test(index)) {
    res.status(400).json({ error: 'Invalid or missing contestId or index' });
    return;
  }
  try {
    const url = `https://codeforces.com/contest/${contestId}/problem/${index}`;
    // Add User-Agent header to mimic a browser
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; cf-sample-fetcher/1.0)'
      }
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `Failed to fetch Codeforces page: ${response.statusText}` });
      return;
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const inputs = $('.sample-test .input pre').map((i, el) => $(el).text().replace(/\r/g, ''));
    const outputs = $('.sample-test .output pre').map((i, el) => $(el).text().replace(/\r/g, ''));
    const samples = [];
    for (let i = 0; i < inputs.length; ++i) {
      samples.push({ input: inputs[i], output: outputs[i] || '' });
    }
    if (!samples.length) {
      res.status(404).json({ error: 'No sample test cases found. Codeforces may have changed their page structure or blocked the request.' });
      return;
    }
    res.status(200).json({ samples });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch samples' });
  }
}
