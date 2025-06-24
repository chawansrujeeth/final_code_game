// /api/cf-samples.js
// Vercel/Next.js API route for scraping Codeforces sample test cases

import cheerio from 'cheerio';

export default function handler(req, res) {
  res.status(410).json({ error: 'This endpoint has moved to the backend. Use /cf-samples on the backend server.' });
}
