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
              {question.content || question.question || question.description || question.que_content}
            </div>
          </div>
        )}

        {activeTab === 'examples' && (
          <div>
            <div style={{
              background: '#2d2d30',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #4ec9b0',
              marginBottom: '16px'
            }}>
              <div style={{ color: '#4ec9b0', fontWeight: 'bold', marginBottom: '8px' }}>
                💡 How to Structure Your Code:
              </div>
              <div style={{ fontSize: '13px', color: '#cccccc', lineHeight: '1.5' }}>
                • Read the input format from the examples below<br/>
                • Your code should process the input and return the expected output<br/>
                • Use console.log() or print() to output your result<br/>
                • Test your solution with the provided examples
              </div>
            </div>

            <h4 style={{ color: '#ffffff', marginBottom: '16px' }}>Input/Output Examples:</h4>
            {question.testCases && question.testCases.length > 0 ? (
              question.testCases.map((testCase, index) => (
                <div key={index} style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: '#2d2d30',
                  borderRadius: '6px',
                  border: '1px solid #3e3e42'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '12px', color: '#4ec9b0' }}>
                    Example {index + 1}:
                  </div>
                  
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ color: '#9cdcfe', fontWeight: 'bold', marginBottom: '4px' }}>
                      📥 Input:
                    </div>
                    <code style={{
                      display: 'block',
                      background: '#1e1e1e',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontFamily: 'Monaco, Consolas, monospace',
                      fontSize: '13px',
                      border: '1px solid #444',
                      color: '#d4d4d4'
                    }}>
                      {typeof testCase.input === 'string' ? testCase.input : JSON.stringify(testCase.input, null, 2)}
                    </code>
                  </div>
                  
                  {testCase.output !== undefined && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ color: '#9cdcfe', fontWeight: 'bold', marginBottom: '4px' }}>
                        📤 Expected Output:
                      </div>
                      <code style={{
                        display: 'block',
                        background: '#1e1e1e',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        fontFamily: 'Monaco, Consolas, monospace',
                        fontSize: '13px',
                        border: '1px solid #444',
                        color: '#4fc1ff'
                      }}>
                        {typeof testCase.output === 'string' ? testCase.output : JSON.stringify(testCase.output, null, 2)}
                      </code>
                    </div>
                  )}
                  
                  {testCase.explanation && (
                    <div style={{ 
                      marginTop: '12px', 
                      padding: '8px 12px',
                      background: '#1a1a1a',
                      borderRadius: '4px',
                      border: '1px solid #444'
                    }}>
                      <div style={{ color: '#f0db4f', fontWeight: 'bold', marginBottom: '4px' }}>
                        💭 Explanation:
                      </div>
                      <div style={{ color: '#cccccc', fontSize: '13px', lineHeight: '1.4' }}>
                        {testCase.explanation}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ 
                color: '#999', 
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '20px',
                background: '#2d2d30',
                borderRadius: '6px',
                border: '1px solid #3e3e42'
              }}>
                No examples available for this question
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
