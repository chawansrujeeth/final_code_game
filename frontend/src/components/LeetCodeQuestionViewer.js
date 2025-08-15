import React, { useState } from 'react';

const LeetCodeQuestionViewer = ({ question, onClose }) => {
  const [activeTab, setActiveTab] = useState('description');

  if (!question) return null;

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
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        background: '#252526'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            background: question.difficulty === 'easy' ? '#00b8a3' : 
                       question.difficulty === 'medium' ? '#ffc01e' : '#ff375f',
            color: 'white'
          }}>
            {question.difficulty?.toUpperCase()}
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            {question.title || 'Coding Challenge'}
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px'
          }}
          onMouseEnter={(e) => e.target.style.background = '#333'}
          onMouseLeave={(e) => e.target.style.background = 'none'}
        >
          ✕
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #333',
        background: '#252526'
      }}>
        {['description', 'examples', 'constraints'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? '#1e1e1e' : 'transparent',
              border: 'none',
              color: activeTab === tab ? '#ffffff' : '#999',
              padding: '12px 16px',
              cursor: 'pointer',
              fontSize: '14px',
              borderBottom: activeTab === tab ? '2px solid #007acc' : 'none',
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        padding: '16px',
        overflowY: 'auto',
        lineHeight: '1.6'
      }}>
        {activeTab === 'description' && (
          <div>
            <div style={{
              fontSize: '14px',
              marginBottom: '20px',
              whiteSpace: 'pre-wrap'
            }}>
              {question.question || question.description}
            </div>
          </div>
        )}

        {activeTab === 'examples' && (
          <div>
            <h4 style={{ color: '#ffffff', marginBottom: '16px' }}>Examples:</h4>
            {question.testCases && question.testCases.length > 0 ? (
              question.testCases.map((testCase, index) => (
                <div key={index} style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: '#2d2d30',
                  borderRadius: '6px',
                  border: '1px solid #3e3e42'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#4ec9b0' }}>
                    Example {index + 1}:
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ color: '#9cdcfe' }}>Input: </span>
                    <code style={{
                      background: '#1e1e1e',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontFamily: 'Monaco, Consolas, monospace'
                    }}>
                      {typeof testCase.input === 'string' ? testCase.input : JSON.stringify(testCase.input)}
                    </code>
                  </div>
                  {testCase.output !== undefined && (
                    <div>
                      <span style={{ color: '#9cdcfe' }}>Output: </span>
                      <code style={{
                        background: '#1e1e1e',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontFamily: 'Monaco, Consolas, monospace'
                      }}>
                        {typeof testCase.output === 'string' ? testCase.output : JSON.stringify(testCase.output)}
                      </code>
                    </div>
                  )}
                  {testCase.explanation && (
                    <div style={{ marginTop: '8px', color: '#cccccc', fontSize: '13px' }}>
                      <strong>Explanation:</strong> {testCase.explanation}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ color: '#999', fontStyle: 'italic' }}>
                No examples available
              </div>
            )}
          </div>
        )}

        {activeTab === 'constraints' && (
          <div>
            <h4 style={{ color: '#ffffff', marginBottom: '16px' }}>Constraints:</h4>
            <div style={{
              background: '#2d2d30',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #3e3e42'
            }}>
              {question.constraints ? (
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {Array.isArray(question.constraints) ? 
                    question.constraints.map((constraint, index) => (
                      <li key={index} style={{ marginBottom: '4px', color: '#cccccc' }}>
                        {constraint}
                      </li>
                    )) : (
                      <li style={{ color: '#cccccc' }}>{question.constraints}</li>
                    )
                  }
                </ul>
              ) : (
                <div style={{ color: '#999', fontStyle: 'italic' }}>
                  No specific constraints provided
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeetCodeQuestionViewer;
