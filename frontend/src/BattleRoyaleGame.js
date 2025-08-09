import React, { useState, useEffect } from 'react';
import BattleRoyaleMap from './components/BattleRoyaleMap';
import Editor from '@monaco-editor/react';
import EdgeCard from './components/EdgeCard';
import BattleRoyaleSocket, { battleRoyaleSocket } from './battleRoyaleSocket';

export default function BattleRoyaleGame() {
  const [gameState, setGameState] = useState({
    isGameActive: false,
    playersAlive: 4,
    currentRound: 1,
    winner: null
  });
  
  const [mapState, setMapState] = useState({
    isMinimized: true,
    isFullscreen: false
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
  
  // Pool of questions for different difficulties (DEPRECATED - now using backend)
  const questionPools = {
    easy: [
      { question: "What is 2 + 2?", answer: "4" },
      { question: "What color is the sky?", answer: "blue" },
      { question: "How many legs does a cat have?", answer: "4" },
      { question: "What is the capital of France?", answer: "paris" },
      { question: "What is 5 x 3?", answer: "15" },
      { question: "Which planet is closest to the sun?", answer: "mercury" },
      { question: "What is 10 - 7?", answer: "3" },
      { question: "How many days in a week?", answer: "7" },
      { question: "What is the largest ocean?", answer: "pacific" },
      { question: "What gas do plants produce?", answer: "oxygen" },
      { question: "What is 8 / 2?", answer: "4" },
      { question: "What is 6 + 4?", answer: "10" },
      { question: "What is 3 + 5?", answer: "8" },
      { question: "How many continents are there?", answer: "7" },
      { question: "What is 9 - 4?", answer: "5" },
      { question: "How many sides does a triangle have?", answer: "3" }
    ],
    medium: [
      { question: "What is the square root of 64?", answer: "8" },
      { question: "Who wrote Romeo and Juliet?", answer: "shakespeare" },
      { question: "What is the chemical symbol for gold?", answer: "au" },
      { question: "In which year did World War II end?", answer: "1945" },
      { question: "What is 15% of 200?", answer: "30" },
      { question: "Which programming language is known for AI?", answer: "python" },
      { question: "What is the powerhouse of the cell?", answer: "mitochondria" },
      { question: "What is 7 x 8?", answer: "56" },
      { question: "What is 12 / 4?", answer: "3" },
      { question: "What is the capital of Italy?", answer: "rome" },
      { question: "What is 25% of 80?", answer: "20" },
      { question: "Who painted the Mona Lisa?", answer: "leonardo" }
    ],
    hard: [
      { question: "What is the derivative of x²?", answer: "2x" },
      { question: "Who developed the theory of relativity?", answer: "einstein" },
      { question: "What is the time complexity of binary search?", answer: "o(log n)" },
      { question: "What is the 10th Fibonacci number?", answer: "55" },
      { question: "What is the atomic number of carbon?", answer: "6" },
      { question: "In which year was JavaScript created?", answer: "1995" },
      { question: "What is 15²?", answer: "225" },
      { question: "What is the speed of light in m/s?", answer: "299792458" },
      { question: "What is the square root of 144?", answer: "12" },
      { question: "What is 8! (8 factorial)?", answer: "40320" }
    ]
  };
  
  // Function to get question for any edge
  const getQuestionForEdge = (edgeId, difficulty, pathType) => {
    const pool = questionPools[difficulty] || questionPools.easy;
    const questionIndex = Math.abs(edgeId.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % pool.length;
    const selectedQuestion = pool[questionIndex];
    
    return {
      ...selectedQuestion,
      difficulty,
      pathType
    };
  };
  
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  
  // Update accessible edges when player or position changes
  React.useEffect(() => {
    const currentPlayerData = players[selectedPlayer];
    if (currentPlayerData) {
      const edges = getAccessibleEdges(currentPlayerData.currentNode);
      setAccessibleEdges(edges);
    }
  }, [selectedPlayer, players]);
  const [resultMessage, setResultMessage] = useState('');
  
  // Handle edge clicks (when player tries to traverse a path)
  // Function to determine difficulty and path type based on edge
  const getEdgeProperties = (sourceNode, targetNode) => {
    // Determine difficulty based on rings
    let difficulty = 'easy';
    let pathType = 'lateral';
    
    // Extract ring numbers
    const sourceRing = sourceNode.includes('R3') ? 3 : sourceNode.includes('R2') ? 2 : sourceNode.includes('R1') ? 1 : 0;
    const targetRing = targetNode.includes('R3') ? 3 : targetNode.includes('R2') ? 2 : targetNode.includes('R1') ? 1 : targetNode === 'TARGET' ? 0 : 0;
    
    // Determine path type and difficulty
    if (targetNode === 'TARGET') {
      difficulty = 'hard';
      pathType = 'final';
    } else if (sourceRing > targetRing) {
      // Moving inward
      pathType = 'inward';
      if (sourceRing === 3 && targetRing === 2) difficulty = 'easy';
      else if (sourceRing === 2 && targetRing === 1) difficulty = 'medium';
      else if (sourceRing === 1 && targetRing === 0) difficulty = 'hard';
    } else if (sourceRing === targetRing) {
      // Lateral movement within same ring
      pathType = 'lateral';
      if (sourceRing === 3) difficulty = 'easy';
      else if (sourceRing === 2) difficulty = 'medium';
      else if (sourceRing === 1) difficulty = 'hard';
    }
    
    return { difficulty, pathType };
  };
  
  const handleEdgeClick = async (edgeData) => {
    console.log('=== HANDLE EDGE CLICK START ===');
    console.log('Edge data received:', edgeData);
    console.log('Game state active:', gameState.isGameActive);
    console.log('Selected player:', selectedPlayer);
    console.log('Socket connected:', isConnected);
    
    if (!edgeData.id || !gameState.isGameActive) {
      console.log('Early return - no edge ID or game not active');
      return;
    }
    
    if (!isConnected) {
      console.log('Socket not connected, cannot request question');
      setConnectionError('Not connected to server');
      return;
    }
    
    const currentPlayer = players[selectedPlayer];
    console.log('Current player:', currentPlayer);
    
    if (!currentPlayer || !currentPlayer.isAlive) {
      console.log('Early return - no current player or player not alive');
      return;
    }
    
    // Check if this edge is accessible from current player position
    const isAccessible = isEdgeAccessible(edgeData.id, currentPlayer.currentNode);
    console.log('Edge accessible:', isAccessible, 'from node:', currentPlayer.currentNode);
    
    if (!isAccessible) {
      console.log('Edge not accessible from current position');
      return;
    }
    
    // Determine actual source and target based on player position (for undirected graph)
    const edgeSource = edgeData.source;
    const edgeTarget = edgeData.target;
    const playerNode = currentPlayer.currentNode;
    
    let actualSource, actualTarget;
    if (edgeSource === playerNode) {
      actualSource = edgeSource;
      actualTarget = edgeTarget;
    } else if (edgeTarget === playerNode) {
      actualSource = edgeTarget;
      actualTarget = edgeSource;
    } else {
      console.log('Edge not connected to current player position');
      return;
    }
    
    // Get edge properties to determine difficulty
    const { difficulty, pathType } = getEdgeProperties(actualSource, actualTarget);
    console.log('Edge properties:', { difficulty, pathType });
    
    console.log(`Edge clicked: ${edgeData.id}, Player at: ${playerNode}, Moving: ${actualSource} → ${actualTarget}, Difficulty: ${difficulty}, PathType: ${pathType}`);
    
    try {
      // Fetch or reuse question for this edge
      let questionData;
      if (edgeQuestions[edgeData.id]) {
        console.log('Using cached question for edge', edgeData.id);
        questionData = edgeQuestions[edgeData.id];
      } else {
        console.log('Requesting question from backend via socket...');
        questionData = await battleRoyaleSocket.requestQuestion(difficulty, edgeData.id);
        console.log('Received question from backend:', questionData);
        setEdgeQuestions(prev => ({ ...prev, [edgeData.id]: questionData }));
      }
      
      const questionToSet = {
        questionId: questionData.questionId,
        question: questionData.content,
        difficulty: questionData.difficulty,
        pathType,
        edgeId: edgeData.id,
        sourceNode: actualSource,
        targetNode: actualTarget,
        pathDescription: `${actualSource} → ${actualTarget}`,
        testCases: questionData.testCases || questionData.test_cases || [],
        playerId: selectedPlayer
      };
      
      console.log('Setting current question:', questionToSet);
      setCurrentQuestion(questionToSet);
      setPlayerAnswer('');
      setShowResult(false);
      setConnectionError(null);
      
    } catch (error) {
      console.error('Failed to get question:', error);
      setConnectionError(`Failed to get question: ${error.message}`);
    }
    
    console.log('=== HANDLE EDGE CLICK END ===');
  };
  
  // Check if an edge is accessible from current player position
  const isEdgeAccessible = (edgeId, currentNode) => {
    const [source, target] = edgeId.split('-');
    // Player can traverse edge in both directions (undirected graph)
    return source === currentNode || target === currentNode;
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
  const submitAnswer = async () => {
    if (!currentQuestion || !isConnected) return;
    
    try {
      console.log('Submitting answer to backend:', {
        questionId: currentQuestion.questionId,
        answer: playerAnswer.trim(),
        targetNode: currentQuestion.targetNode
      });
      
      const result = await battleRoyaleSocket.submitAnswer(
        currentQuestion.questionId,
        playerAnswer.trim(),
        currentQuestion.targetNode
      );
      
      console.log('Answer result from backend:', result);
      
      if (result.correct) {
        setResultMessage(`✅ Correct! Path unlocked: ${currentQuestion.pathDescription}`);
        
        // Move player to target node locally
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
        
        // Handle successful traversal based on path type
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
        setResultMessage(`❌ Wrong answer! Path blocked.`);
        
        // Handle failed traversal - player takes damage locally
        const playerId = currentQuestion.playerId;
        setPlayers(prev => ({
          ...prev,
          [playerId]: {
            ...prev[playerId],
            health: Math.max(0, prev[playerId].health - 10)
          }
        }));
        
        setResultMessage(prev => prev + ` You lost 10 health!`);
      }
      
      setConnectionError(null);
      
    } catch (error) {
      console.error('Failed to submit answer:', error);
      setResultMessage(`❌ Failed to submit answer: ${error.message}`);
      setConnectionError(`Answer submission failed: ${error.message}`);
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
          
          {/* Connection Status */}
          <div style={{
            background: isConnected ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
            border: `2px solid ${isConnected ? '#28a745' : '#dc3545'}`,
            borderRadius: '8px',
            padding: '10px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <div style={{
              color: isConnected ? '#28a745' : '#dc3545',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>
              {isConnected ? '🟢 Connected to Server' : '🔴 Disconnected from Server'}
            </div>
            {sessionId && (
              <div style={{ color: '#ccc', fontSize: '12px', marginTop: '5px' }}>
                Session: {sessionId}
              </div>
            )}
            {connectionError && (
              <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '5px' }}>
                Error: {connectionError}
              </div>
            )}
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
            
            {/* Spawn Guidance removed: players now spawn directly on ring nodes from backend */}
            
            {/* Accessible Edges Display */}
            <div style={{
              background: 'rgba(255, 193, 7, 0.1)',
              border: '2px solid #ffc107',
              borderRadius: '8px',
              padding: '15px',
              marginTop: '15px'
            }}>
              <div style={{ color: '#ffc107', fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                🛤️ Available Paths ({accessibleEdges.length})
              </div>
              <div style={{ color: '#fff', fontSize: '12px', marginBottom: '10px' }}>
                From: <span style={{ color: '#6f42c1', fontWeight: 'bold' }}>{players[selectedPlayer]?.currentNode}</span>
              </div>
              <div style={{ 
                maxHeight: '150px', 
                overflowY: 'auto',
                display: 'grid',
                gap: '8px'
              }}>
                {accessibleEdges.length > 0 ? (
                  accessibleEdges.map((edge, index) => {
                    const targetNode = edge.source === players[selectedPlayer]?.currentNode ? edge.target : edge.source;
                    // Colours now handled inside EdgeCard
                    
                    return (
                      <EdgeCard key={edge.id} edge={edge} onSelect={handleEdgeClick} />
                    );
                  })
                ) : (
                  <div style={{ color: '#ccc', textAlign: 'center', padding: '20px' }}>
                    No accessible paths from current position
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Current Question Display */}
          {console.log('Rendering question display, currentQuestion:', currentQuestion)}
          
          {/* Debug Information */}
          <div style={{ 
            background: 'rgba(255, 0, 0, 0.1)', 
            border: '1px solid red', 
            padding: '10px', 
            marginBottom: '10px',
            fontSize: '12px',
            color: '#fff'
          }}>
            <div>Debug Info:</div>
            <div>currentQuestion exists: {currentQuestion ? 'YES' : 'NO'}</div>
            <div>currentQuestion type: {typeof currentQuestion}</div>
            {currentQuestion && (
              <div>
                <div>Question: {currentQuestion.question || 'NO QUESTION'}</div>
                <div>Difficulty: {currentQuestion.difficulty || 'NO DIFFICULTY'}</div>
                <div>Edge ID: {currentQuestion.edgeId || 'NO EDGE ID'}</div>
              </div>
            )}
            <button 
              onClick={() => {
                console.log('Test button clicked - setting test question');
                const testQuestion = {
                  question: 'Test Question: What is 2+2?',
                  answer: '4',
                  difficulty: 'easy',
                  pathType: 'test',
                  edgeId: 'test-edge',
                  sourceNode: 'TEST_SOURCE',
                  targetNode: 'TEST_TARGET',
                  pathDescription: 'TEST → TARGET',
                  testCases: [
                    { input: '2 2', output: '4' },
                    { input: '5 7', output: '12' }
                  ],
                  playerId: selectedPlayer
                };
                setCurrentQuestion(testQuestion);
                console.log('Test question set:', testQuestion);
              }}
              style={{
                background: '#28a745',
                color: '#fff',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                marginTop: '5px'
              }}
            >
              Test Question
            </button>
          </div>
          
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
                {currentQuestion.testCases && currentQuestion.testCases.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <h4 style={{ color: '#00ff88', margin: '0 0 8px 0', fontSize: '15px' }}>📑 Test Cases</h4>
                    <ul style={{ listStyle: 'none', padding: 0, color: '#fff', fontSize: '13px' }}>
                      {currentQuestion.testCases.map((tc, idx) => (
                        <li key={idx} style={{ marginBottom: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 8px', borderRadius: '6px' }}>
                          <span style={{ color: '#ffc107' }}>Input:</span> <code>{tc.input ?? JSON.stringify(tc)}</code>
                          {tc.output !== undefined && (
                            <><span style={{ color: '#17a2b8', marginLeft: '8px' }}>Expected:</span> <code>{tc.output}</code></>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                selfPlayerId={playerId}
                 zoneState={zoneState}
                players={players}
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
    </>
  );
}
