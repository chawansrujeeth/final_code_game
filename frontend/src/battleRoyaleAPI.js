// frontend/src/battleRoyaleAPI.js

class BattleRoyaleAPI {
  constructor() {
    // Use environment variable or default to your Vercel URL
    // Replace 'your-vercel-app' with your actual Vercel deployment URL
    this.baseURL = process.env.REACT_APP_BACKEND_URL || 'https://your-vercel-app.vercel.app';
    console.log('Battle Royale API initialized with base URL:', this.baseURL);
    this.sessionId = null;
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  async requestQuestion(difficulty, edgeId) {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    try {
      const response = await fetch(`${this.baseURL}/api/battle-royale-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          difficulty,
          edgeId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to request question:', error);
      throw error;
    }
  }

  async submitAnswer(questionId, answer, targetNode) {
    try {
      const response = await fetch(`${this.baseURL}/api/battle-royale-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionId,
          answer,
          targetNode
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to submit answer:', error);
      throw error;
    }
  }

  // Generate session ID
  static generateSessionId() {
    return 'BR_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }
}

// Export singleton instance
export const battleRoyaleAPI = new BattleRoyaleAPI();
export default BattleRoyaleAPI;
