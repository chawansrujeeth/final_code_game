// backend/api/battle-royale-question.js
const { supabase } = require('../supabaseClient');

// In-memory storage for used questions per session (in production, use Redis or database)
const sessionQuestions = new Map();

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, difficulty, edgeId } = req.body;

    if (!sessionId || !difficulty || !edgeId) {
      return res.status(400).json({ 
        error: 'Missing required fields: sessionId, difficulty, edgeId' 
      });
    }

    // Get used questions for this session
    const usedQuestions = sessionQuestions.get(sessionId) || new Set();
    const excludeIds = Array.from(usedQuestions);

    // Fetch random question from Supabase
    let query = supabase
      .from('battle_royale_questions')
      .select('*')
      .eq('difficulty', difficulty);

    // Exclude already used questions
    if (excludeIds.length > 0) {
      query = query.not('que_id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: `No available ${difficulty} questions found` 
      });
    }

    // Return random question from available ones
    const randomIndex = Math.floor(Math.random() * data.length);
    const question = data[randomIndex];

    // Mark question as used for this session
    usedQuestions.add(question.que_id);
    sessionQuestions.set(sessionId, usedQuestions);

    // Return question without testcase (for security)
    return res.status(200).json({
      questionId: question.que_id,
      content: question.que_content,
      difficulty: question.difficulty,
      edgeId
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
