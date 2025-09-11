import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import './CodeEditorStyles.css';

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
  const [isEditorReady, setIsEditorReady] = useState(false);
  const prevLangRef = useRef(language);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

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

  const handleSubmit = useCallback(() => {
    if (typeof onSubmitAnswer === 'function') {
      onSubmitAnswer(code, language);
    }
  }, [code, language, onSubmitAnswer]);

  const handleEditorChange = useCallback((val) => {
    const v = val || '';
    setCode(v);
    setCodeByLanguage(prev => ({ ...prev, [language]: v }));
  }, [language]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      background: '#1e1e1e',
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
      borderRadius: '8px',
      border: '1px solid #333',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      transition: 'all 0.2s ease-in-out'
    }}>
      {/* Language selector */}
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid #404040',
        position: 'relative',
        zIndex: 2,
        background: 'linear-gradient(135deg, #2d2d2d 0%, #1e1e1e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#888', fontSize: '12px', fontWeight: '500' }}>Language:</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ 
              background: 'linear-gradient(135deg, #4a4a4a 0%, #3c3c3c 100%)', 
              color: '#fff', 
              border: '1px solid #666', 
              borderRadius: '6px', 
              padding: '6px 12px', 
              fontSize: '13px',
              fontWeight: '500',
              position: 'relative',
              zIndex: 3,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none'
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#777';
              e.target.style.background = 'linear-gradient(135deg, #5a5a5a 0%, #4c4c4c 100%)';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#666';
              e.target.style.background = 'linear-gradient(135deg, #4a4a4a 0%, #3c3c3c 100%)';
            }}
          >
            {computedLanguages.map((lang) => (
              <option key={lang.id} value={lang.id}>{lang.name}</option>
            ))}
          </select>
        </div>
        <div style={{ 
          color: isEditorReady ? '#4ade80' : '#fbbf24', 
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: isEditorReady ? '#4ade80' : '#fbbf24',
            animation: isEditorReady ? 'none' : 'pulse 1.5s infinite'
          }} />
          {isEditorReady ? 'Ready' : 'Loading...'}
        </div>
      </div>

      {/* Monaco editor */}
      <div style={{ 
        flex: 1,
        position: 'relative',
        zIndex: 1,
        overflow: 'hidden',
        background: '#1e1e1e'
      }}>
        <Editor
          key={language}
          path={`file.${language}`}
          language={language}
          value={code}
          onChange={handleEditorChange}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            setIsEditorReady(true);
            
            // Configure editor for better performance
            editor.updateOptions({
              smoothScrolling: true,
              cursorSmoothCaretAnimation: true,
              renderLineHighlight: 'gutter',
              occurrencesHighlight: false,
              renderValidationDecorations: 'on',
              hideCursorInOverviewRuler: true
            });
            
            // Focus after a brief delay to ensure smooth rendering
            requestAnimationFrame(() => {
              editor.focus();
            });
          }}
          beforeMount={(monaco) => {
            // Configure Monaco themes and settings before mount for smoother initialization
            monaco.editor.defineTheme('smooth-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#d4d4d4',
                'editorLineNumber.foreground': '#858585',
                'editorLineNumber.activeForeground': '#c6c6c6',
                'editor.selectionBackground': '#264f78',
                'editor.inactiveSelectionBackground': '#3a3d41'
              }
            });
          }}
          theme="smooth-dark"
          options={{
            fontSize: 14,
            fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
            fontLigatures: true,
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            selectOnLineNumbers: true,
            roundedSelection: false,
            readOnly: false,
            cursorStyle: 'line',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            mouseWheelScrollSensitivity: 1,
            fastScrollSensitivity: 5,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              useShadows: false,
              verticalHasArrows: false,
              horizontalHasArrows: false,
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8
            },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            renderLineHighlight: 'gutter',
            renderWhitespace: 'none',
            renderControlCharacters: false,
            renderIndentGuides: true,
            renderValidationDecorations: 'on',
            occurrencesHighlight: false,
            selectionHighlight: false,
            codeLens: false,
            folding: true,
            foldingHighlight: false,
            unfoldOnClickAfterEndOfLine: false,
            showUnused: false,
            bracketPairColorization: {
              enabled: true
            },
            guides: {
              bracketPairs: true,
              indentation: false
            },
            suggest: {
              showKeywords: true,
              showSnippets: true,
              showFunctions: true,
              showConstructors: true,
              showFields: true,
              showVariables: true,
              showClasses: true,
              showStructs: true,
              showInterfaces: true,
              showModules: true,
              showProperties: true,
              showEvents: true,
              showOperators: true,
              showUnits: true,
              showValues: true,
              showConstants: true,
              showEnums: true,
              showEnumMembers: true,
              showColors: true,
              showFiles: true,
              showReferences: true,
              showFolders: true,
              showTypeParameters: true,
              showIssues: true,
              showUsers: true,
              showWords: true
            },
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false
            },
            parameterHints: {
              enabled: true,
              cycle: true
            },
            autoIndent: 'full',
            formatOnPaste: true,
            formatOnType: true,
            tabCompletion: 'on',
            wordBasedSuggestions: true,
            semanticHighlighting: {
              enabled: true
            }
          }}
        />
      </div>

      {/* Submit */}
      <div style={{ 
        padding: '12px 16px', 
        borderTop: '1px solid #404040', 
        textAlign: 'right',
        position: 'relative',
        zIndex: 2,
        background: 'linear-gradient(135deg, #2d2d2d 0%, #1e1e1e 100%)'
      }}>
        <button
          onClick={handleSubmit}
          disabled={!isEditorReady}
          style={{ 
            background: isEditorReady 
              ? 'linear-gradient(135deg, #ff6b35 0%, #ff4500 100%)' 
              : 'linear-gradient(135deg, #666 0%, #555 100%)', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '8px', 
            padding: '10px 24px', 
            fontWeight: '600', 
            fontSize: '14px',
            cursor: isEditorReady ? 'pointer' : 'not-allowed',
            position: 'relative',
            zIndex: 3,
            transition: 'all 0.2s ease',
            boxShadow: isEditorReady 
              ? '0 2px 8px rgba(255, 107, 53, 0.3)' 
              : '0 2px 8px rgba(0, 0, 0, 0.2)',
            transform: 'translateY(0)',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            if (isEditorReady) {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (isEditorReady) {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(255, 107, 53, 0.3)';
            }
          }}
          onMouseDown={(e) => {
            if (isEditorReady) {
              e.target.style.transform = 'translateY(1px)';
            }
          }}
          onMouseUp={(e) => {
            if (isEditorReady) {
              e.target.style.transform = 'translateY(-1px)';
            }
          }}
        >
          {isEditorReady ? 'Submit Solution' : 'Loading...'}
        </button>
      </div>
    </div>
  );
};

export default LeetCodeCodeEditor;
