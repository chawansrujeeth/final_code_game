// backend/services/judge0Service.js
// Judge0 API service for backend code execution

const axios = require('axios');

class Judge0Service {
  constructor() {
    this.baseUrl = 'https://judge0-ce.p.rapidapi.com';
    // Support multiple keys with rotation. Prefer numbered keys, then single vars.
    // Collect any env vars that start with "JUDGE0_" and contain a value
    const dynamicKeys = Object.entries(process.env)
      .filter(([key, val]) => key.startsWith('JUDGE0_') && Boolean(val))
      .map(([, val]) => val);

    this.apiKeys = [
      process.env.JUDGE0_KEY_1,
      process.env.JUDGE0_KEY_2,
      process.env.JUDGE0_KEY_3,
      process.env.JUDGE0_API_KEY,
      process.env.JUDGE0_KEY
    ].filter(Boolean).concat(dynamicKeys);
    // Backward compatibility for code referencing this.apiKey
    this.apiKey = this.apiKeys[0] || null;
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
  async submitCode(code, language, input = '', expectedOutput = null) {
    if (!this.apiKeys || this.apiKeys.length === 0) {
      throw new Error('Judge0 API key not configured');
    }

    let lastError = null;

    for (let i = 0; i < this.apiKeys.length; i++) {
      const key = this.apiKeys[i];
      try {
        const response = await axios.post(
          `${this.baseUrl}/submissions?base64_encoded=false&wait=true`,
          {
            source_code: code,
            language_id: this.getLanguageId(language),
            // Ensure stdin is always a string; Judge0 drops undefined properties
            stdin: typeof input === 'string' ? input : (input == null ? '' : String(input)),
            // Pass expected_output along so Judge0 can also compute a status
            expected_output: (typeof expectedOutput === 'string' ? expectedOutput : (expectedOutput == null ? null : String(expectedOutput)))
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-RapidAPI-Key': key,
              'X-RapidAPI-Host': this.apiHost
            },
            timeout: 30000 // 30 second timeout
          }
        );

        return this.formatResult(response.data);
      } catch (error) {
        // For rate limit/forbidden/server errors, try the next key
        if (error.response && (error.response.status === 429 || error.response.status === 403 || error.response.status === 500)) {
          lastError = error;
          continue;
        }
        // Timeout: bubble up a friendly message
        if (error.code === 'ECONNABORTED') {
          lastError = new Error('Code execution timeout - please try again');
          break;
        }
        // Other errors: stop and report
        lastError = error;
        break;
      }
    }

    if (lastError) {
      if (lastError.response) {
        throw new Error(`Judge0 API error: ${lastError.response.status} - ${lastError.response.data?.message || 'Unknown error'}`);
      }
      throw new Error(`Code execution failed: ${lastError.message}`);
    }
    throw new Error('Code execution failed: Unknown error');
  }

  // Normalize heterogeneous test case shapes into a consistent array
  normalizeTestCases(testCases) {
    try {
      // If testCases is a JSON string, try to parse it
      if (typeof testCases === 'string') {
        try {
          const parsed = JSON.parse(testCases);
          return this.normalizeTestCases(parsed);
        } catch (_) {
          // If it's a plain string (e.g., raw stdin), treat as single input with unknown expected output
          return [{ input: testCases, output: undefined }];
        }
      }

      // If it's a single object, wrap into array
      if (testCases && !Array.isArray(testCases)) {
        // Support shape: { inputs: [...], outputs: [...] }
        if (Array.isArray(testCases.inputs) || Array.isArray(testCases.outputs)) {
          const ins = Array.isArray(testCases.inputs) ? testCases.inputs : [];
          const outs = Array.isArray(testCases.outputs) ? testCases.outputs : [];
          const len = Math.max(ins.length, outs.length);
          const expanded = [];
          for (let i = 0; i < len; i++) {
            expanded.push({
              input: ins[i] !== undefined ? ins[i] : '',
              output: outs[i] !== undefined ? outs[i] : undefined
            });
          }
          return this.normalizeTestCases(expanded);
        }
        // Support shape: { cases: [...] }
        if (Array.isArray(testCases.cases)) {
          return this.normalizeTestCases(testCases.cases);
        }
        return this.normalizeTestCases([testCases]);
      }

      // If it's already an array, map each item to { input, output }
      if (Array.isArray(testCases)) {
        // Edge case: array contains a single object with inputs/outputs
        if (testCases.length === 1 && testCases[0] && (Array.isArray(testCases[0].inputs) || Array.isArray(testCases[0].outputs))) {
          return this.normalizeTestCases(testCases[0]);
        }
        return testCases.map((tc) => {
          // If item itself is a string, interpret as stdin-only
          if (typeof tc === 'string') {
            return { input: tc, output: undefined };
          }
          // Otherwise, try common fields
          const input =
            tc?.input ?? tc?.stdin ?? tc?.in ?? tc?.args ?? tc?.parameters ?? '';
          const output =
            tc?.output ?? tc?.expected_output ?? tc?.expected ?? tc?.out ?? undefined;

          // If input is an object/array, stringify; ensure string for Judge0
          const inputStr =
            typeof input === 'string' ? input : (input == null ? '' : JSON.stringify(input));
          // For output, keep string if provided
          const outputStr =
            typeof output === 'string' ? output : (output == null ? undefined : JSON.stringify(output));

          return { input: inputStr, output: outputStr };
        });
      }

      // Fallback: no valid cases
      return [];
    } catch (e) {
      // On any unexpected error, return empty list
      return [];
    }
  }

  // Run code with test cases
  async runTestCases(code, language, testCases) {
    const normalized = this.normalizeTestCases(testCases);
    const results = [];
    
    for (let i = 0; i < normalized.length; i++) {
      const testCase = normalized[i];
      try {
        const input = typeof testCase.input === 'string' ? testCase.input : (testCase.input == null ? '' : String(testCase.input));
        const expectedOutput = typeof testCase.output === 'string' ? testCase.output : (testCase.output == null ? undefined : String(testCase.output));
        const result = await this.submitCode(code, language, input, expectedOutput);

        // Normalize outputs for comparison (trim trailing whitespace/newlines)
        const actualOutput = (result.stdout ?? '').toString().trim();
        const expectedTrimmed = (expectedOutput ?? '').toString().trim();
        const passed = expectedOutput == null ? false : (actualOutput === expectedTrimmed);
        
        results.push({
          testCaseIndex: i,
          input: input,
          expectedOutput: expectedOutput,
          actualOutput: actualOutput,
          passed: passed,
          executionTime: result.time,
          memory: result.memory,
          status: result.status,
          error: result.stderr || result.compile_output || null
        });
      } catch (error) {
        results.push({
          testCaseIndex: i,
          input: normalized[i]?.input,
          expectedOutput: normalized[i]?.output,
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
      allPassed: results.length > 0 && results.every(r => r.passed),
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
    return Array.isArray(this.apiKeys) && this.apiKeys.length > 0;
  }
}

module.exports = new Judge0Service();
