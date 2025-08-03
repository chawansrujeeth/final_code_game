import React, { useState } from 'react';
import RadialNetwork from './RadialNetwork';
import Editor from '@monaco-editor/react';

export default function BattleRoyaleGame() {
  const [gameState, setGameState] = useState({
    isGameActive: true,
    playersAlive: 4,
    currentRound: 1,
    winner: null
  });
  
  const [mapState, setMapState] = useState({
    isMinimized: true,
    isFullscreen: false
  });
  
  const [players, setPlayers] = useState({
    PLAYER_A: { health: 100, currentZone: 4, currentNode: 'PLAYER_A', questionsAnswered: 0, isAlive: true },
    PLAYER_B: { health: 100, currentZone: 4, currentNode: 'PLAYER_B', questionsAnswered: 0, isAlive: true },
    PLAYER_C: { health: 100, currentZone: 4, currentNode: 'PLAYER_C', questionsAnswered: 0, isAlive: true },
    PLAYER_D: { health: 100, currentZone: 4, currentNode: 'PLAYER_D', questionsAnswered: 0, isAlive: true }
  });
  
  const [selectedPlayer, setSelectedPlayer] = useState('PLAYER_A'); // Current player
  const [accessibleEdges, setAccessibleEdges] = useState([]);
  
  // Edge-based questions - each edge represents a path with a question to traverse
  const [edgeQuestions] = useState({
    // Ring 3 to Ring 2 questions (easiest - outer to middle)
    'R3_1-R2_1': { question: "What is 2 + 2?", answer: "4", difficulty: "easy", pathType: "inward" },
    'R3_2-R2_1': { question: "What color is the sky?", answer: "blue", difficulty: "easy", pathType: "inward" },
    'R3_3-R2_2': { question: "How many legs does a cat have?", answer: "4", difficulty: "easy", pathType: "inward" },
    'R3_4-R2_2': { question: "What is the capital of France?", answer: "paris", difficulty: "easy", pathType: "inward" },
    'R3_5-R2_3': { question: "What is 5 x 3?", answer: "15", difficulty: "easy", pathType: "inward" },
    'R3_6-R2_3': { question: "Which planet is closest to the sun?", answer: "mercury", difficulty: "easy", pathType: "inward" },
    'R3_7-R2_4': { question: "What is 10 - 7?", answer: "3", difficulty: "easy", pathType: "inward" },
    'R3_8-R2_4': { question: "How many days in a week?", answer: "7", difficulty: "easy", pathType: "inward" },
    'R3_9-R2_5': { question: "What is the largest ocean?", answer: "pacific", difficulty: "easy", pathType: "inward" },
    'R3_10-R2_5': { question: "What gas do plants produce?", answer: "oxygen", difficulty: "easy", pathType: "inward" },
    'R3_11-R2_6': { question: "What is 8 / 2?", answer: "4", difficulty: "easy", pathType: "inward" },
    'R3_12-R2_6': { question: "What is 6 + 4?", answer: "10", difficulty: "easy", pathType: "inward" },
    
    // Ring 2 to Ring 1 questions (medium difficulty)
    'R2_1-R1_1': { question: "What is the square root of 64?", answer: "8", difficulty: "medium", pathType: "inward" },
    'R2_2-R1_1': { question: "Who wrote Romeo and Juliet?", answer: "shakespeare", difficulty: "medium", pathType: "inward" },
    'R2_3-R1_2': { question: "What is the chemical symbol for gold?", answer: "au", difficulty: "medium", pathType: "inward" },
    'R2_4-R1_2': { question: "In which year did World War II end?", answer: "1945", difficulty: "medium", pathType: "inward" },
    'R2_5-R1_3': { question: "What is 15% of 200?", answer: "30", difficulty: "medium", pathType: "inward" },
    'R2_6-R1_3': { question: "Which programming language is known for AI?", answer: "python", difficulty: "medium", pathType: "inward" },
    'R2_7-R1_4': { question: "What is the powerhouse of the cell?", answer: "mitochondria", difficulty: "medium", pathType: "inward" },
    'R2_8-R1_4': { question: "What is 7 x 8?", answer: "56", difficulty: "medium", pathType: "inward" },
    
    // Ring 1 to Target questions (hardest - final approach)
    'R1_1-TARGET': { question: "What is the derivative of x²?", answer: "2x", difficulty: "hard", pathType: "final" },
    'R1_2-TARGET': { question: "Who developed the theory of relativity?", answer: "einstein", difficulty: "hard", pathType: "final" },
    'R1_3-TARGET': { question: "What is the time complexity of binary search?", answer: "o(log n)", difficulty: "hard", pathType: "final" },
    'R1_4-TARGET': { question: "What is the 10th Fibonacci number?", answer: "55", difficulty: "hard", pathType: "final" },
    'R1_5-TARGET': { question: "What is the atomic number of carbon?", answer: "6", difficulty: "hard", pathType: "final" },
    'R1_6-TARGET': { question: "In which year was JavaScript created?", answer: "1995", difficulty: "hard", pathType: "final" },
    
    // Circular movement questions (lateral movement within same ring)
    'R3_1-R3_2': { question: "What is 3 + 5?", answer: "8", difficulty: "easy", pathType: "lateral" },
    'R3_2-R3_3': { question: "How many continents are there?", answer: "7", difficulty: "easy", pathType: "lateral" },
    'R2_1-R2_2': { question: "What is 12 / 4?", answer: "3", difficulty: "medium", pathType: "lateral" },
    'R2_2-R2_3': { question: "What is the capital of Italy?", answer: "rome", difficulty: "medium", pathType: "lateral" },
    'R1_1-R1_2': { question: "What is 15²?", answer: "225", difficulty: "hard", pathType: "lateral" },
    'R1_2-R1_3': { question: "What is the speed of light?", answer: "299792458", difficulty: "hard", pathType: "lateral" }
  });
  
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  
  // Handle edge clicks (when player tries to traverse a path)
  const handleEdgeClick = (edgeData) => {
    if (!edgeData.id || !gameState.isGameActive) return;
    
    const currentPlayer = players[selectedPlayer];
    if (!currentPlayer || !currentPlayer.isAlive) return;
    
    // Check if this edge is accessible from current player position
    const isAccessible = isEdgeAccessible(edgeData.id, currentPlayer.currentNode);
    if (!isAccessible) {
      console.log('Edge not accessible from current position');
      return;
    }
    
    const question = edgeQuestions[edgeData.id];
    if (!question) return;
    
    const sourceNode = edgeData.source;
    const targetNode = edgeData.target;
    
    setCurrentQuestion({
      ...question,
      edgeId: edgeData.id,
      sourceNode,
      targetNode,
      pathDescription: `${sourceNode} → ${targetNode}`,
      playerId: selectedPlayer
    });
    setPlayerAnswer('');
    setShowResult(false);
  };
  
  // Check if an edge is accessible from current player position
  const isEdgeAccessible = (edgeId, currentNode) => {
    const [source, target] = edgeId.split('-');
    // Player can traverse edge if they are at the source node
    return source === currentNode;
  };
  
  // Handle node clicks (safe points - no questions, just information)
  const handleNodeClick = (nodeData) => {
    if (!gameState.isGameActive) return;
    
    // Show node information (safe point details)
    console.log(`Clicked safe point: ${nodeData.id}`, nodeData);
  };
  
  // Handle player movement after correct answer
  const handlePlayerMove = (playerId, targetZoneLevel) => {
    setPlayers(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        currentZone: targetZoneLevel,
        questionsAnswered: prev[playerId].questionsAnswered + 1
      }
    }));
    
    // Check win condition
    if (targetZoneLevel === 0) {
      setGameState(prev => ({
        ...prev,
        isGameActive: false,
        winner: playerId
      }));
    }
  };
  
  // Submit answer for edge traversal
  const submitAnswer = () => {
    if (!currentQuestion) return;
    
    const isCorrect = playerAnswer.toLowerCase().trim() === currentQuestion.answer.toLowerCase();
    
    if (isCorrect) {
      setResultMessage(`✅ Correct! Path unlocked: ${currentQuestion.pathDescription}`);
      
      // Move player to target node
      const targetNode = currentQuestion.targetNode;
      const playerId = currentQuestion.playerId;
      
      setPlayers(prev => ({
        ...prev,
        [playerId]: {
          ...prev[playerId],
          currentNode: targetNode,
          currentZone: getZoneFromNode(targetNode),
          questionsAnswered: prev[playerId].questionsAnswered + 1
        }
      }));
      
      // Handle successful traversal
      if (currentQuestion.pathType === 'inward') {
        setResultMessage(prev => prev + " You moved closer to the center!");
      } else if (currentQuestion.pathType === 'final') {
        setResultMessage(prev => prev + " Final approach to victory!");
        
        // Check win condition
        if (targetNode === 'TARGET') {
          setGameState(prev => ({
            ...prev,
            isGameActive: false,
            winner: playerId
          }));
          setResultMessage(prev => prev + " 🎉 VICTORY! You reached the center!");
        }
      } else if (currentQuestion.pathType === 'lateral') {
        setResultMessage(prev => prev + " You repositioned within the zone.");
      }
      
    } else {
      setResultMessage(`❌ Wrong answer! Path blocked. The correct answer was: ${currentQuestion.answer}`);
      
      // Handle failed traversal - player takes damage
      setPlayers(prev => ({
        ...prev,
        [currentQuestion.playerId]: {
          ...prev[currentQuestion.playerId],
          health: Math.max(0, prev[currentQuestion.playerId].health - 10)
        }
      }));
      
      setResultMessage(prev => prev + " You lost 10 health!");
    }
    
    setShowResult(true);
    setTimeout(() => {
      setCurrentQuestion(null);
      setShowResult(false);
    }, 4000);
  };
  
  // Helper function to get zone level from node ID
  const getZoneFromNode = (nodeId) => {
    if (nodeId === 'TARGET') return 0;
    if (nodeId.startsWith('R1_')) return 1;
    if (nodeId.startsWith('R2_')) return 2;
    if (nodeId.startsWith('R3_')) return 3;
    if (nodeId.startsWith('PLAYER_')) return 4;
    return 4;
  };
  
  // Prepare node data for the network
  const nodeData = {
    ...Object.keys(players).reduce((acc, playerId) => {
      acc[playerId] = players[playerId];
      return acc;
    }, {})
  };
  
  // Toggle minimap/fullscreen
  const toggleMap = () => {
    setMapState(prev => ({
      ...prev,
      isMinimized: !prev.isMinimized,
      isFullscreen: !prev.isMinimized ? false : prev.isFullscreen
    }));
  };
  
  const toggleFullscreen = () => {
    setMapState(prev => ({
      ...prev,
      isFullscreen: !prev.isFullscreen,
      isMinimized: false
    }));
  };
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: 'linear-gradient(135deg, #2c3e50 0%, #3498db 100%)' }}>
      
      {/* Split Screen Layout */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        overflow: 'hidden'
      }}>
        
        {/* Left Side - Questions Panel */}
        <div style={{
          width: '50%',
          height: '100%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRight: '3px solid #00ff88',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          color: 'white',
          overflow: 'auto',
          overflowX: 'hidden',
          scrollBehavior: 'smooth'
        }}>
          <div style={{
            textAlign: 'center',
            marginBottom: '30px',
            borderBottom: '2px solid #00ff88',
            paddingBottom: '15px'
          }}>
            <h2 style={{ color: '#00ff88', margin: 0, fontSize: '24px' }}>
              🛤️ Path Traversal
            </h2>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '5px 0 0 0' }}>
              Click edges to traverse paths - answer questions to unlock routes
            </p>
          </div>
          
          {/* Player Selection */}
          <div style={{
            background: 'rgba(111, 66, 193, 0.1)',
            border: '2px solid #6f42c1',
            borderRadius: '12px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <h4 style={{ color: '#6f42c1', margin: '0 0 10px 0' }}>👤 Current Player</h4>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              {Object.keys(players).map(playerId => (
                <button
                  key={playerId}
                  onClick={() => setSelectedPlayer(playerId)}
                  style={{
                    background: selectedPlayer === playerId ? '#6f42c1' : 'rgba(111, 66, 193, 0.3)',
                    color: 'white',
                    border: selectedPlayer === playerId ? '2px solid #fff' : '2px solid #6f42c1',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {playerId.replace('PLAYER_', '')}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '14px', color: '#ccc' }}>
              <div>📍 Position: <span style={{ color: '#6f42c1' }}>{players[selectedPlayer]?.currentNode}</span></div>
              <div>❤️ Health: <span style={{ color: players[selectedPlayer]?.health > 50 ? '#28a745' : '#dc3545' }}>{players[selectedPlayer]?.health}/100</span></div>
              <div>🎯 Zone: <span style={{ color: '#00ff88' }}>{players[selectedPlayer]?.currentZone}</span></div>
              <div>✅ Questions: <span style={{ color: '#ffc107' }}>{players[selectedPlayer]?.questionsAnswered}</span></div>
            </div>
          </div>
          
          {/* Current Question Display */}
          {currentQuestion ? (
            <div style={{
              background: 'rgba(0, 255, 136, 0.1)',
              border: '2px solid #00ff88',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px'
              }}>
                <span style={{
                  background: currentQuestion.difficulty === 'easy' ? '#28a745' : 
                           currentQuestion.difficulty === 'medium' ? '#ffc107' : '#dc3545',
                  color: currentQuestion.difficulty === 'medium' ? '#000' : '#fff',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {currentQuestion.difficulty.toUpperCase()}
                </span>
                <span style={{ color: '#00ff88', fontSize: '14px' }}>
                  Path: {currentQuestion.pathDescription}
                </span>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ 
                  color: '#00ff88', 
                  fontSize: '14px', 
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    background: currentQuestion.pathType === 'inward' ? '#17a2b8' :
                               currentQuestion.pathType === 'lateral' ? '#ffc107' :
                               currentQuestion.pathType === 'final' ? '#dc3545' : '#6c757d',
                    color: currentQuestion.pathType === 'lateral' ? '#000' : '#fff',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}>
                    {currentQuestion.pathType.toUpperCase()}
                  </span>
                  {currentQuestion.pathType === 'inward' && '→ Moving toward center'}
                  {currentQuestion.pathType === 'lateral' && '↔ Moving within same ring'}
                  {currentQuestion.pathType === 'final' && '🎯 Final approach to victory'}
                </div>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>
                  {currentQuestion.question}
                </h3>
              </div>
              <input
                type="text"
                value={playerAnswer}
                onChange={(e) => setPlayerAnswer(e.target.value)}
                placeholder="Type your answer here..."
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  border: '2px solid #00ff88',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: 'white',
                  marginBottom: '15px'
                }}
                onKeyPress={(e) => e.key === 'Enter' && submitAnswer()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={submitAnswer}
                  style={{
                    background: 'linear-gradient(45deg, #00ff88, #00cc6a)',
                    color: '#000',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  ✅ Submit Answer
                </button>
                <button
                  onClick={() => setCurrentQuestion(null)}
                  style={{
                    background: 'linear-gradient(45deg, #dc3545, #c82333)',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ❌ Cancel
                </button>
              </div>
              
              {showResult && (
                <div style={{
                  marginTop: '15px',
                  padding: '15px',
                  borderRadius: '8px',
                  background: resultMessage.includes('✅') ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)',
                  border: `2px solid ${resultMessage.includes('✅') ? '#28a745' : '#dc3545'}`
                }}>
                  <p style={{ 
                    color: resultMessage.includes('✅') ? '#28a745' : '#dc3545',
                    fontWeight: 'bold',
                    margin: 0,
                    fontSize: '16px'
                  }}>
                    {resultMessage}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '2px dashed #666',
              borderRadius: '12px',
              padding: '30px',
              textAlign: 'center',
              color: '#999'
            }}>
              <h3 style={{ margin: '0 0 15px 0' }}>🛤️ How to Play</h3>
              <div style={{ 
                fontSize: '13px', 
                color: '#ccc',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                textAlign: 'left'
              }}>
                <div>👤 <strong>Select a player</strong> above to control</div>
                <div>🟢 <strong>Green edges</strong> = paths you can take</div>
                <div>❓ <strong>Click green edges</strong> to see questions</div>
                <div>✅ <strong>Answer correctly</strong> to move forward</div>
                <div>❌ <strong>Wrong answers</strong> = lose 10 health</div>
                <div>🎯 <strong>Reach TARGET</strong> to win!</div>
              </div>
            </div>
          )}
          
          {/* Game Instructions */}
          <div style={{
            marginTop: 'auto',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            padding: '15px'
          }}>
            <h4 style={{ color: '#00ff88', margin: '0 0 10px 0' }}>🎮 Player Movement System:</h4>
            <ul style={{ color: '#ccc', fontSize: '14px', margin: 0, paddingLeft: '20px' }}>
              <li>👤 <strong>Select player</strong> to control from buttons above</li>
              <li>🟢 <strong>Green highlighted edges</strong> = accessible paths</li>
              <li>❓ <strong>Click accessible edges</strong> to answer questions</li>
              <li>✅ <strong>Correct answers</strong> = move to new position</li>
              <li>❌ <strong>Wrong answers</strong> = lose health, stay in place</li>
              <li>🎯 <strong>Reach TARGET node</strong> to win the game!</li>
            </ul>
          </div>
        </div>
        
        {/* Right Side - Code Editor */}
        <div style={{
          width: '50%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f3460 0%, #1a1a2e 100%)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          color: 'white',
          position: 'relative',
          overflow: 'auto',
          overflowX: 'hidden',
          scrollBehavior: 'smooth'
        }}>
          <div style={{
            textAlign: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid #007bff',
            paddingBottom: '15px'
          }}>
            <h2 style={{ color: '#007bff', margin: 0, fontSize: '24px' }}>
              💻 Code Editor
            </h2>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '5px 0 0 0' }}>
              Write and test your solutions here
            </p>
          </div>
          
          {/* Language Selector */}
          <div style={{ marginBottom: '15px' }}>
            <select style={{
              background: 'rgba(0, 0, 0, 0.3)',
              color: 'white',
              border: '2px solid #007bff',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '14px'
            }}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
          </div>
          
          {/* Monaco Code Editor Area */}
          <div style={{
            flex: 1,
            border: '2px solid #007bff',
            borderRadius: '8px',
            marginBottom: '15px',
            overflow: 'hidden'
          }}>
            <Editor
              height="100%"
              defaultLanguage="javascript"
              defaultValue="// Write your code here...\n// Example:\nfunction solve() {\n    return 'Hello World!';\n}\n\nsolve();"
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                selectOnLineNumbers: true,
                roundedSelection: false,
                readOnly: false,
                cursorStyle: 'line',
              }}
            />
          </div>
          
          {/* Code Actions */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button style={{
              background: 'linear-gradient(45deg, #28a745, #20c997)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              flex: 1
            }}>
              ▶️ Run Code
            </button>
            <button style={{
              background: 'linear-gradient(45deg, #007bff, #0056b3)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}>
              💾 Save
            </button>
            <button style={{
              background: 'linear-gradient(45deg, #6c757d, #5a6268)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}>
              🗑️ Clear
            </button>
          </div>
          
          {/* Output Console */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.6)',
            border: '2px solid #28a745',
            borderRadius: '8px',
            padding: '15px',
            minHeight: '120px',
            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
            fontSize: '13px'
          }}>
            <div style={{ color: '#28a745', fontWeight: 'bold', marginBottom: '8px' }}>
              🖥️ Console Output:
            </div>
            <div style={{ color: '#ccc' }}>
              Ready to run your code...
            </div>
          </div>
       
           {/* Minimap Container - Only in Code Editor Side */}
          {mapState.isMinimized && (
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '280px',
              height: '280px',
              zIndex: 1500,
              border: '3px solid #00ff88',
              borderRadius: '15px',
              overflow: 'hidden',
              boxShadow: '0 10px 40px rgba(0,255,136,0.3)',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              background: '#1a1a2e'
            }}>
              <RadialNetwork 
                playerCount={4}
                nodeData={nodeData}
                gameState={gameState}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                onPlayerMove={handlePlayerMove}
                selectedPlayer={selectedPlayer}
                currentPlayerNode={players[selectedPlayer]?.currentNode}
                isMinimized={true}
                showHUD={false}
                enableZoom={false}
              />
              
              {/* Map Controls */}
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                zIndex: 3001,
                display: 'flex',
                gap: '6px'
              }}>
                <button
                  onClick={toggleMap}
                  style={{
                    background: 'linear-gradient(45deg, #00ff88, #00cc6a)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 8px rgba(0,255,136,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  title="Expand Map"
                  onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                >
                  🗺️ EXPAND
                </button>
              </div>
              
              {/* Minimap Label */}
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'linear-gradient(45deg, #00ff88, #00cc6a)',
                color: '#000',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '9px',
                fontWeight: 'bold',
                pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,255,136,0.4)'
              }}>
                🗺️ BATTLE MAP
              </div>
            </div>
          )}
          
          {/* Expanded Map Overlay - Only in Code Editor Side */}
          {!mapState.isMinimized && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2000,
              background: 'rgba(0, 0, 0, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                width: '90%',
                height: '90%',
                border: '2px solid #00ff88',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#1a1a2e'
              }}>
                <RadialNetwork 
                  playerCount={4}
                  nodeData={nodeData}
                  gameState={gameState}
                  onNodeClick={handleNodeClick}
                  onEdgeClick={handleEdgeClick}
                  onPlayerMove={handlePlayerMove}
                  selectedPlayer={selectedPlayer}
                  currentPlayerNode={players[selectedPlayer]?.currentNode}
                  isMinimized={false}
                  showHUD={true}
                  enableZoom={true}
                  enablePan={true}
                />
        
                {/* Map Controls */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  zIndex: 3001,
                  display: 'flex',
                  gap: '6px'
                }}>
                  <button
                    onClick={toggleMap}
                    style={{
                      background: 'linear-gradient(45deg, #dc3545, #c82333)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 8px rgba(220,53,69,0.3)'
                    }}
                    title="Minimize Map"
                  >
                    ➖ CLOSE
                  </button>
                </div>
                
                {/* Instructions for zoom/pan */}
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  background: 'rgba(0, 0, 0, 0.8)',
                  color: '#00ff88',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  zIndex: 3001,
                  border: '1px solid #00ff88'
                }}>
                  🖱️ Scroll to zoom • Drag to pan
                </div>
        
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Game Over Modal */}
      {gameState.winner && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '40px',
          borderRadius: '20px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
          zIndex: 2000,
          textAlign: 'center',
          minWidth: '300px'
        }}>
          <h2 style={{ marginBottom: '20px' }}>🏆 WINNER! 🏆</h2>
          <p style={{ fontSize: '24px', marginBottom: '20px' }}>
            {gameState.winner.replace('PLAYER_', 'Player ')} reached the Safe Zone!
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#28a745',
              color: 'white',
              border: 'none',
              padding: '15px 30px',
              borderRadius: '10px',
              fontSize: '18px',
              cursor: 'pointer'
            }}
          >
            Play Again
          </button>
        </div>
      )}
      
      {/* Overlay for modals */}
      {(currentQuestion || gameState.winner) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 2500
        }} />
      )}
    </div>
  );
}
