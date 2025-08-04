// backend/api/battle-royale-answer.js
const { supabase } = require('../supabaseClient');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { questionId, answer, targetNode } = req.body;

    if (!questionId || answer === undefined || !targetNode) {
      return res.status(400).json({ 
        error: 'Missing required fields: questionId, answer, targetNode' 
      });
    }

    // Fetch question with testcase for validation
    const { data: questionData, error } = await supabase
      .from('battle_royale_questions')
      .select('*')
      .eq('que_id', questionId)
      .single();

    if (error || !questionData) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Validate answer against testcase
    const testcase = questionData.testcase;
    let isCorrect = false;

    // Handle different testcase formats
    if (Array.isArray(testcase)) {
      // Multiple test cases - check if answer matches any expected output
      isCorrect = testcase.some(tc => 
        tc.expected_output && tc.expected_output.toString().trim() === answer.toString().trim()
      );
    } else if (testcase.expected_output) {
      // Single test case
      isCorrect = testcase.expected_output.toString().trim() === answer.toString().trim();
    }

    const result = {
      correct: isCorrect,
      questionId
    };

    if (isCorrect) {
      result.message = 'Correct answer!';
      result.newPosition = targetNode;
    } else {
      result.message = 'Wrong answer!';
      result.healthLost = 10;
      result.newHealth = 90; // This should be calculated based on current health
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
