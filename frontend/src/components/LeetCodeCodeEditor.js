import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';

// Starter templates (can be overridden via initialCode prop)
const baseTemplates = {
  javascript: `// Write your solution here\nfunction solution(input) {\n  // TODO\n  return null;\n}\n\n// console.log(solution('your input'));`,
  python: `# Write your solution here\ndef solution(input):\n    # TODO\n    return None\n\n# print(solution('your input'))`,
  java: `public class Solution {\n  public static void main(String[] args) {\n    // TODO\n  }\n\n  static Object solution(Object input) {\n    // TODO\n    return null;\n  }\n}`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  // TODO\n  return 0;\n}`
};

// Minimal Monaco code editor with language selector and Submit button.
// Pass an `onSubmitAnswer(code, language)` prop to receive the code on submit.
const LeetCodeCodeEditor = ({ onSubmitAnswer, supportedLanguages, initialCode, question }) => {
  const computedLanguages = (Array.isArray(supportedLanguages) && supportedLanguages.length > 0)
    ? supportedLanguages
    : [
        { id: 'javascript', name: 'JavaScript (Node.js)' },
        { id: 'python', name: 'Python 3' },
        { id: 'java', name: 'Java' },
        { id: 'cpp', name: 'C++' }
      ];
  const [language, setLanguage] = useState(computedLanguages[0]?.id || 'javascript');
  const [code, setCode] = useState('');
  const [codeByLanguage, setCodeByLanguage] = useState({});
  const prevLangRef = useRef(language);
  const editorRef = useRef(null);

  const templates = useMemo(
    () => ({ ...baseTemplates, ...(initialCode || {}) }),
    [initialCode]
  );

  // Initialize code on mount and handle language switching while preserving per-language buffers
  useEffect(() => {
    // Save current code for the previous language
    const prevLang = prevLangRef.current;
    setCodeByLanguage(prev => ({
      ...prev,
      [prevLang]: code
    }));

    // Load code for the new language or fall back to template
    setCode((prevCodes) => {
      const nextFromState = (codeByLanguage && typeof codeByLanguage[language] === 'string') ? codeByLanguage[language] : undefined;
      const nextCode = nextFromState !== undefined ? nextFromState : (templates[language] || '');
      return nextCode;
    });

    prevLangRef.current = language;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, templates]);

  const handleSubmit = () => {
    if (typeof onSubmitAnswer === 'function') {
      onSubmitAnswer(code, language);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      background: '#1e1e1e',
      position: 'relative',
      zIndex: 1
    }}>
      {/* Language selector */}
      <div style={{ 
        padding: '8px 12px', 
        borderBottom: '1px solid #333',
        position: 'relative',
        zIndex: 2
      }}>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{ 
            background: '#3c3c3c', 
            color: '#fff', 
            border: '1px solid #555', 
            borderRadius: 4, 
            padding: '4px 8px', 
            fontSize: 12,
            position: 'relative',
            zIndex: 3
          }}
        >
          {computedLanguages.map((lang) => (
            <option key={lang.id} value={lang.id}>{lang.name}</option>
          ))}
        </select>
      </div>

      {/* Monaco editor */}
      <div style={{ 
        flex: 1,
        position: 'relative',
        zIndex: 1
      }}>
        <Editor
          key={language}
          path={`file.${language}`}
          language={language}
          value={code}
          onChange={(val) => {
            const v = val || '';
            setCode(v);
            setCodeByLanguage(prev => ({ ...prev, [language]: v }));
          }}
          onMount={(editor) => {
            editorRef.current = editor;
            setTimeout(() => {
              editor.focus();
            }, 100);
          }}
          theme="vs-dark"
          options={{ 
            fontSize: 14, 
            minimap: { enabled: false }, 
            scrollBeyondLastLine: false, 
            wordWrap: 'on', 
            automaticLayout: true,
            selectOnLineNumbers: true,
            roundedSelection: false,
            readOnly: false,
            cursorStyle: 'line'
          }}
        />
      </div>

      {/* Submit */}
      <div style={{ 
        padding: '8px 12px', 
        borderTop: '1px solid #333', 
        textAlign: 'right',
        position: 'relative',
        zIndex: 2
      }}>
        <button
          onClick={handleSubmit}
          style={{ 
            background: '#ff6b35', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 4, 
            padding: '6px 16px', 
            fontWeight: 'bold', 
            cursor: 'pointer',
            position: 'relative',
            zIndex: 3
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
};

export default LeetCodeCodeEditor;
