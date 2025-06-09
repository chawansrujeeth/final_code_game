const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com/submissions';
const JUDGE0_HOST = 'judge0-ce.p.rapidapi.com';
const JUDGE0_KEY = process.env.JUDGE0_KEY || 'YOUR_RAPIDAPI_KEY'; // Replace with your key or use .env

// Health check
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Run code endpoint
app.post('/run', async (req, res) => {
  const { source_code, language_id, stdin, expected_output, cpu_time_limit } = req.body;
  try {
    // Submit code to Judge0
    const submission = await axios.post(JUDGE0_URL, {
      source_code,
      language_id,
      stdin: stdin || '',
      expected_output: expected_output || '',
      cpu_time_limit: cpu_time_limit || 2,
    }, {
      headers: {
        'X-RapidAPI-Key': JUDGE0_KEY,
        'X-RapidAPI-Host': JUDGE0_HOST,
        'Content-Type': 'application/json',
      },
    });

    const token = submission.data.token;

    // Poll for result
    let result;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const resPoll = await axios.get(`${JUDGE0_URL}/${token}`, {
        headers: {
          'X-RapidAPI-Key': JUDGE0_KEY,
          'X-RapidAPI-Host': JUDGE0_HOST,
        },
      });
      result = resPoll.data;
      if (result.status && result.status.id >= 3) break; // 3: Done
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5051;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

