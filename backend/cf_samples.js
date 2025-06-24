// backend/cf_samples.js
// Express route for scraping Codeforces sample test cases

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

router.get('/', async (req, res) => {
  const { contestId, index } = req.query;
  if (!contestId || !index) {
    res.status(400).json({ error: 'Missing contestId or index' });
    return;
  }
  try {
    const url = `https://codeforces.com/contest/${contestId}/problem/${index}`;
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    const inputs = $('.sample-test .input pre').map((i, el) => $(el).text().replace(/\r/g, ''));
    const outputs = $('.sample-test .output pre').map((i, el) => $(el).text().replace(/\r/g, ''));
    const samples = [];
    for (let i = 0; i < inputs.length; ++i) {
      samples.push({ input: inputs[i], output: outputs[i] || '' });
    }
    res.status(200).json({ samples });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch samples' });
  }
});

module.exports = router;
