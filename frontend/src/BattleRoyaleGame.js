import React, { useState, useEffect } from 'react';
import RadialNetwork from './RadialNetwork';

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
    PLAYER_A: { health: 100, currentZone: 4, questionsAnswered: 0, isAlive: true },
    PLAYER_B: { health: 100, currentZone: 4, questionsAnswered: 0, isAlive: true },
    PLAYER_C: { health: 100, currentZone: 4, questionsAnswered: 0, isAlive: true },
    PLAYER_D: { health: 100, currentZone: 4, questionsAnswered: 0, isAlive: true }
  });
  
  const [questions] = useState({
    // Zone 3 questions (easiest)
    q3_1: { question: "What is 2 + 2?", answer: "4", difficulty: "easy" },
    q3_2: { question: "What color is the sky?", answer: "blue", difficulty: "easy" },
    q3_3: { question: "How many legs does a cat have?", answer: "4", difficulty: "easy" },
    q3_4: { question: "What is the capital of France?", answer: "paris", difficulty: "easy" },
    q3_5: { question: "What is 5 x 3?", answer: "15", difficulty: "easy" },
    q3_6: { question: "Which planet is closest to the sun?", answer: "mercury", difficulty: "easy" },
    q3_7: { question: "What is 10 - 7?", answer: "3", difficulty: "easy" },
    q3_8: { question: "How many days in a week?", answer: "7", difficulty: "easy" },
    q3_9: { question: "What is the largest ocean?", answer: "pacific", difficulty: "easy" },
    q3_10: { question: "What is 6 + 4?", answer: "10", difficulty: "easy" },
    q3_11: { question: "What gas do plants produce?", answer: "oxygen", difficulty: "easy" },
    q3_12: { question: "What is 8 / 2?", answer: "4", difficulty: "easy" },
    
    // Zone 2 questions (medium)
    q2_1: { question: "What is the square root of 64?", answer: "8", difficulty: "medium" },
    q2_2: { question: "Who wrote Romeo and Juliet?", answer: "shakespeare", difficulty: "medium" },
    q2_3: { question: "What is the chemical symbol for gold?", answer: "au", difficulty: "medium" },
    q2_4: { question: "In which year did World War II end?", answer: "1945", difficulty: "medium" },
    q2_5: { question: "What is 15% of 200?", answer: "30", difficulty: "medium" },
    q2_6: { question: "Which programming language is known for AI?", answer: "python", difficulty: "medium" },
    q2_7: { question: "What is the powerhouse of the cell?", answer: "mitochondria", difficulty: "medium" },
    q2_8: { question: "What is 7 x 8?", answer: "56", difficulty: "medium" },
    
    // Zone 1 questions (hard)
    q1_1: { question: "What is the derivative of x²?", answer: "2x", difficulty: "hard" },
    q1_2: { question: "Who developed the theory of relativity?", answer: "einstein", difficulty: "hard" },
    q1_3: { question: "What is the time complexity of binary search?", answer: "o(log n)", difficulty: "hard" },
    q1_4: { question: "What is the 10th Fibonacci number?", answer: "55", difficulty: "hard" },
    q1_5: { question: "What is the atomic number of carbon?", answer: "6", difficulty: "hard" },
    q1_6: { question: "In which year was JavaScript created?", answer: "1995", difficulty: "hard" }
  });
  
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  
  // Handle node clicks (when player tries to answer a question)
  const handleNodeClick = (nodeData) => {
    if (!nodeData.questionId || !gameState.isGameActive) return;
    
    const question = questions[nodeData.questionId];
    if (!question) return;
    
    setCurrentQuestion({
      ...question,
      nodeId: nodeData.id,
      questionId: nodeData.questionId
    });
    setPlayerAnswer('');
    setShowResult(false);
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
  
  // Submit answer
  const submitAnswer = () => {
    if (!currentQuestion) return;
    
    const isCorrect = playerAnswer.toLowerCase().trim() === currentQuestion.answer.toLowerCase();
    
    if (isCorrect) {
      setResultMessage(`✅ Correct! You can now move to the next zone.`);
      // Allow movement logic here
    } else {
      setResultMessage(`❌ Wrong answer! The correct answer was: ${currentQuestion.answer}`);
      // Damage logic here
    }
    
    setShowResult(true);
    setTimeout(() => {
      setCurrentQuestion(null);
      setShowResult(false);
    }, 3000);
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
      
      {/* Main Game Area */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: mapState.isMinimized ? '320px' : 0,
        bottom: 0,
        background: 'linear-gradient(45deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '24px',
        fontWeight: 'bold'
      }}>
        🎮 BGMI Battle Royale Quiz Game
        <br />
        <div style={{ fontSize: '16px', marginTop: '20px', textAlign: 'center' }}>
          📍 Use the minimap to navigate zones<br />
          🎯 Answer questions to progress<br />
          🏃 Survive the blue zone<br />
          🏆 Reach the safe zone to win!
        </div>
      </div>
      
      {/* Minimap Container */}
      <div style={{
        position: 'absolute',
        top: mapState.isFullscreen ? 0 : '10px',
        right: mapState.isFullscreen ? 0 : '10px',
        width: mapState.isFullscreen ? '100%' : (mapState.isMinimized ? '300px' : '100%'),
        height: mapState.isFullscreen ? '100%' : (mapState.isMinimized ? '300px' : '100%'),
        zIndex: mapState.isFullscreen ? 2000 : 1000,
        border: mapState.isMinimized ? '2px solid #fff' : 'none',
        borderRadius: mapState.isMinimized ? '12px' : '0px',
        overflow: 'hidden',
        boxShadow: mapState.isMinimized ? '0 8px 32px rgba(0,0,0,0.5)' : 'none',
        transition: 'all 0.3s ease'
      }}>
        <RadialNetwork 
          playerCount={4}
          nodeData={nodeData}
          gameState={gameState}
          onNodeClick={handleNodeClick}
          onPlayerMove={handlePlayerMove}
          isMinimized={mapState.isMinimized}
          showHUD={!mapState.isMinimized}
          enableZoom={!mapState.isMinimized}
        />
        
        {/* Map Controls */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1001,
          display: 'flex',
          gap: '5px'
        }}>
          {mapState.isMinimized && (
            <button
              onClick={toggleMap}
              style={{
                background: 'rgba(0,0,0,0.8)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
              title="Expand Map"
            >
              🗺️ EXPAND
            </button>
          )}
          
          {!mapState.isMinimized && (
            <>
              <button
                onClick={toggleFullscreen}
                style={{
                  background: 'rgba(0,0,0,0.8)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
                title={mapState.isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {mapState.isFullscreen ? '🔲 EXIT' : '⛶ FULL'}
              </button>
              <button
                onClick={toggleMap}
                style={{
                  background: 'rgba(0,0,0,0.8)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
                title="Minimize Map"
              >
                ➖ MIN
              </button>
            </>
          )}
        </div>
        
        {/* Minimap Label */}
        {mapState.isMinimized && (
          <div style={{
            position: 'absolute',
            bottom: '5px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 'bold',
            pointerEvents: 'none'
          }}>
            🗺️ BATTLE MAP
          </div>
        )}
      </div>
      
      {/* Question Modal */}
      {currentQuestion && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '30px',
          borderRadius: '15px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 2000,
          minWidth: '400px',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#333', marginBottom: '20px' }}>
            🎯 Question ({currentQuestion.difficulty.toUpperCase()})
          </h3>
          <p style={{ fontSize: '18px', marginBottom: '20px', color: '#555' }}>
            {currentQuestion.question}
          </p>
          
          {!showResult ? (
            <div>
              <input
                type="text"
                value={playerAnswer}
                onChange={(e) => setPlayerAnswer(e.target.value)}
                placeholder="Enter your answer..."
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '16px',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  marginBottom: '15px'
                }}
                onKeyPress={(e) => e.key === 'Enter' && submitAnswer()}
                autoFocus
              />
              <div>
                <button
                  onClick={submitAnswer}
                  style={{
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    marginRight: '10px'
                  }}
                >
                  Submit Answer
                </button>
                <button
                  onClick={() => setCurrentQuestion(null)}
                  style={{
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: resultMessage.includes('✅') ? '#28a745' : '#dc3545' }}>
                {resultMessage}
              </p>
            </div>
          )}
        </div>
      )}
      
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
