// backend/services/questionAssignmentService.js
// Dedicated service for managing edge question assignments in Battle Royale games
// Ensures consistent question assignment across all players in a session
// Each game session gets unique question distribution

const { supabase } = require('../supabaseClient');

class QuestionAssignmentService {
  constructor() {
    // Cache for session-based question assignments
    this.sessionAssignments = new Map(); // sessionId -> { edgeQuestions: Map, nodeQuestions: Map, seed: number }
  }

  /**
   * Generate a deterministic seed based on sessionId for consistent randomization
   * @param {string} sessionId - The game session ID
   * @returns {number} - Deterministic seed for this session
   */
  generateSessionSeed(sessionId) {
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Seeded random number generator for consistent randomization per session
   * @param {number} seed - The seed value
   * @returns {function} - Random function that uses the seed
   */
  createSeededRandom(seed) {
    let currentSeed = seed;
    return function() {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
  }

  /**
   * Shuffle array using seeded random for consistent results per session
   * @param {Array} array - Array to shuffle
   * @param {function} randomFn - Seeded random function
   * @returns {Array} - Shuffled array
   */
  seededShuffle(array, randomFn) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Define all edges in the battle royale map with their difficulty levels
   * @returns {Array} - Array of edge objects with id and difficulty
   */
  getAllEdges() {
    return [
      // R3 circular edges (Easy - lateral, 8 nodes)
      { id: 'R3_1-R3_2', difficulty: 'easy', type: 'lateral' },
      { id: 'R3_2-R3_3', difficulty: 'easy', type: 'lateral' },
      { id: 'R3_3-R3_4', difficulty: 'easy', type: 'lateral' },
      { id: 'R3_4-R3_5', difficulty: 'easy', type: 'lateral' },
      { id: 'R3_5-R3_6', difficulty: 'easy', type: 'lateral' },
      { id: 'R3_6-R3_7', difficulty: 'easy', type: 'lateral' },
      { id: 'R3_7-R3_8', difficulty: 'easy', type: 'lateral' },
      { id: 'R3_8-R3_1', difficulty: 'easy', type: 'lateral' },

      // R3 to R2 edges (Easy - inward, 1:1 mapping to 8)
      { id: 'R3_1-R2_1', difficulty: 'easy', type: 'inward' },
      { id: 'R3_2-R2_2', difficulty: 'easy', type: 'inward' },
      { id: 'R3_3-R2_3', difficulty: 'easy', type: 'inward' },
      { id: 'R3_4-R2_4', difficulty: 'easy', type: 'inward' },
      { id: 'R3_5-R2_5', difficulty: 'easy', type: 'inward' },
      { id: 'R3_6-R2_6', difficulty: 'easy', type: 'inward' },
      { id: 'R3_7-R2_7', difficulty: 'easy', type: 'inward' },
      { id: 'R3_8-R2_8', difficulty: 'easy', type: 'inward' },

      // R2 circular edges (Medium - lateral, 8 nodes)
      { id: 'R2_1-R2_2', difficulty: 'medium', type: 'lateral' },
      { id: 'R2_2-R2_3', difficulty: 'medium', type: 'lateral' },
      { id: 'R2_3-R2_4', difficulty: 'medium', type: 'lateral' },
      { id: 'R2_4-R2_5', difficulty: 'medium', type: 'lateral' },
      { id: 'R2_5-R2_6', difficulty: 'medium', type: 'lateral' },
      { id: 'R2_6-R2_7', difficulty: 'medium', type: 'lateral' },
      { id: 'R2_7-R2_8', difficulty: 'medium', type: 'lateral' },
      { id: 'R2_8-R2_1', difficulty: 'medium', type: 'lateral' },

      // R2 to R1 edges (Medium - inward, 8 -> 6 mapping)
      { id: 'R2_1-R1_1', difficulty: 'medium', type: 'inward' },
      { id: 'R2_2-R1_2', difficulty: 'medium', type: 'inward' },
      { id: 'R2_3-R1_3', difficulty: 'medium', type: 'inward' },
      { id: 'R2_4-R1_3', difficulty: 'medium', type: 'inward' },
      { id: 'R2_5-R1_4', difficulty: 'medium', type: 'inward' },
      { id: 'R2_6-R1_5', difficulty: 'medium', type: 'inward' },
      { id: 'R2_7-R1_6', difficulty: 'medium', type: 'inward' },
      { id: 'R2_8-R1_6', difficulty: 'medium', type: 'inward' },

      // R1 circular edges (Hard - lateral, 6 nodes)
      { id: 'R1_1-R1_2', difficulty: 'hard', type: 'lateral' },
      { id: 'R1_2-R1_3', difficulty: 'hard', type: 'lateral' },
      { id: 'R1_3-R1_4', difficulty: 'hard', type: 'lateral' },
      { id: 'R1_4-R1_5', difficulty: 'hard', type: 'lateral' },
      { id: 'R1_5-R1_6', difficulty: 'hard', type: 'lateral' },
      { id: 'R1_6-R1_1', difficulty: 'hard', type: 'lateral' },

      // R1 to TARGET edges (Hard - final, 6)
      { id: 'R1_1-TARGET', difficulty: 'hard', type: 'final' },
      { id: 'R1_2-TARGET', difficulty: 'hard', type: 'final' },
      { id: 'R1_3-TARGET', difficulty: 'hard', type: 'final' },
      { id: 'R1_4-TARGET', difficulty: 'hard', type: 'final' },
      { id: 'R1_5-TARGET', difficulty: 'hard', type: 'final' },
      { id: 'R1_6-TARGET', difficulty: 'hard', type: 'final' }
    ];
  }

  /**
   * Fetch questions from Supabase database
   * @returns {Promise<Array>} - Array of questions from database
   */
  async fetchQuestionsFromDatabase() {
    try {
      const { data: questions, error } = await supabase
        .from('battle_royale_questions')
        .select('*')
        .limit(200); // Get up to 200 questions for variety

      if (error) {
        console.error('❌ Error fetching questions from Supabase:', error);
        return [];
      }

      if (!questions || questions.length === 0) {
        console.error('❌ No questions found in battle_royale_questions table');
        return [];
      }

      console.log(`📚 Fetched ${questions.length} questions from database`);
      console.log('📊 Questions by difficulty:', {
        easy: questions.filter(q => q.difficulty === 'easy').length,
        medium: questions.filter(q => q.difficulty === 'medium').length,
        hard: questions.filter(q => q.difficulty === 'hard').length
      });

      return questions;
    } catch (error) {
      console.error('❌ Database fetch error:', error);
      return [];
    }
  }

  /**
   * Assign questions to all edges for a specific session
   * Uses deterministic randomization based on sessionId to ensure consistency
   * @param {string} sessionId - The game session ID
   * @returns {Promise<Map>} - Map of edge assignments
   */
  async assignQuestionsToEdges(sessionId) {
    try {
      console.log(`🎯 Starting question assignment for session: ${sessionId}`);

      // Check if already assigned for this session
      if (this.sessionAssignments.has(sessionId)) {
        console.log(`✅ Using cached assignment for session: ${sessionId}`);
        return this.sessionAssignments.get(sessionId).edgeQuestions;
      }

      // Generate deterministic seed for this session
      const sessionSeed = this.generateSessionSeed(sessionId);
      const seededRandom = this.createSeededRandom(sessionSeed);
      
      console.log(`🎲 Generated session seed: ${sessionSeed} for session: ${sessionId}`);

      // Get all edges and questions
      const allEdges = this.getAllEdges();
      const allQuestions = await this.fetchQuestionsFromDatabase();

      if (allQuestions.length === 0) {
        console.error('❌ No questions available for assignment');
        return new Map();
      }

      // Shuffle questions using seeded random for consistent results
      const shuffledQuestions = this.seededShuffle(allQuestions, seededRandom);
      
      // Create edge question assignments
      const edgeQuestions = new Map();
      const usedQuestions = new Set();

      // Assign questions to edges
      allEdges.forEach((edge, index) => {
        // Use modulo to cycle through questions if we have fewer questions than edges
        const questionIndex = index % shuffledQuestions.length;
        const question = shuffledQuestions[questionIndex];

        const assignment = {
          questionId: question.que_id,
          questionContent: question.que_content,
          testcase: question.testcase,
          difficulty: question.difficulty,
          edgeId: edge.id,
          edgeType: edge.type,
          assignedAt: new Date().toISOString()
        };

        // Debug: Log testcase data
        console.log(`🧪 Question ${question.que_id} testcase:`, {
          testcase: question.testcase,
          testcaseType: typeof question.testcase,
          testcaseLength: question.testcase?.length
        });

        edgeQuestions.set(edge.id, assignment);
        usedQuestions.add(question.que_id);

        console.log(`✅ Assigned question ${question.que_id} (${question.difficulty}) to edge ${edge.id} (${edge.type})`);
      });

      // Cache the assignment for this session
      this.sessionAssignments.set(sessionId, {
        edgeQuestions,
        seed: sessionSeed,
        assignedAt: new Date().toISOString(),
        totalEdges: allEdges.length,
        totalQuestions: allQuestions.length,
        usedQuestions: usedQuestions.size
      });

      console.log(`🎯 Successfully assigned ${edgeQuestions.size} questions to edges for session: ${sessionId}`);
      console.log(`📊 Assignment stats: ${usedQuestions.size} unique questions used`);

      return edgeQuestions;

    } catch (error) {
      console.error(`❌ Error assigning questions for session ${sessionId}:`, error);
      return new Map();
    }
  }

  /**
   * Get question assignment for a specific edge in a session
   * @param {string} sessionId - The game session ID
   * @param {string} edgeId - The edge ID to get question for
   * @returns {Object|null} - Question assignment object or null if not found
   */
  getQuestionForEdge(sessionId, edgeId) {
    const sessionData = this.sessionAssignments.get(sessionId);
    if (!sessionData) {
      console.warn(`⚠️ No assignment data found for session: ${sessionId}`);
      return null;
    }

    const assignment = sessionData.edgeQuestions.get(edgeId);
    if (!assignment) {
      console.warn(`⚠️ No question assigned to edge: ${edgeId} in session: ${sessionId}`);
      return null;
    }

    return assignment;
  }

  /**
   * Get all edge assignments for a session
   * @param {string} sessionId - The game session ID
   * @returns {Map|null} - Map of all edge assignments or null if not found
   */
  getSessionAssignments(sessionId) {
    const sessionData = this.sessionAssignments.get(sessionId);
    return sessionData ? sessionData.edgeQuestions : null;
  }

  /**
   * Clear assignments for a specific session (cleanup)
   * @param {string} sessionId - The game session ID
   */
  clearSessionAssignments(sessionId) {
    if (this.sessionAssignments.has(sessionId)) {
      this.sessionAssignments.delete(sessionId);
      console.log(`🗑️ Cleared assignments for session: ${sessionId}`);
    }
  }

  /**
   * Get assignment statistics for a session
   * @param {string} sessionId - The game session ID
   * @returns {Object|null} - Assignment statistics or null if not found
   */
  getSessionStats(sessionId) {
    const sessionData = this.sessionAssignments.get(sessionId);
    if (!sessionData) return null;

    return {
      sessionId,
      seed: sessionData.seed,
      assignedAt: sessionData.assignedAt,
      totalEdges: sessionData.totalEdges,
      totalQuestions: sessionData.totalQuestions,
      usedQuestions: sessionData.usedQuestions,
      cacheSize: this.sessionAssignments.size
    };
  }

  /**
   * Validate that all required edges have question assignments
   * @param {string} sessionId - The game session ID
   * @returns {Object} - Validation result with missing edges if any
   */
  validateAssignments(sessionId) {
    const allEdges = this.getAllEdges();
    const sessionData = this.sessionAssignments.get(sessionId);
    
    if (!sessionData) {
      return {
        isValid: false,
        error: 'No assignments found for session',
        missingEdges: allEdges.map(e => e.id)
      };
    }

    const missingEdges = allEdges
      .filter(edge => !sessionData.edgeQuestions.has(edge.id))
      .map(edge => edge.id);

    return {
      isValid: missingEdges.length === 0,
      totalEdges: allEdges.length,
      assignedEdges: sessionData.edgeQuestions.size,
      missingEdges,
      sessionId
    };
  }
}

// Export singleton instance
module.exports = new QuestionAssignmentService();
