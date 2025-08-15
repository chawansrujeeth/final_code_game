// Frontend service to communicate with backend Judge0 API
class BackendJudge0Service {
  constructor() {
    this.baseUrl = process.env.REACT_APP_BATTLE_ROYALE_SERVER_URL || 'https://final-game-battleroyale.onrender.com';
  }

  // Submit code for execution via backend
  async submitCode(code, language, input = '') {
    try {
      const response = await fetch(`${this.baseUrl}/api/judge0/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          language,
          input
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Backend Judge0 submission error:', error);
      throw new Error(`Code execution failed: ${error.message}`);
    }
  }

  // Run code with test cases via backend
  async runTestCases(code, language, testCases) {
    try {
      const response = await fetch(`${this.baseUrl}/api/judge0/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          language,
          testCases
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Backend Judge0 test error:', error);
      throw new Error(`Test execution failed: ${error.message}`);
    }
  }

  // Get supported languages from backend
  async getSupportedLanguages() {
    try {
      const response = await fetch(`${this.baseUrl}/api/judge0/languages`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.languages;
    } catch (error) {
      console.error('Backend Judge0 languages error:', error);
      // Return default languages if backend fails
      return [
        { id: 'javascript', name: 'JavaScript (Node.js)', judge0Id: 63 },
        { id: 'python', name: 'Python 3', judge0Id: 71 },
        { id: 'java', name: 'Java', judge0Id: 62 },
        { id: 'cpp', name: 'C++', judge0Id: 54 },
        { id: 'c', name: 'C', judge0Id: 50 }
      ];
    }
  }

  // Check if backend Judge0 is configured
  async isConfigured() {
    try {
      const response = await fetch(`${this.baseUrl}/api/judge0/status`);
      
      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.configured;
    } catch (error) {
      console.error('Backend Judge0 status error:', error);
      return false;
    }
  }

  // Get connection status
  async getConnectionStatus() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      
      if (!response.ok) {
        return { connected: false, error: `HTTP ${response.status}` };
      }

      const result = await response.json();
      return { 
        connected: true, 
        judge0Configured: result.judge0Configured,
        serverStatus: result.status
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

const backendJudge0ServiceInstance = new BackendJudge0Service();
export default backendJudge0ServiceInstance;
