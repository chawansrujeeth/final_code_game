// backend/services/judge0Service.js
// Judge0 API service for backend code execution

const axios = require('axios');

class Judge0Service {
  constructor() {
    this.baseUrl = 'https://judge0-ce.p.rapidapi.com';
    this.apiKey = process.env.JUDGE0_API_KEY;
    this.apiHost = 'judge0-ce.p.rapidapi.com';
  }

  // Language IDs for Judge0
  getLanguageId(language) {
    const languageMap = {
      'javascript': 63, // Node.js
      'python': 71,     // Python 3
      'java': 62,       // Java
      'cpp': 54,        // C++
      'c': 50,          // C
      'csharp': 51,     // C#
      'go': 60,         // Go
      'rust': 73,       // Rust
      'typescript': 74  // TypeScript
    };
    return languageMap[language] || 63; // Default to JavaScript
  }

  // Submit code for execution
  async submitCode(code, language, input = '') {
    try {
      if (!this.apiKey) {
        throw new Error('Judge0 API key not configured');
      }

      const response = await axios.post(
        `${this.baseUrl}/submissions?base64_encoded=false&wait=true`,
        {
          source_code: code,
          language_id: this.getLanguageId(language),
          stdin: input,
          expected_output: null
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': this.apiHost
          },
          timeout: 30000 // 30 second timeout
        }
      );

      return this.formatResult(response.data);
    } catch (error) {
      console.error('Judge0 submission error:', error.message);
      
      if (error.response) {
        throw new Error(`Judge0 API error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Code execution timeout - please try again');
      } else {
        throw new Error(`Code execution failed: ${error.message}`);
      }
    }
  }

  // Run code with test cases
  async runTestCases(code, language, testCases) {
    const results = [];
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      try {
        const input = typeof testCase.input === 'string' ? testCase.input : JSON.stringify(testCase.input);
        const result = await this.submitCode(code, language, input);
        
        const expectedOutput = typeof testCase.output === 'string' ? testCase.output : JSON.stringify(testCase.output);
        const actualOutput = result.stdout?.trim() || '';
        
        results.push({
          testCaseIndex: i,
          input: input,
          expectedOutput: expectedOutput,
          actualOutput: actualOutput,
          passed: actualOutput === expectedOutput,
          executionTime: result.time,
          memory: result.memory,
          status: result.status,
          error: result.stderr
        });
      } catch (error) {
        results.push({
          testCaseIndex: i,
          input: testCase.input,
          expectedOutput: testCase.output,
          actualOutput: '',
          passed: false,
          executionTime: null,
          memory: null,
          status: 'Error',
          error: error.message
        });
      }
    }

    return {
      results,
      allPassed: results.every(r => r.passed),
      passedCount: results.filter(r => r.passed).length,
      totalCount: results.length
    };
  }

  // Format Judge0 result
  formatResult(result) {
    const statusMap = {
      1: 'In Queue',
      2: 'Processing',
      3: 'Accepted',
      4: 'Wrong Answer',
      5: 'Time Limit Exceeded',
      6: 'Compilation Error',
      7: 'Runtime Error (SIGSEGV)',
      8: 'Runtime Error (SIGXFSZ)',
      9: 'Runtime Error (SIGFPE)',
      10: 'Runtime Error (SIGABRT)',
      11: 'Runtime Error (NZEC)',
      12: 'Runtime Error (Other)',
      13: 'Internal Error',
      14: 'Exec Format Error'
    };

    return {
      status: statusMap[result.status?.id] || 'Unknown',
      statusId: result.status?.id,
      stdout: result.stdout,
      stderr: result.stderr,
      compile_output: result.compile_output,
      time: result.time,
      memory: result.memory,
      exit_code: result.exit_code,
      exit_signal: result.exit_signal
    };
  }

  // Get supported languages
  getSupportedLanguages() {
    return [
      { id: 'javascript', name: 'JavaScript (Node.js)', judge0Id: 63 },
      { id: 'python', name: 'Python 3', judge0Id: 71 },
      { id: 'java', name: 'Java', judge0Id: 62 },
      { id: 'cpp', name: 'C++', judge0Id: 54 },
      { id: 'c', name: 'C', judge0Id: 50 },
      { id: 'csharp', name: 'C#', judge0Id: 51 },
      { id: 'go', name: 'Go', judge0Id: 60 },
      { id: 'rust', name: 'Rust', judge0Id: 73 },
      { id: 'typescript', name: 'TypeScript', judge0Id: 74 }
    ];
  }

  // Check if API key is configured
  isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = new Judge0Service();
