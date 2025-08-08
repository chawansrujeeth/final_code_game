import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BattleRoyaleMap from './components/BattleRoyaleMap';
import BattleRoyaleSocket, { battleRoyaleSocket } from './battleRoyaleSocket';

export default function BattleRoyaleLobby() {
  const navigate = useNavigate();

  // Connection/session state
  const [sessionId, setSessionId] = useState(() => {
    try {
      return localStorage.getItem('BR_SESSION_ID') || null;
    } catch { return null; }
  });
  const [playerId, setPlayerId] = useState(() => {
    try {
      const saved = localStorage.getItem('BR_PLAYER_ID');
      if (saved) return saved;
      const gen = BattleRoyaleSocket.generatePlayerId();
      localStorage.setItem('BR_PLAYER_ID', gen);
      return gen;
    } catch {
      return BattleRoyaleSocket.generatePlayerId();
    }
  });
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Connecting to server...');
  const [errorMsg, setErrorMsg] = useState(null);

  // Lobby data
  const [lobbySelections, setLobbySelections] = useState([]); // [{playerId, playerName, nodeId, isConnected}]
  const [availableNodes, setAvailableNodes] = useState(['R3_1','R3_2','R3_3','R3_4','R3_5','R3_6','R3_7','R3_8']);

  // Derive my current selection (if any)
  const mySelection = lobbySelections.find(s => s.playerId === playerId);

  // Initialize socket, listeners, and join session
  useEffect(() => {
    let mounted = true;

    // Handlers must be in the same scope as cleanup so off() removes the exact refs
    const handleLobbyState = (data) => {
      if (!mounted || !data) return;
      setAvailableNodes(data.availableNodes || []);
      setLobbySelections(Array.isArray(data.selections) ? data.selections : []);
      setStatus(`Waiting for players... ${data.selections?.length || 0} selected`);
    };
    const handleGameStarted = (data) => {
      if (!mounted) return;
      setStatus('Game started! Redirecting...');
      navigate('/battle-royale');
    };
    const handleGameStateUpdate = (data) => {
      if (!mounted || !data) return;
      if (data.gameState?.isGameActive) {
        navigate('/battle-royale');
      }
    };
    const handleConnStatus = (s) => {
      if (!mounted) return;
      if (s.connected) {
        setIsConnected(true);
        setStatus('Connected. Join/restore session...');
        setErrorMsg(null);
      } else if (s.reconnecting) {
        setIsConnected(false);
        setStatus(`Reconnecting... (${s.attempt}/${s.maxAttempts})`);
      } else {
        setIsConnected(false);
        setStatus('Disconnected. Attempting to reconnect...');
      }
    };
    const handleSocketError = (err) => {
      if (!mounted) return;
      console.error('[BR Lobby] socket_error:', err);
      const msg = err?.message || (typeof err === 'string' ? err : 'Unknown socket error');
      setErrorMsg(msg);
    };

    const init = async () => {
      try {
        const serverUrl = process.env.REACT_APP_BATTLE_ROYALE_SERVER_URL || 'http://localhost:5003';
        battleRoyaleSocket.connect(serverUrl);

        // Register listeners BEFORE joining
        battleRoyaleSocket.onLobbyStateUpdate(handleLobbyState);
        battleRoyaleSocket.onGameStarted(handleGameStarted);
        battleRoyaleSocket.onGameStateUpdate(handleGameStateUpdate);
        battleRoyaleSocket.onConnectionStatus(handleConnStatus);
        battleRoyaleSocket.on('socket_error', handleSocketError);

        // Wait for connect
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
          battleRoyaleSocket.socket.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });
          battleRoyaleSocket.socket.on('connect_error', (e) => {
            clearTimeout(timeout);
            reject(e);
          });
        });

        // Determine session ID (env -> URL -> saved -> new)
        const envSession = process.env.REACT_APP_SHARED_SESSION_ID;
        const urlSession = new URLSearchParams(window.location.search).get('session');
        const sid = envSession || urlSession || sessionId || `BR_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
        setSessionId(sid);
        try { localStorage.setItem('BR_SESSION_ID', sid); } catch {}

        // Join session
        battleRoyaleSocket.joinSession(sid, playerId, `Player ${playerId}`);
        setStatus('Joined lobby. Select your spawn node.');
      } catch (err) {
        console.error('[BR Lobby] init failed:', err);
        setErrorMsg(err?.message || String(err));
        setIsConnected(false);
        setStatus('Failed to connect');
      }
    };

    init();

    return () => {
      mounted = false;
      // Unregister listeners to prevent duplication on remount
      try {
        battleRoyaleSocket.off('lobby_state_update', handleLobbyState);
        battleRoyaleSocket.off('game_started', handleGameStarted);
        battleRoyaleSocket.off('game_state_update', handleGameStateUpdate);
        battleRoyaleSocket.off('connection_status', handleConnStatus);
        battleRoyaleSocket.off('socket_error', handleSocketError);
      } catch {}
      // Keep socket connection for seamless transition to gameplay
    };
  }, []); // run once

  // Handle node click to select spawn
  const handleNodeClick = (nodeData) => {
    if (!nodeData?.id) return;
    if (!isConnected) {
      setErrorMsg('Not connected to server');
      return;
    }
    const nodeId = nodeData.id;

    // Only allow R3_1..R3_8 as spawn nodes
    const allowed = availableNodes.includes(nodeId);
    if (!allowed) {
      setStatus('Select one of the outer ring nodes (R3_1..R3_8).');
      return;
    }

    // Prevent selecting a node already taken by someone else
    const takenByOther = lobbySelections.some(sel => sel.nodeId === nodeId && sel.playerId !== playerId);
    if (takenByOther) {
      setStatus(`${nodeId} already taken. Choose another.`);
      return;
    }

    try {
      battleRoyaleSocket.selectSpawnNode(nodeId);
      setStatus(`Selected ${nodeId}. Waiting for others...`);
      setErrorMsg(null);
    } catch (err) {
      console.error('[BR Lobby] selectSpawnNode failed:', err);
      setErrorMsg(err?.message || String(err));
    }
  };

  // No-op edge clicks in lobby
  const handleEdgeClick = () => {};

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 120px)', position: 'relative' }}>
      {/* Top status bar */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '8px 12px', borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Battle Royale Lobby</div>
        <div style={{ fontSize: 12 }}>
          <div>Session: <code>{sessionId || '...'}</code></div>
          <div>Player: <code>{playerId}</code></div>
          <div>Status: {status}</div>
          {errorMsg && <div style={{ color: '#ff8a80' }}>Error: {errorMsg}</div>}
          <div>Selections: {lobbySelections.length} / 8</div>
          {mySelection && <div>Your spawn: <b>{mySelection.nodeId}</b></div>}
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.9 }}>
            • Click a node on outer ring (R3_1..R3_8) to select your spawn.
            <br />• Green border = Your selection. Red = Others.
            <br />• Game auto-starts when 4+ players have selected.
          </div>
        </div>
      </div>

      {/* Fullscreen map */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <BattleRoyaleMap
          gameState={{}}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          isMinimized={false}
          showHUD={false}
          enableZoom={true}
          enablePan={true}
          players={{}}  // no player markers in lobby
          lobbySelections={lobbySelections}
          selfPlayerId={playerId}
        />
      </div>
    </div>
  );
}
