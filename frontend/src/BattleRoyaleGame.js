import React, { useState, useEffect } from 'react';
import BattleRoyaleMap from './components/BattleRoyaleMap';
import CityBattleRoyaleMap from './components/CityBattleRoyaleMap';
import LeetCodeQuestionViewer from './components/LeetCodeQuestionViewer';
import LeetCodeCodeEditor from './components/LeetCodeCodeEditor';
import BattleRoyaleSocket, { battleRoyaleSocket } from './battleRoyaleSocket';

export default function BattleRoyaleGame() {
  const [gameState, setGameState] = useState({
    isGameActive: false,
    playersAlive: 4,
    currentRound: 1,
    winner: null,
    gameStartTime: null,
    gameEndTime: null,
    timeRemaining: null
  });
  
  // Timer state for synchronized display
  const [timerState, setTimerState] = useState({
    timeRemaining: null,
    totalDuration: null,
    timeElapsed: null,
    formattedTime: '--:--',
    isActive: false
  });
  
  const [mapState, setMapState] = useState({
    isMinimized: true,
    isFullscreen: false,
    mapType: 'radial' // 'radial' or 'city'
  });
  
  const [players, setPlayers] = useState({});
  const [zoneState, setZoneState] = useState(null);
  
  const [selectedPlayer, setSelectedPlayer] = useState(null); // Will be set to this client's playerId
  const [accessibleEdges, setAccessibleEdges] = useState([]);
  // Cache of questions already assigned per edgeId
  const [edgeQuestions, setEdgeQuestions] = useState({});
  
  // Socket and session management
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem('BR_SESSION_ID');
    return saved || null;
  });
  const [playerId, setPlayerId] = useState(() => {
    const saved = localStorage.getItem('BR_PLAYER_ID');
    if (saved) return saved;
    const generated = BattleRoyaleSocket.generatePlayerId();
    localStorage.setItem('BR_PLAYER_ID', generated);
    return generated;
  });
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  
  // Edge question state
  const [currentEdgeQuestion, setCurrentEdgeQuestion] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  
  // Get all accessible edges for current player (undirected graph)
  const getAccessibleEdges = (currentNode) => {
    if (!currentNode) return [];
    
    // Simulated network edges for rings and TARGET (no legacy PLAYER_* spawn edges)
    const allEdges = [
      // R3 circular edges
      { id: 'R3_1-R3_2', source: 'R3_1', target: 'R3_2', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_2-R3_3', source: 'R3_2', target: 'R3_3', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_3-R3_4', source: 'R3_3', target: 'R3_4', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_4-R3_5', source: 'R3_4', target: 'R3_5', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_5-R3_6', source: 'R3_5', target: 'R3_6', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_6-R3_7', source: 'R3_6', target: 'R3_7', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_7-R3_8', source: 'R3_7', target: 'R3_8', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_8-R3_1', source: 'R3_8', target: 'R3_1', difficulty: 'easy', pathType: 'lateral' },
      
      // R3 to R2 edges
      { id: 'R3_1-R2_1', source: 'R3_1', target: 'R2_1', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_2-R2_1', source: 'R3_2', target: 'R2_1', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_3-R2_2', source: 'R3_3', target: 'R2_2', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_4-R2_2', source: 'R3_4', target: 'R2_2', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_5-R2_3', source: 'R3_5', target: 'R2_3', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_6-R2_3', source: 'R3_6', target: 'R2_3', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_7-R2_4', source: 'R3_7', target: 'R2_4', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_8-R2_4', source: 'R3_8', target: 'R2_4', difficulty: 'easy', pathType: 'inward' },
      
      // R2 circular edges
      { id: 'R2_1-R2_2', source: 'R2_1', target: 'R2_2', difficulty: 'medium', pathType: 'lateral' },
      { id: 'R2_2-R2_3', source: 'R2_2', target: 'R2_3', difficulty: 'medium', pathType: 'lateral' },
      { id: 'R2_3-R2_4', source: 'R2_3', target: 'R2_4', difficulty: 'medium', pathType: 'lateral' },
      { id: 'R2_4-R2_1', source: 'R2_4', target: 'R2_1', difficulty: 'medium', pathType: 'lateral' },
      
      // R2 to R1 edges
      { id: 'R2_1-R1_1', source: 'R2_1', target: 'R1_1', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_1-R1_2', source: 'R2_1', target: 'R1_2', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_2-R1_2', source: 'R2_2', target: 'R1_2', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_2-R1_3', source: 'R2_2', target: 'R1_3', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_3-R1_3', source: 'R2_3', target: 'R1_3', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_3-R1_4', source: 'R2_3', target: 'R1_4', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_4-R1_4', source: 'R2_4', target: 'R1_4', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_4-R1_1', source: 'R2_4', target: 'R1_1', difficulty: 'medium', pathType: 'inward' },
      
      // R1 circular edges
      { id: 'R1_1-R1_2', source: 'R1_1', target: 'R1_2', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_2-R1_3', source: 'R1_2', target: 'R1_3', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_3-R1_4', source: 'R1_3', target: 'R1_4', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_4-R1_1', source: 'R1_4', target: 'R1_1', difficulty: 'hard', pathType: 'lateral' },
      
      // R1 to TARGET edges
      { id: 'R1_1-TARGET', source: 'R1_1', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_2-TARGET', source: 'R1_2', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_3-TARGET', source: 'R1_3', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_4-TARGET', source: 'R1_4', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
    ];
    
    // Filter edges that are connected to the current node
    return allEdges.filter(edge => 
      edge.source === currentNode || edge.target === currentNode
    );
  };
  
  // Socket connection and session management
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        // Connect to battle royale server (Render backend)
        const serverUrl = process.env.REACT_APP_BATTLE_ROYALE_SERVER_URL || 'http://localhost:5003';
        console.log('Connecting to battle royale server:', serverUrl);
        battleRoyaleSocket.connect(serverUrl);
        
        // Set up event listeners EARLY (before join) to avoid missing early emissions
        battleRoyaleSocket.on('zone_update', (payload) => {
            setZoneState(payload.zoneState || payload);
          });
          
          battleRoyaleSocket.onGameStateUpdate((data) => {
          console.log('Game state update:', data);
          // Update game state and players from server data
          if (data.gameState) {
            setGameState(prev => ({ ...prev, ...data.gameState }));
          }
          if (data.players) {
            const updatedPlayers = {};
            data.players.forEach(player => {
              updatedPlayers[player.playerId] = {
                health: player.health,
                currentZone: player.currentZone,
                currentNode: player.currentNode,
                questionsAnswered: player.questionsAnswered,
                isAlive: player.health > 0
              };
            });
            console.log('🎮 Updated players state:', updatedPlayers);
            console.log('🎯 Current player data:', updatedPlayers[playerId]);
            setPlayers(updatedPlayers);
            if (!selectedPlayer || !updatedPlayers[selectedPlayer]) {
              setSelectedPlayer(playerId);
            }
          }
        });

        // Handle auto-start event when 4 players join
        battleRoyaleSocket.onGameStarted((data) => {
          console.log('Game started:', data);
          if (data.gameState) {
            setGameState(prev => ({ ...prev, ...data.gameState, isGameActive: true }));
          } else {
            setGameState(prev => ({ ...prev, isGameActive: true }));
          }
          if (data.players) {
            const updatedPlayers = {};
            data.players.forEach(player => {
              updatedPlayers[player.playerId] = {
                health: player.health,
                currentZone: player.currentZone,
                currentNode: player.currentNode,
                questionsAnswered: player.questionsAnswered,
                isAlive: player.health > 0
              };
            });
            setPlayers(updatedPlayers);
            if (!selectedPlayer || !updatedPlayers[selectedPlayer]) {
              setSelectedPlayer(playerId);
            }
          }
        });

        // Helpful connection success handler to prime UI state
        battleRoyaleSocket.onConnectionSuccess((data) => {
          console.log('Connection success:', data);
          if (data && data.gameState) {
            setGameState(prev => ({ ...prev, ...data.gameState }));
          }
        });
        
        battleRoyaleSocket.onGameOver((data) => {
          console.log('Game over:', data);
          setGameState(prev => ({
            ...prev,
            isGameActive: false,
            winner: data.winner
          }));
        });

        // Handle edge questions assignment during lobby
        battleRoyaleSocket.socket.on('edge_questions_assigned', (data) => {
          console.log('✅ Edge questions assigned:', data);
          setEdgeQuestions(data.edgeQuestions || {});
        });

        // Handle accessible edges update
        battleRoyaleSocket.socket.on('accessible_edges', (data) => {
          console.log('✅ Accessible edges:', data);
          setAccessibleEdges(data.edges || []);
        });

        // Handle edge question response
        battleRoyaleSocket.socket.on('edge_question', (data) => {
          console.log('✅ Edge question received:', data);
          setCurrentEdgeQuestion({
            edgeId: data.edgeId,
            question: data.question,
            targetNode: data.targetNode
          });
          setSelectedEdgeId(data.edgeId);
        });

        // Handle edge errors
        battleRoyaleSocket.socket.on('edge_error', (error) => {
          console.log('❌ Edge error:', error);
          setConnectionError(error.message || 'Edge interaction failed');
        });

        // Handle question received from backend
        battleRoyaleSocket.socket.on('question_received', (data) => {
          console.log('✅ Question received:', data);
          
          const questionToSet = {
            questionId: data.questionId,
            question: data.question,
            difficulty: data.difficulty,
            edgeId: data.edgeId,
            testCases: data.testCases || [],
            playerId: data.playerId
          };
          
          setCurrentQuestion(questionToSet);
          setConnectionError(null);
        });

        // Handle errors from backend
        battleRoyaleSocket.socket.on('error', (data) => {
          console.log('❌ Backend error:', data);
          setConnectionError(data.message || 'Unknown error occurred');
        });

        battleRoyaleSocket.onPlayerEliminated((data) => {
          console.log('Player eliminated:', data);
          setPlayers(prev => ({
            ...prev,
            [data.playerId]: {
              ...prev[data.playerId],
              isAlive: false
            }
          }));
        });

        // Handle synchronized timer updates
        battleRoyaleSocket.socket.on('game_timer_update', (data) => {
          console.log('Timer update:', data);
          setTimerState({
            timeRemaining: data.timeRemaining,
            totalDuration: data.totalDuration,
            timeElapsed: data.timeElapsed,
            formattedTime: data.formattedTime,
            isActive: data.timeRemaining > 0
          });
          
          // Update game state with timer info
          setGameState(prev => ({
            ...prev,
            timeRemaining: data.timeRemaining
          }));
        });

        // Handle game ended by timeout
        battleRoyaleSocket.socket.on('game_ended', (data) => {
          console.log('Game ended:', data);
          setGameState(prev => ({
            ...prev,
            isGameActive: false,
            gameOver: true,
            winner: data.winner?.playerId || null,
            timeRemaining: 0
          }));
          
          setTimerState(prev => ({
            ...prev,
            timeRemaining: 0,
            formattedTime: '00:00',
            isActive: false
          }));
        });
        
        // Generate or use existing session (env override -> URL param -> saved -> new)
        const envSession = process.env.REACT_APP_SHARED_SESSION_ID;
        const urlSession = new URLSearchParams(window.location.search).get('session');
        const newSessionId = envSession || urlSession || sessionId || `BR_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        setSessionId(newSessionId);
        try { localStorage.setItem('BR_SESSION_ID', newSessionId); } catch {}
        
        // Wait for connection
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
          
          battleRoyaleSocket.socket.on('connect', () => {
            clearTimeout(timeout);
            setIsConnected(true);
            setConnectionError(null);
            console.log('Connected to battle royale server');
            resolve();
          });
          
          battleRoyaleSocket.socket.on('connect_error', (error) => {
            clearTimeout(timeout);
            setConnectionError(`Connection failed: ${error.message}`);
            console.error('Connection failed:', error);
            reject(error);
          });
        });
        
        // Join session (listeners already set up above)
        battleRoyaleSocket.joinSession(newSessionId, playerId, `Player ${playerId}`);
        
      } catch (error) {
        console.error('Failed to initialize connection:', error);
        setConnectionError(error.message);
        setIsConnected(false);
      }
    };
    
    initializeConnection();
    
    // Cleanup on unmount
    return () => {
      battleRoyaleSocket.disconnect();
    };
  }, []); // Empty dependency array - run once on mount

  // Keep selectedPlayer synced with generated playerId initially
  useEffect(() => {
    if (!selectedPlayer && playerId) {
      setSelectedPlayer(playerId);
    }
  }, [playerId, selectedPlayer]);
  
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  
  // Request game view from server when player changes
  useEffect(() => {
    if (selectedPlayer && sessionId && gameState.isGameActive) {
      battleRoyaleSocket.emit('get_game_view', {
        sessionId,
        playerId: selectedPlayer
      });
    }
  }, [selectedPlayer, players, sessionId, gameState.isGameActive]);

  // Request accessible edges when game starts or player position changes
  useEffect(() => {
    if (gameState.isGameActive && playerId && sessionId) {
      requestAccessibleEdges();
    }
  }, [gameState.isGameActive, players[playerId]?.currentNode]);
  
  // Handle node clicks (safe points - no questions, just information)
  const handleNodeClick = (nodeData) => {
    if (!gameState || !gameState.isGameActive) return;
    
    // Show node information (safe point details)
    console.log(`Clicked safe point: ${nodeData.id}`, nodeData);
  };
  
  // Socket event listeners for server-authoritative game logic
  React.useEffect(() => {
    if (!battleRoyaleSocket) return;
    
    // Handle question for move from server
    const handleQuestionForMove = (data) => {
      console.log('Received question for move:', data);
      setCurrentQuestion({
        edgeId: data.edgeId,
        question: data.question.content,
        questionId: data.question.id,
        difficulty: data.question.difficulty
      });
      setPlayerAnswer('');
      setShowResult(false);
    };
    
    // Handle move errors
    const handleMoveError = (error) => {
      console.error('Move error:', error);
      setConnectionError(error.message);
      setResultMessage(`❌ ${error.message}`);
      setShowResult(true);
      setTimeout(() => {
        setShowResult(false);
      }, 3000);
    };
    
    // Handle game view updates
    const handleGameView = (view) => {
      console.log('Received game view:', view);
      if (view.accessibleEdges) {
        setAccessibleEdges(view.accessibleEdges);
      }
    };
    
    // Handle view errors
    const handleViewError = (error) => {
      console.error('View error:', error);
    };
    
    battleRoyaleSocket.on('question_for_move', handleQuestionForMove);
    battleRoyaleSocket.on('move_error', handleMoveError);
    battleRoyaleSocket.on('game_view', handleGameView);
    battleRoyaleSocket.on('view_error', handleViewError);
    
    return () => {
      battleRoyaleSocket.off('question_for_move', handleQuestionForMove);
      battleRoyaleSocket.off('move_error', handleMoveError);
      battleRoyaleSocket.off('game_view', handleGameView);
      battleRoyaleSocket.off('view_error', handleViewError);
    };
  }, [battleRoyaleSocket]);
  
  // Handle edge click to get question
  const handleEdgeClick = async (edgeData) => {
    const edgeId = typeof edgeData === 'string' ? edgeData : edgeData.id;
    if (!isConnected || !sessionId || !playerId || !edgeId) return;
    
    try {
      battleRoyaleSocket.socket.emit('edge_clicked', {
        sessionId,
        playerId,
        edgeId
      });
      console.log('📍 Edge clicked:', edgeId);
    } catch (error) {
      console.error('❌ Edge click error:', error);
    }
  };

  // Request accessible edges from backend
  const requestAccessibleEdges = async () => {
    if (!isConnected || !sessionId || !playerId) return;
    
    try {
      battleRoyaleSocket.socket.emit('get_accessible_edges', {
        sessionId,
        playerId
      });
    } catch (error) {
      console.error('❌ Request edges error:', error);
    }
  };

  // Submit answer for edge traversal (server-authoritative)
  const submitAnswer = async (code, passed = false, testResults = null) => {
    if (!currentQuestion || !isConnected) return;
    
    try {
      const result = await battleRoyaleSocket.submitAnswer({
        sessionId,
        playerId,
        edgeId: currentQuestion.edgeId,
        answer: code,
        passed: passed,
        testResults: testResults
      });
      
      console.log('✅ Answer submitted:', result);
    } catch (error) {
      console.error('❌ Submit answer error:', error);
    }
  };

  // Handle server response for answer submission
  React.useEffect(() => {
    if (!battleRoyaleSocket) return;
    
    const handleAnswerResult = (result) => {
      if (result.correct) {
        setResultMessage(`✅ Correct! You moved to ${result.targetNode}`);
        setShowResult(true);
        setCurrentQuestion(null);
        
        if (result.winner) {
          setResultMessage('🎉 VICTORY! You reached the center!');
        }
      } else {
        setResultMessage(`❌ Wrong answer! Health: ${result.health}/100`);
        setShowResult(true);
        
        if (result.isEliminated) {
          setResultMessage(`💀 You have been eliminated!`);
        }
      }
      
      // Hide result after 3 seconds
      setTimeout(() => {
        setShowResult(false);
        setResultMessage('');
      }, 3000);
    };
    
    const handleAnswerError = (error) => {
      setResultMessage(`❌ Error: ${error.message}`);
      setShowResult(true);
    };
    
    battleRoyaleSocket.on('answer_result', handleAnswerResult);
    battleRoyaleSocket.on('answer_error', handleAnswerError);
    
    return () => {
      battleRoyaleSocket.off('answer_result', handleAnswerResult);
      battleRoyaleSocket.off('answer_error', handleAnswerError);
    };
  }, [battleRoyaleSocket]);
  
  // Deprecated functions - removed as server is now authoritative
  // All game logic is handled by the backend server
  
  // Helper function to get zone level from node ID
  const getZoneFromNode = (nodeId) => {
    if (nodeId === 'TARGET') return 0;
    if (nodeId.startsWith('R1_')) return 1;
    if (nodeId.startsWith('R2_')) return 2;
    if (nodeId.startsWith('R3_')) return 3;
    return 4;
  };
  
  // Toggle minimap/fullscreen
  const toggleMap = () => {
    setMapState(prev => ({
      ...prev,
      isMinimized: !prev.isMinimized,
      isFullscreen: !prev.isMinimized ? false : prev.isFullscreen
    }));
  };
  
  const switchMapType = () => {
    setMapState(prev => ({
      ...prev,
      mapType: prev.mapType === 'radial' ? 'city' : 'radial'
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
    <>
      {/* CSS Animations */}
      <style>{`
        @keyframes expandIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        @keyframes minimapPulse {
          0%, 100% {
            box-shadow: 0 15px 50px rgba(0,255,136,0.4);
          }
          50% {
            box-shadow: 0 15px 50px rgba(0,255,136,0.6);
          }
        }
      `}</style>
      
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
        
        {/* Left Side - Question Display */}
        <div style={{
          width: '50%',
          height: '100%',
          background: '#1e1e1e',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {currentEdgeQuestion ? (
            <LeetCodeQuestionViewer 
              question={{
                ...currentEdgeQuestion.question,
                edgeId: currentEdgeQuestion.edgeId,
                targetNode: currentEdgeQuestion.targetNode
              }}
              onClose={() => {
                setCurrentEdgeQuestion(null);
                setSelectedEdgeId(null);
              }}
            />
          ) : currentQuestion ? (
            <LeetCodeQuestionViewer 
              question={currentQuestion}
              onClose={() => setCurrentQuestion(null)}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              fontSize: '16px',
              background: '#1e1e1e'
            }}>
              Click an accessible edge (dark blue) to see the question
            </div>
          )}
        </div>
        
        {/* Right Side - Code Editor */}
        <div style={{
          width: '50%',
          height: '100%',
          background: '#1e1e1e',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {currentEdgeQuestion ? (
            <LeetCodeCodeEditor 
              question={{
                ...currentEdgeQuestion.question,
                edgeId: currentEdgeQuestion.edgeId
              }}
              onSubmitAnswer={submitAnswer}
            />
          ) : currentQuestion ? (
            <LeetCodeCodeEditor 
              question={currentQuestion}
              onSubmitAnswer={submitAnswer}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              fontSize: '16px',
              background: '#1e1e1e'
            }}>
              Code editor will appear here
            </div>
          )}
        </div>
      </div>
      
      {/* Minimap Container - Only in Code Editor Side */}
      {mapState.isMinimized && (
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '320px',
              height: '320px',
              zIndex: 1500,
              border: '3px solid #00ff88',
              borderRadius: '15px',
              overflow: 'hidden',
              boxShadow: '0 15px 50px rgba(0,255,136,0.4)',
              transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              backdropFilter: 'blur(10px)',
              animation: 'minimapPulse 3s ease-in-out infinite'
            }}>
              <BattleRoyaleMap 
                gameState={gameState}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                isMinimized={true}
                showHUD={false}
                enableZoom={false}
                enablePan={false}
                selfPlayerId={playerId}
                zoneState={zoneState}
                players={players}
                mapType={2}
                accessibleEdges={accessibleEdges}
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
                  title="Full Screen Map"
                  onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                >
                  🗺️ FULL SCREEN
                </button>
                <button
                  onClick={switchMapType}
                  style={{
                    background: 'linear-gradient(45deg, #ff6b6b, #ee5a52)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 8px rgba(255,107,107,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  title={`Switch to ${mapState.mapType === 'radial' ? 'City' : 'Radial'} Map`}
                  onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                >
                  {mapState.mapType === 'radial' ? '🏙️ CITY' : '⭕ RADIAL'}
                </button>
              </div>
              
              {connectionError && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ff4444',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            zIndex: 1000
          }}>
            {connectionError}
          </div>
        )}

        {/* Players Health Box */}
            <div style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '10px',
              borderRadius: '5px',
              fontSize: '12px',
              zIndex: 1000,
              width: '180px',
              maxHeight: '40%',
              overflowY: 'auto',
              border: '2px solid #00ff88',
              backdropFilter: 'blur(4px)', display: 'none'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', textAlign: 'center', letterSpacing: '0.5px' }}>
                PLAYERS HEALTH
              </div>
              {Object.entries(players).map(([pid, pdata]) => (
                <div key={pid} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ width: '48px', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pid === playerId ? 'You' : `P-${pid.slice(-4)}`}
                  </span>
                  <div style={{ flex: 1, marginLeft: '4px', background: '#555', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pdata.health}%`,
                      height: '100%',
                      background: pdata.health > 50 ? '#00ff88' : pdata.health > 20 ? '#ffcc00' : '#ff4444'
                    }} />
                  </div>
                  <span style={{ marginLeft: '4px', fontSize: '10px' }}>{pdata.health}</span>
                </div>
              ))}
            </div>

            {/* Debug Panel */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          zIndex: 1000
        }}>
          <div><strong>Debug Info:</strong></div>
          <div>Session: {sessionId || 'None'}</div>
          <div>Player: {playerId || 'None'}</div>
          <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
          <div>Current Node: {players[playerId]?.currentNode || 'None'}</div>
          <div>Game Active: {gameState.isGameActive ? 'Yes' : 'No'}</div>
          <button 
            onClick={() => {
              console.log('🔍 Debug State Check:');
              console.log('- sessionId:', sessionId);
              console.log('- playerId:', playerId);
              console.log('- isConnected:', isConnected);
              console.log('- players:', players);
              console.log('- gameState:', gameState);
              console.log('- currentQuestion:', currentQuestion);
            }}
            style={{
              marginTop: '5px',
              padding: '2px 8px',
              fontSize: '10px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Log Debug Info
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
          
          {/* Expanded Map - Covers Entire Right Side */}
          {!mapState.isMinimized && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2000,
              border: '3px solid #00ff88',
              borderRadius: '15px',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              boxShadow: '0 20px 60px rgba(0,255,136,0.3)',
              transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              animation: 'expandIn 0.5s ease-out'
            }}>
              <BattleRoyaleMap 
                gameState={gameState}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                isMinimized={false}
                showHUD={true}
                enableZoom={true}
                enablePan={true}
                selfPlayerId={playerId}
                zoneState={zoneState}
                players={players}
                mapType={2}
                accessibleEdges={accessibleEdges}
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
                  title="Back to Minimap"
                >
                  ➖ BACK
                </button>
                <button
                  onClick={switchMapType}
                  style={{
                    background: 'linear-gradient(45deg, #ff6b6b, #ee5a52)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 8px rgba(255,107,107,0.3)'
                  }}
                  title={`Switch to ${mapState.mapType === 'radial' ? 'City' : 'Radial'} Map`}
                >
                  {mapState.mapType === 'radial' ? '🏙️ CITY MAP' : '⭕ RADIAL MAP'}
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
          )}
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
      
      {/* Connection Error */}

      {connectionError && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ff4444',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          zIndex: 1000
        }}>
          {connectionError}
        </div>
      )}

      {/* Players Health Box */}
            <div style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '10px',
              borderRadius: '5px',
              fontSize: '12px',
              zIndex: 1000,
              width: '180px',
              maxHeight: '40%',
              overflowY: 'auto',
              border: '2px solid #00ff88',
              backdropFilter: 'blur(4px)', display: 'none'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', textAlign: 'center', letterSpacing: '0.5px' }}>
                PLAYERS HEALTH
              </div>
              {Object.entries(players).map(([pid, pdata]) => (
                <div key={pid} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ width: '48px', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pid === playerId ? 'You' : `P-${pid.slice(-4)}`}
                  </span>
                  <div style={{ flex: 1, marginLeft: '4px', background: '#555', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pdata.health}%`,
                      height: '100%',
                      background: pdata.health > 50 ? '#00ff88' : pdata.health > 20 ? '#ffcc00' : '#ff4444'
                    }} />
                  </div>
                  <span style={{ marginLeft: '4px', fontSize: '10px' }}>{pdata.health}</span>
                </div>
              ))}
            </div>

            {/* Debug Panel */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 1000
      }}>
        <div><strong>Debug Info:</strong></div>
        <div>Session: {sessionId || 'None'}</div>
        <div>Player: {playerId || 'None'}</div>
        <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
        <div>Current Node: {players[playerId]?.currentNode || 'None'}</div>
        <div>Game Active: {gameState.isGameActive ? 'Yes' : 'No'}</div>
        <button 
          onClick={() => {
            console.log('🔍 Debug State Check:');
            console.log('- sessionId:', sessionId);
            console.log('- playerId:', playerId);
            console.log('- isConnected:', isConnected);
            console.log('- players:', players);
            console.log('- gameState:', gameState);
            console.log('- currentQuestion:', currentQuestion);
          }}
          style={{
            marginTop: '5px',
            padding: '2px 8px',
            fontSize: '10px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Log Debug Info
        </button>
      </div>

      {/* Player Health Bar */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '350px',
        background: 'rgba(0,0,0,0.8)',
        border: '2px solid #00ff88',
        borderRadius: '8px',
        padding: '8px 12px',
        textAlign: 'center',
        color: '#ffffff',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}>
        <div style={{ marginBottom: '4px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
          HEALTH
        </div>
        <div style={{ width: '100%', height: '10px', background: '#555', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            width: `${players[playerId]?.health ?? 100}%`,
            height: '100%',
            background: (players[playerId]?.health ?? 100) > 50 ? '#00ff88' : (players[playerId]?.health ?? 100) > 20 ? '#ffcc00' : '#ff4444',
            transition: 'width 0.25s ease'
          }} />
        </div>
      </div>

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
    </>
  );
}
