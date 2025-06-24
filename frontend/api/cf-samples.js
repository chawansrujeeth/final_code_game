// /api/cf-samples.js
// Vercel/Next.js API route for scraping Codeforces sample test cases

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
    const problemUrl = `https://codeforces.com/contest/${contestId}/problem/${index}`;
    // Use BACKEND_URL env variable for backend base URL
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const backendUrl = `${backendBaseUrl}/get-sample?url=${encodeURIComponent(problemUrl)}`;
    console.log('[DEBUG] Calling backendUrl:', backendUrl); // DEBUG
    const response = await fetch(backendUrl);
    console.log('[DEBUG] Backend response status:', response.status); // DEBUG
    let data = null;
    try {
      data = await response.json();
      console.log('[DEBUG] Backend response data:', data); // DEBUG
    } catch (jsonErr) {
      console.log('[DEBUG] Error parsing backend JSON:', jsonErr);
    }
    if (!data || !data.input || !data.output) {
      res.status(404).json({ error: 'No sample test cases found from backend.' });
      return;
    }
    // Return in the same format as before
    res.status(200).json({ samples: [{ input: data.input, output: data.output }] });
  } catch (err) {
    console.log('[DEBUG] API route error:', err); // DEBUG
    res.status(500).json({ error: err.message || 'Failed to fetch samples from backend' });
  }
}
