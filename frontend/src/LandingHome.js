import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import BattleRoyaleSocket, { battleRoyaleSocket } from "./battleRoyaleSocket";

export default function LandingHome() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/login');
  };
  const [user, setUser] = useState(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const navigate = useNavigate();
  // Battle Royale queue state
  const [queueSize, setQueueSize] = useState(0);
  const [inQueue, setInQueue] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
  const [queueError, setQueueError] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Generate or restore a BR playerId for queueing
  const [playerId] = useState(() => {
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
  const [playerName] = useState(() => `Player ${playerId}`);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) navigate('/login');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) navigate('/login');
    });
    // fetch profile row to check if registered
    if (user) {
      supabase.from('profiles').select('name, codeforces_handle').eq('user_id', user.id).single()
        .then(({ data, error }) => {
          if (error) return;
          const missing = !(data && data.name && data.name.trim() && data.codeforces_handle && data.codeforces_handle.trim());
          setNeedsProfile(missing);
        });
    }
    return () => listener.subscription.unsubscribe();
  }, []);

  // Setup BR socket + queue events
  useEffect(() => {
    let mounted = true;
    const serverUrl = process.env.REACT_APP_BATTLE_ROYALE_SERVER_URL || 'http://localhost:5003';

    // Handlers
    const handleConn = (s) => {
      if (!mounted) return;
      if (s.connected) {
        setSocketConnected(true);
        setQueueStatus('Connected to matchmaking');
      } else if (s.reconnecting) {
        setSocketConnected(false);
        setQueueStatus(`Reconnecting... (${s.attempt}/${s.maxAttempts})`);
      } else {
        setSocketConnected(false);
        setQueueStatus('Disconnected from matchmaking');
      }
    };
    const handleQueueUpdate = (data) => {
      if (!mounted) return;
      setQueueSize(data?.size || 0);
    };
    const handleQueueJoined = (data) => {
      if (!mounted) return;
      setInQueue(true);
      setQueueError(null);
      setQueueStatus(`In queue (${data?.position || '?'}/${data?.required || 4})`);
    };
    const handleQueueLeft = () => {
      if (!mounted) return;
      setInQueue(false);
      setQueueStatus('Left queue');
    };
    const handleQueueError = (e) => {
      if (!mounted) return;
      const msg = e?.message || 'Queue error';
      setQueueError(msg);
      setQueueStatus('');
    };
    const handleMatchFound = (data) => {
      if (!mounted) return;
      const sid = data?.sessionId;
      if (!sid) return;
      try { localStorage.setItem('BR_SESSION_ID', sid); } catch {}
      setInQueue(false);
      setQueueStatus('Match found! Joining lobby...');
      // Navigate to lobby with session param
      navigate(`/battle-royale-lobby?session=${encodeURIComponent(sid)}`);
    };

    try {
      // Connect once
      battleRoyaleSocket.connect(serverUrl);
      battleRoyaleSocket.onConnectionStatus(handleConn);
      battleRoyaleSocket.onQueueUpdate(handleQueueUpdate);
      battleRoyaleSocket.onQueueJoined(handleQueueJoined);
      battleRoyaleSocket.onQueueLeft(handleQueueLeft);
      battleRoyaleSocket.onQueueError(handleQueueError);
      battleRoyaleSocket.onMatchFound(handleMatchFound);
    } catch (e) {
      console.error('Matchmaking socket init failed:', e);
      setQueueError(e?.message || String(e));
    }

    return () => {
      mounted = false;
      try {
        battleRoyaleSocket.off('connection_status', handleConn);
        battleRoyaleSocket.off('queue_update', handleQueueUpdate);
        battleRoyaleSocket.off('queue_joined', handleQueueJoined);
        battleRoyaleSocket.off('queue_left', handleQueueLeft);
        battleRoyaleSocket.off('queue_error', handleQueueError);
        battleRoyaleSocket.off('match_found', handleMatchFound);
      } catch {}
    };
  }, [navigate, playerId, playerName]);

  const joinQueue = () => {
    try {
      battleRoyaleSocket.joinQueue(playerId, playerName);
      setQueueStatus('Joining queue...');
    } catch (e) {
      setQueueError(e?.message || String(e));
    }
  };

  const leaveQueue = () => {
    try {
      battleRoyaleSocket.leaveQueue();
      setQueueStatus('Leaving queue...');
    } catch (e) {
      setQueueError(e?.message || String(e));
    }
  };

  return (
    <>
      <style>{`
        @media (max-width: 600px) {
          .landing-title {
            font-size: 2rem !important;
          }
          .landing-tagline {
            font-size: 1rem !important;
          }
          .landing-main-btn {
            font-size: 1rem !important;
            padding: 0.7rem 1.5rem !important;
          }
          .landing-header {
            padding: 1.2rem 0 0.5rem 0 !important;
          }
        }
      `}</style>
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, var(--bg) 0%, var(--card) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, 'sans-serif'",
        padding: "0 1rem"
      }}>
        <header className="landing-header" style={{ width: "100%", maxWidth: 900, padding: "2rem 0 1rem 0", textAlign: "center" }}>
          <h1 className="landing-title" style={{ color: "#7c3aed", fontSize: "3rem", margin: 0, fontWeight: 800, letterSpacing: 1 }}>Code Stories</h1>

        </header>
        <main style={{ marginTop: 40, textAlign: "center", display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120}}

            onClick={() => navigate("/lobby")}
          >
            Lobby
          </button>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120}}

            onClick={() => navigate("/duel_cf")}
          >
            Duel (CF)
          </button>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120}}
            onClick={() => navigate("/testing")}
          >
            Testing
          </button>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120}}
            onClick={() => navigate("/radial")}
          >
            Radial
          </button>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120, background: 'linear-gradient(45deg, #00ff88, #00cc6a)', color: '#000', fontWeight: 'bold'}}
            onClick={() => navigate("/battle-royale-lobby")}
          >
            🎮 Battle Royale
          </button>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120, background: 'linear-gradient(45deg, #ff6b6b, #ee5a24)', color: '#fff', fontWeight: 'bold'}}
            onClick={() => navigate("/battle-royale-map-test")}
          >
            🗺️ New Map Test
          </button>
          {user && (
            <button
              className={needsProfile ? 'btn btn-attn btn-rect' : 'btn btn-shadow btn-rect'}
              style={needsProfile ? {} : {minWidth:120}}
              onClick={() => navigate('/profile')}
            >
              Profile
            </button>
          )}
        </main>
        {/* Battle Royale matchmaking queue panel */}
        <div style={{ width: '100%', maxWidth: 900, marginTop: 24 }}>
          <div style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: '16px 20px',
            color: '#fff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Battle Royale Matchmaking</div>
                <div style={{ fontSize: 13, opacity: 0.9 }}>
                  Status: {queueStatus || (socketConnected ? 'Connected' : 'Connecting...')}
                  <br />Queued players: {queueSize} / 4
                  {queueError && <>
                    <br /><span style={{ color: '#ff8a80' }}>Error: {queueError}</span>
                  </>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {!inQueue ? (
                  <button className="btn btn-shadow btn-rect" onClick={joinQueue} disabled={!socketConnected}>
                    🔎 Find Match
                  </button>
                ) : (
                  <button className="btn btn-shadow btn-rect" onClick={leaveQueue}>
                    ✋ Leave Queue
                  </button>
                )}
                <button className="btn btn-shadow btn-rect" onClick={() => navigate('/battle-royale-lobby')}>
                  Open Lobby
                </button>
              </div>
            </div>
          </div>
        </div>
        {user && (
          <button
            className="btn btn-shadow btn-rect"
            style={{position:'fixed', bottom:24, right:24, zIndex:101, padding:'0.6rem 1.4rem', fontSize:'0.9rem'}}
            onClick={handleLogout}
          >
            Logout
          </button>
        )}
      </div>
    </>
  );
}