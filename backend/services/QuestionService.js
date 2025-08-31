// backend/services/QuestionService.js
// Service for managing questions and code execution

const judge0Service = require('./judge0Service');

class QuestionService {
  constructor(databaseService, config, logger) {
    this.db = databaseService;
    this.config = config;
    this.logger = logger;
    this.questionCache = new Map(); // Simple in-memory cache
    this.cacheExpiry = config.cache.memory.ttl * 1000; // Convert to milliseconds
  }

  /**
   * Get questions for a game session
   * @param {string} sessionId - Game session ID
   * @param {string} difficulty - Difficulty level
   * @returns {Map} Map of edgeId -> question
   */
  async getQuestionsForGame(sessionId, difficulty = 'medium') {
    try {
      // Check cache first
      const cacheKey = `game:${sessionId}:${difficulty}`;
      if (this.questionCache.has(cacheKey)) {
        const cached = this.questionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.data;
        }
      }

      // Get questions for each difficulty level based on game requirements
      const questionCounts = this.getQuestionCounts(difficulty);
      const questions = new Map();

      // Fetch questions for each difficulty
      const [easyQuestions, mediumQuestions, hardQuestions] = await Promise.all([
        this.db.getRandomQuestions(questionCounts.easy, 'easy'),
        this.db.getRandomQuestions(questionCounts.medium, 'medium'),
        this.db.getRandomQuestions(questionCounts.hard, 'hard')
      ]);

      // Assign questions to edges
      const edgeAssignments = this.assignQuestionsToEdges(
        easyQuestions,
        mediumQuestions,
        hardQuestions
      );

      // Store in cache
      this.questionCache.set(cacheKey, {
        data: edgeAssignments,
        timestamp: Date.now()
      });

      // Clean up old cache entries
      this.cleanupCache();

      return edgeAssignments;
    } catch (error) {
      this.logger.error('Error getting questions for game:', error);
      throw new Error('Failed to load game questions');
    }
  }

  /**
   * Determine question counts based on difficulty
   */
  getQuestionCounts(difficulty) {
    const counts = {
      easy: { easy: 30, medium: 15, hard: 5 },
      medium: { easy: 20, medium: 25, hard: 10 },
      hard: { easy: 10, medium: 20, hard: 25 }
    };

    return counts[difficulty] || counts.medium;
  }

  /**
   * Assign questions to specific edges
   */
  assignQuestionsToEdges(easyQuestions, mediumQuestions, hardQuestions) {
    const edgeQuestions = new Map();
    
    // Define edge types and their corresponding difficulties
    const edgeTypes = {
      easy: [
        // Ring 3 to Ring 2 edges
        'R3_1-R2_1', 'R3_2-R2_2', 'R3_3-R2_3', 'R3_4-R2_4',
        'R3_5-R2_5', 'R3_6-R2_6', 'R3_7-R2_7', 'R3_8-R2_8',
        // Ring 3 circular edges
        'R3_1-R3_2', 'R3_2-R3_3', 'R3_3-R3_4', 'R3_4-R3_5',
        'R3_5-R3_6', 'R3_6-R3_7', 'R3_7-R3_8', 'R3_8-R3_1'
      ],
      medium: [
        // Ring 2 to Ring 1 edges
        'R2_1-R1_1', 'R2_2-R1_2', 'R2_3-R1_3', 'R2_4-R1_4',
        'R2_5-R1_5', 'R2_6-R1_6', 'R2_7-R1_1', 'R2_8-R1_2',
        // Ring 2 circular edges
        'R2_1-R2_2', 'R2_2-R2_3', 'R2_3-R2_4', 'R2_4-R2_5',
        'R2_5-R2_6', 'R2_6-R2_7', 'R2_7-R2_8', 'R2_8-R2_1'
      ],
      hard: [
        // Ring 1 to TARGET edges
        'R1_1-TARGET', 'R1_2-TARGET', 'R1_3-TARGET',
        'R1_4-TARGET', 'R1_5-TARGET', 'R1_6-TARGET',
        // Ring 1 circular edges
        'R1_1-R1_2', 'R1_2-R1_3', 'R1_3-R1_4',
        'R1_4-R1_5', 'R1_5-R1_6', 'R1_6-R1_1'
      ]
    };

    // Assign questions to edges
    let easyIndex = 0, mediumIndex = 0, hardIndex = 0;

    for (const edge of edgeTypes.easy) {
      if (easyIndex < easyQuestions.length) {
        edgeQuestions.set(edge, easyQuestions[easyIndex++]);
      }
    }

    for (const edge of edgeTypes.medium) {
      if (mediumIndex < mediumQuestions.length) {
        edgeQuestions.set(edge, mediumQuestions[mediumIndex++]);
      }
    }

    for (const edge of edgeTypes.hard) {
      if (hardIndex < hardQuestions.length) {
        edgeQuestions.set(edge, hardQuestions[hardIndex++]);
      }
    }

    return edgeQuestions;
  }

  /**
   * Validate answer for a question
   * @param {string} questionId - Question ID
   * @param {string} userCode - User's submitted code
   * @param {string} language - Programming language
   * @returns {boolean} True if answer is correct
   */
  async validateAnswer(questionId, userCode, language = 'javascript') {
    try {
      // Get question from database
      const question = await this.db.getQuestionById(questionId);
      if (!question) {
        throw new Error('Question not found');
      }

      // Parse test cases
      const testCases = this.parseTestCases(question);
      
      // Run code against test cases
      const results = await judge0Service.runTestCases(
        userCode,
        language,
        testCases
      );

      // Log submission for analytics
      this.logger.info('Code submission:', {
        questionId,
        language,
        passed: results.allPassed,
        passedCount: results.passedCount,
        totalCount: results.totalCount
      });

      return results.allPassed;
    } catch (error) {
      this.logger.error('Error validating answer:', error);
      return false;
    }
  }

  /**
   * Parse test cases from question data
   */
  parseTestCases(question) {
    try {
      // If test cases are stored as JSON string
      if (typeof question.test_cases === 'string') {
        return JSON.parse(question.test_cases);
      }
      
      // If test cases are already an object
      if (Array.isArray(question.test_cases)) {
        return question.test_cases;
      }

      // Fallback to sample test cases
      if (question.sample_input && question.sample_output) {
        return [{
          input: question.sample_input,
          output: question.sample_output
        }];
      }

      return [];
    } catch (error) {
      this.logger.error('Error parsing test cases:', error);
      return [];
    }
  }

  /**
   * Get question by ID with caching
   */
  async getQuestion(questionId) {
    try {
      // Check cache
      const cacheKey = `question:${questionId}`;
      if (this.questionCache.has(cacheKey)) {
        const cached = this.questionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.data;
        }
      }

      // Fetch from database
      const question = await this.db.getQuestionById(questionId);
      
      // Store in cache
      if (question) {
        this.questionCache.set(cacheKey, {
          data: question,
          timestamp: Date.now()
        });
      }

      return question;
    } catch (error) {
      this.logger.error('Error getting question:', error);
      throw new Error('Failed to fetch question');
    }
  }

  /**
   * Get questions by difficulty with caching
   */
  async getQuestionsByDifficulty(difficulty, limit = 50) {
    try {
      const cacheKey = `difficulty:${difficulty}:${limit}`;
      
      // Check cache
      if (this.questionCache.has(cacheKey)) {
        const cached = this.questionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.data;
        }
      }

      // Fetch from database
      const questions = await this.db.getQuestionsByDifficulty(difficulty, limit);
      
      // Store in cache
      this.questionCache.set(cacheKey, {
        data: questions,
        timestamp: Date.now()
      });

      return questions;
    } catch (error) {
      this.logger.error('Error getting questions by difficulty:', error);
      throw new Error('Failed to fetch questions');
    }
  }

  /**
   * Execute code without validation (for practice mode)
   */
  async executeCode(code, language, input = '') {
    try {
      const result = await judge0Service.submitCode(code, language, input);
      return {
        success: result.statusId === 3, // 3 = Accepted
        output: result.stdout,
        error: result.stderr || result.compile_output,
        executionTime: result.time,
        memory: result.memory,
        status: result.status
      };
    } catch (error) {
      this.logger.error('Error executing code:', error);
      return {
        success: false,
        error: error.message,
        status: 'Error'
      };
    }
  }

  /**
   * Get hint for a question
   */
  async getHint(questionId, hintLevel = 1) {
    try {
      const question = await this.getQuestion(questionId);
      if (!question) {
        throw new Error('Question not found');
      }

      // Parse hints if stored as JSON
      let hints = question.hints;
      if (typeof hints === 'string') {
        hints = JSON.parse(hints);
      }

      if (!Array.isArray(hints) || hints.length === 0) {
        return null;
      }

      // Return appropriate hint level
      const hintIndex = Math.min(hintLevel - 1, hints.length - 1);
      return hints[hintIndex];
    } catch (error) {
      this.logger.error('Error getting hint:', error);
      return null;
    }
  }

  /**
   * Get solution for a question (for learning mode)
   */
  async getSolution(questionId, language = 'javascript') {
    try {
      const question = await this.getQuestion(questionId);
      if (!question) {
        throw new Error('Question not found');
      }

      // Parse solutions if stored as JSON
      let solutions = question.solutions;
      if (typeof solutions === 'string') {
        solutions = JSON.parse(solutions);
      }

      if (!solutions || typeof solutions !== 'object') {
        return null;
      }

      // Return solution for requested language or default
      return solutions[language] || solutions.javascript || null;
    } catch (error) {
      this.logger.error('Error getting solution:', error);
      return null;
    }
  }

  /**
   * Get question statistics
   */
  async getQuestionStats(questionId) {
    try {
      // This would typically query a submissions table
      // For now, return mock data
      return {
        totalAttempts: 0,
        successRate: 0,
        averageTime: 0,
        commonErrors: []
      };
    } catch (error) {
      this.logger.error('Error getting question stats:', error);
      return null;
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.questionCache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.questionCache.delete(key);
      }
    }

    // Limit cache size
    if (this.questionCache.size > this.config.cache.memory.max) {
      const entriesToDelete = this.questionCache.size - this.config.cache.memory.max;
      const keys = Array.from(this.questionCache.keys());
      for (let i = 0; i < entriesToDelete; i++) {
        this.questionCache.delete(keys[i]);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.questionCache.clear();
    this.logger.info('Question cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.questionCache.size,
      maxSize: this.config.cache.memory.max,
      ttl: this.config.cache.memory.ttl
    };
  }
}

module.exports = QuestionService;
