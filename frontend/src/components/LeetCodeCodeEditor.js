import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import backendJudge0Service from '../services/backendJudge0Service';

const LeetCodeCodeEditor = ({ question, onSubmitAnswer }) => {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [activeTab, setActiveTab] = useState('code');
  const [customInput, setCustomInput] = useState('');
  const [customOutput, setCustomOutput] = useState('');
  const [supportedLanguages, setSupportedLanguages] = useState([]);
  const [backendStatus, setBackendStatus] = useState({ connected: false, judge0Configured: false });
  const editorRef = useRef(null);

  // Language templates
  const getTemplate = (lang) => {
    const templates = {
      javascript: `// Write your solution here
function solution(input) {
    // Your code here
    return result;
}

// Example usage:
// console.log(solution("your input"));`,
      python: `# Write your solution here
def solution(input_data):
    # Your code here
    return result

# Example usage:
# print(solution("your input"))`,
      java: `public class Solution {
    public static void main(String[] args) {
        // Your code here
    }
    
    public static String solution(String input) {
        // Your code here
        return result;
    }
}`,
      cpp: `#include <iostream>
#include <string>
using namespace std;

string solution(string input) {
    // Your code here
    return result;
}

int main() {
    // Your code here
    return 0;
}`
    };
    return templates[lang] || templates.javascript;
  };

  useEffect(() => {
    setCode(getTemplate(language));
  }, [language]);

  // Load supported languages and check backend status
  useEffect(() => {
    const loadLanguagesAndStatus = async () => {
      try {
        const [languages, status] = await Promise.all([
          backendJudge0Service.getSupportedLanguages(),
          backendJudge0Service.getConnectionStatus()
        ]);
        setSupportedLanguages(languages);
        setBackendStatus(status);
      } catch (error) {
        console.error('Failed to load languages or status:', error);
        // Set default languages if backend fails
        setSupportedLanguages([
          { id: 'javascript', name: 'JavaScript (Node.js)' },
          { id: 'python', name: 'Python 3' },
          { id: 'java', name: 'Java' },
          { id: 'cpp', name: 'C++' },
          { id: 'c', name: 'C' }
        ]);
      }
    };
    loadLanguagesAndStatus();
  }, []);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // Configure editor options
    editor.updateOptions({
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: 'on',
      folding: true,
      selectOnLineNumbers: true,
      automaticLayout: true
    });
  };

  const runCode = async () => {
    if (!backendStatus.connected) {
      alert('Backend server not connected. Please check your connection.');
      return;
    }

    if (!backendStatus.judge0Configured) {
      alert('Judge0 API not configured on backend server.');
      return;
    }

    setIsRunning(true);
    setActiveTab('output');
    
    try {
      const result = await backendJudge0Service.submitCode(code, language, customInput);
      setCustomOutput(result.stdout || result.stderr || 'No output');
    } catch (error) {
      setCustomOutput(`Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runTestCases = async () => {
    if (!backendStatus.connected) {
      alert('Backend server not connected. Please check your connection.');
      return;
    }

    if (!backendStatus.judge0Configured) {
      alert('Judge0 API not configured on backend server.');
      return;
    }

    if (!question?.testCases || question.testCases.length === 0) {
      alert('No test cases available for this question.');
      return;
    }

    setIsRunning(true);
    setActiveTab('testcases');
    
    try {
      const results = await backendJudge0Service.runTestCases(code, language, question.testCases);
      setTestResults(results);
    } catch (error) {
      setTestResults({
        results: [],
        allPassed: false,
        passedCount: 0,
        totalCount: 0,
        error: error.message
      });
    } finally {
      setIsRunning(false);
    }
  };

  const submitSolution = async () => {
    if (!question?.testCases || question.testCases.length === 0) {
      // If no test cases, submit directly with language
      onSubmitAnswer(code, language);
      return;
    }

    if (!backendStatus.connected) {
      alert('Backend server not connected. Please check your connection.');
      return;
    }

    if (!backendStatus.judge0Configured) {
      alert('Judge0 API not configured on backend server.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const results = await backendJudge0Service.runTestCases(code, language, question.testCases);
      
      if (results.allPassed) {
        onSubmitAnswer(code, language, true, results);
      } else {
        onSubmitAnswer(code, language, false, results);
      }
    } catch (error) {
      onSubmitAnswer(code, language, false, { error: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#1e1e1e',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid #333',
        background: '#252526'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{
              background: '#3c3c3c',
              color: '#ffffff',
              border: '1px solid #555',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px'
            }}
          >
            {supportedLanguages.map(lang => (
              <option key={lang.id} value={lang.id}>{lang.name}</option>
            ))}
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={runCode}
            disabled={isRunning}
            style={{
              background: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.6 : 1
            }}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <button
            onClick={runTestCases}
            disabled={isRunning}
            style={{
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.6 : 1
            }}
          >
            {isRunning ? 'Testing...' : '🧪 Test'}
          </button>
          
          <button
            onClick={submitSolution}
            disabled={isSubmitting}
            style={{
              background: '#ff6b35',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1
            }}
          >
            {isSubmitting ? 'Submitting...' : '📤 Submit'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #333',
        background: '#252526'
      }}>
        {['code', 'output', 'testcases'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? '#1e1e1e' : 'transparent',
              border: 'none',
              color: activeTab === tab ? '#ffffff' : '#999',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '12px',
              borderBottom: activeTab === tab ? '2px solid #007acc' : 'none',
              textTransform: 'capitalize'
            }}
          >
            {tab === 'testcases' ? 'Test Cases' : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'code' && (
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={setCode}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              folding: true,
              selectOnLineNumbers: true,
              automaticLayout: true
            }}
          />
        )}

        {activeTab === 'output' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '8px 16px',
              borderBottom: '1px solid #333',
              background: '#252526',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              Custom Input:
            </div>
            <textarea
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Enter custom input here..."
              style={{
                height: '80px',
                background: '#2d2d30',
                color: '#ffffff',
                border: 'none',
                padding: '8px',
                fontSize: '12px',
                fontFamily: 'Monaco, Consolas, monospace',
                resize: 'none',
                outline: 'none'
              }}
            />
            <div style={{
              padding: '8px 16px',
              borderBottom: '1px solid #333',
              background: '#252526',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              Output:
            </div>
            <div style={{
              flex: 1,
              background: '#2d2d30',
              padding: '8px',
              fontFamily: 'Monaco, Consolas, monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              overflowY: 'auto'
            }}>
              {customOutput || 'Click "Run" to see output here...'}
            </div>
          </div>
        )}

        {activeTab === 'testcases' && (
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
            {testResults ? (
              <div>
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  borderRadius: '6px',
                  background: testResults.allPassed ? '#1e3a1e' : '#3a1e1e',
                  border: `1px solid ${testResults.allPassed ? '#28a745' : '#dc3545'}`
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {testResults.allPassed ? '✅ All Tests Passed!' : '❌ Some Tests Failed'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#cccccc' }}>
                    {testResults.passedCount} / {testResults.totalCount} test cases passed
                  </div>
                </div>

                {testResults.results?.map((result, index) => (
                  <div key={index} style={{
                    marginBottom: '12px',
                    padding: '12px',
                    borderRadius: '6px',
                    background: '#2d2d30',
                    border: `1px solid ${result.passed ? '#28a745' : '#dc3545'}`
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      <span style={{ color: result.passed ? '#28a745' : '#dc3545' }}>
                        {result.passed ? '✅' : '❌'} Test Case {index + 1}
                      </span>
                      {result.executionTime && (
                        <span style={{ marginLeft: 'auto', color: '#999' }}>
                          {result.executionTime}s
                        </span>
                      )}
                    </div>
                    
                    <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: '#9cdcfe' }}>Input: </span>
                      <code style={{ background: '#1e1e1e', padding: '2px 4px', borderRadius: '2px' }}>
                        {result.input}
                      </code>
                    </div>
                    
                    <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: '#9cdcfe' }}>Expected: </span>
                      <code style={{ background: '#1e1e1e', padding: '2px 4px', borderRadius: '2px' }}>
                        {result.expectedOutput}
                      </code>
                    </div>
                    
                    <div style={{ fontSize: '11px' }}>
                      <span style={{ color: '#9cdcfe' }}>Actual: </span>
                      <code style={{ 
                        background: '#1e1e1e', 
                        padding: '2px 4px', 
                        borderRadius: '2px',
                        color: result.passed ? '#28a745' : '#dc3545'
                      }}>
                        {result.actualOutput || 'No output'}
                      </code>
                    </div>
                    
                    {result.error && (
                      <div style={{ 
                        fontSize: '11px', 
                        marginTop: '4px', 
                        color: '#dc3545',
                        fontStyle: 'italic'
                      }}>
                        Error: {result.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                color: '#999', 
                marginTop: '40px',
                fontSize: '14px'
              }}>
                Click "Test" to run test cases and see results here...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeetCodeCodeEditor;
