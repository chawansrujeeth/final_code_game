import React, { useEffect, useState, useRef } from 'react';
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
  const [countdownEnd, setCountdownEnd] = useState(null); // timestamp when auto-start fires
  const [countdownTick, setCountdownTick] = useState(null); // { remaining, total, message }
  const [hasJoined, setHasJoined] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const hasJoinedRef = useRef(false);
  const joinRetryTimer = useRef(null);

  // Keep ref in sync
  useEffect(() => { hasJoinedRef.current = hasJoined; }, [hasJoined]);

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
      const playersArr = Array.isArray(data.players) ? data.players : [];
      const me = playersArr.find(p => p.playerId === playerId);
      if (hasJoinedRef.current || me) {
        if (me && !hasJoinedRef.current) setHasJoined(true);
        setStatus(`Waiting for players... ${data.selections?.length || 0} selected`);
      } else {
        setStatus('Joining lobby... waiting for server...');
      }
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
      const playersArr = Array.isArray(data.players) ? data.players : [];
      const me = playersArr.find(p => p.playerId === playerId);
      if (me && !hasJoinedRef.current) setHasJoined(true);
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
    const handleLobbyCountdown = (data) => {
      if (!mounted || !data) return;
      const secs = data.seconds || 10;
      setCountdownEnd(Date.now() + secs*1000);
    };
    const handleCountdownCancelled = () => {
      if (!mounted) return;
      setCountdownEnd(null);
      setCountdownTick(null);
    };
    const handleCountdownTick = (data) => {
      if (!mounted || !data) return;
      setCountdownTick(data);
    };
    const handleSocketError = (err) => {
      if (!mounted) return;
      console.error('[BR Lobby] socket_error:', err);
      const msg = err?.message || (typeof err === 'string' ? err : 'Unknown socket error');
      if (!hasJoined && msg === 'Player not found in session') {
        // Likely clicked before join completed; show info instead of error
        setStatus('Joining lobby... please wait a moment.');
        return;
      }
      setErrorMsg(msg);
    };

    const handleConnSuccess = () => {
      if (!mounted) return;
      setHasJoined(true);
      hasJoinedRef.current = true;
      setStatus('Joined lobby. Select your spawn node.');
      setErrorMsg(null);
      // Clear any pending retry timer once joined
      if (joinRetryTimer.current) {
        clearTimeout(joinRetryTimer.current);
        joinRetryTimer.current = null;
      }
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
        battleRoyaleSocket.on('lobby_countdown', handleLobbyCountdown);
        battleRoyaleSocket.on('lobby_countdown_cancelled', handleCountdownCancelled);
        battleRoyaleSocket.on('lobby_countdown_tick', handleCountdownTick);
        battleRoyaleSocket.onConnectionSuccess(handleConnSuccess);

        // Wait for connect
        await new Promise((resolve, reject) => {
          // If already connected (race), resolve immediately
          if (battleRoyaleSocket.socket && battleRoyaleSocket.socket.connected) {
            setIsConnected(true);
            setStatus('Connected. Join/restore session...');
            setErrorMsg(null);
            resolve();
            return;
          }
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
          battleRoyaleSocket.socket.on('connect', () => {
            clearTimeout(timeout);
            // Mark UI as connected immediately to allow spawn selection
            setIsConnected(true);
            setStatus('Connected. Join/restore session...');
            setErrorMsg(null);
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

        // Join session (wait for connection_success to confirm)
        battleRoyaleSocket.joinSession(sid, playerId, `Player ${playerId}`);
        setStatus('Joining lobby... waiting for server...');

        // Retry join once after 2s if not confirmed yet (idempotent on server)
        joinRetryTimer.current = setTimeout(() => {
          if (!hasJoinedRef.current) {
            try {
              battleRoyaleSocket.joinSession(sid, playerId, `Player ${playerId}`);
              setStatus('Retrying join...');
            } catch {}
          }
        }, 2000);
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
        battleRoyaleSocket.off('lobby_countdown', handleLobbyCountdown);
        battleRoyaleSocket.off('lobby_countdown_cancelled', handleCountdownCancelled);
        battleRoyaleSocket.off('lobby_countdown_tick', handleCountdownTick);
        battleRoyaleSocket.off('connection_success', handleConnSuccess);
      } catch {}
      if (joinRetryTimer.current) {
        clearTimeout(joinRetryTimer.current);
        joinRetryTimer.current = null;
      }
      // Keep socket connection for seamless transition to gameplay
    };
  }, []); // run once

  // Handle node click to select spawn
  const handleNodeClick = (nodeData) => {
    if (!nodeData?.id) return;
    if (!isConnected && !battleRoyaleSocket.isConnected) {
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

    // If not fully joined yet, queue the selection and retry after join
    if (!hasJoined) {
      setPendingSelection(nodeId);
      setStatus(`Joining lobby... will select ${nodeId} once joined.`);
      setErrorMsg(null);
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

  // Auto-apply any pending selection after we are confirmed joined
  useEffect(() => {
    if (!hasJoined || !pendingSelection) return;

    // If someone already took it, clear pending and notify
    const takenByOther = lobbySelections.some(sel => sel.nodeId === pendingSelection && sel.playerId !== playerId);
    if (takenByOther) {
      setStatus(`${pendingSelection} already taken. Choose another.`);
      setPendingSelection(null);
      return;
    }

    // If we already have a selection, clear pending
    const mine = lobbySelections.find(sel => sel.playerId === playerId);
    if (mine) {
      setPendingSelection(null);
      return;
    }

    try {
      battleRoyaleSocket.selectSpawnNode(pendingSelection);
      setStatus(`Selected ${pendingSelection}. Waiting for others...`);
      setErrorMsg(null);
    } catch (err) {
      console.error('[BR Lobby] pending selectSpawnNode failed:', err);
      setErrorMsg(err?.message || String(err));
    } finally {
      setPendingSelection(null);
    }
  }, [hasJoined, pendingSelection, lobbySelections, playerId]);

  // No-op edge clicks in lobby
  const handleEdgeClick = () => {};

  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
        `}
      </style>
      <div style={{ width: '100%', height: 'calc(100vh - 120px)', position: 'relative' }}>
      {/* Top status bar */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '8px 12px', borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Battle Royale Lobby</div>
        <div style={{ fontSize: 12 }}>
          <div>Session: <code>{sessionId || '...'}</code></div>
          <div>Player: <code>{playerId}</code></div>
          <div>Status: {status}</div>
          {countdownTick && (
            <div style={{ 
              color: countdownTick.remaining <= 3 ? '#ff4444' : '#90ee90',
              fontWeight: 'bold',
              fontSize: '14px',
              animation: countdownTick.remaining <= 3 ? 'pulse 1s infinite' : 'none'
            }}>
              ⏰ {countdownTick.message} ({countdownTick.remaining}s)
            </div>
          )}
          {countdownEnd && !countdownTick && <div style={{ color: '#90ee90' }}>Auto-start in: {Math.max(0, Math.ceil((countdownEnd-Date.now())/1000))}s</div>}
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
          allowedNodeIds={availableNodes}
          mapType={2}
        />
      </div>
    </div>
    </>
  );
}
