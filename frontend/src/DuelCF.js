import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const CF_SOCKET_URL = process.env.REACT_APP_CF_SOCKET_URL || "https://final-code-game.onrender.com";

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

const DuelCF = ({ user }) => {
  const [socket, setSocket] = useState(null);
  const [duelInfo, setDuelInfo] = useState(null);
  const [timer, setTimer] = useState(600); // 10 min
  const [error, setError] = useState("");
  const [winner, setWinner] = useState(null);
  const [duelState, setDuelState] = useState("idle"); // idle, waiting, matched, started, ended
  const [opponent, setOpponent] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const timerRef = useRef();

  // Fetch user's Codeforces handle from profile
  const [handle, setHandle] = useState("");
  useEffect(() => {
    async function fetchProfile() {
      try {
        if (!user) return;
        if (user.codeforces_handle) {
          setHandle(user.codeforces_handle);
          return;
        }
        // fallback: fetch from supabase if not in user prop
        const { data, error } = await import("./supabaseClient").then(m => m.supabase)
          .from("profiles")
          .select("codeforces_handle")
          .eq("user_id", user.id)
          .single();
        if (error) throw error;
        if (data && data.codeforces_handle) setHandle(data.codeforces_handle);
        else setError("No Codeforces handle set in your profile.");
      } catch (err) {
        setError("Failed to fetch profile: " + (err.message || err));
      }
    }
    fetchProfile();
  }, [user]);

  // Connect to backend and handle matchmaking
  const joinDuel = () => {
    setError("");
    setDuelState("waiting");
    setStatusMsg("Connecting to server...");
    setWinner(null);
    setDuelInfo(null);
    setOpponent("");
    if (!handle) {
      setError("Set your Codeforces handle in your profile first.");
      setDuelState("idle");
      return;
    }
    const sock = io(CF_SOCKET_URL);
    setSocket(sock);
    sock.on("connect", () => {
      setStatusMsg("Connected! Joining matchmaking...");
      sock.emit("join_cf_matchmaking", {
        userId: user?.id || Math.random().toString(36).slice(2),
        handle
      });
    });
    sock.on("cf_waiting", (data) => {
      setStatusMsg(data.msg || "Waiting for opponent...");
      setDuelState("waiting");
    });
    sock.on("cf_duel_start", (data) => {
      setDuelInfo(data);
      setDuelState("started");
      setStatusMsg("Duel started!");
      setTimer(600 - Math.floor((Date.now() - data.startTime) / 1000));
      setWinner(null);
      // Set opponent
      const opp = data.users.find(h => h !== handle);
      setOpponent(opp || "");
      setMyCode("");
      setOpponentCode("");
    });
    sock.on("cf_duel_winner", (data) => {
      setWinner(data.winner);
      setDuelState("ended");
      setStatusMsg(`Winner: ${data.winner}`);
    });
    sock.on("disconnect", () => {
      setStatusMsg("Disconnected from server");
      setDuelState("idle");
      setDuelInfo(null);
      setWinner(null);
      setOpponent("");
    });
    sock.on("connect_error", (err) => {
      setError("Could not connect to duel server: " + err.message);
      setDuelState("idle");
    });
    // Code sync events
    sock.on("cf_code_receive", ({ code, from }) => {
      // Only update if from opponent
      if (from === opponent) setOpponentCode(code);
    });
  };

  // Timer countdown
  useEffect(() => {
    if (duelState !== "started") return;
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [duelState]);

  // Play again handler
  const resetDuel = () => {
    if (socket) socket.disconnect();
    setDuelState("idle");
    setDuelInfo(null);
    setWinner(null);
    setOpponent("");
    setStatusMsg("");
    setTimer(600);
  };

  // Debounced code send
  const sendCodeUpdate = useRef(debounce((code) => {
    if (socket && duelInfo) {
      socket.emit("cf_code_update", {
        roomId: duelInfo.roomId,
        code,
        from: handle
      });
    }
  }, 500)).current;

  // On my code change, send to server
  useEffect(() => {
    if (duelState === "started" && duelInfo) {
      sendCodeUpdate(myCode);
    }
    // eslint-disable-next-line
  }, [myCode]);

  // UI for each state
  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>⚡ Codeforces Duel</h2>
      <div style={{ marginBottom: 18, textAlign: 'center', fontSize: 18 }}>
        <b>Your Handle:</b> <span style={{ color: '#2196f3', fontWeight: 600 }}>{handle || '[not set]'}</span>
      </div>
      {error && <div style={{ color: '#e53935', marginBottom: 18, textAlign: 'center', fontSize: 17 }}>{error}</div>}
      {/* Idle state: show join button */}
      {duelState === "idle" && !error && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={joinDuel}
            disabled={!handle}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 40px', fontWeight: 700, fontSize: 22, cursor: handle ? 'pointer' : 'not-allowed', boxShadow: '0 2px 12px rgba(124,58,237,0.08)' }}
          >
            Join Duel
          </button>
          {!handle && <div style={{ color: '#e53935', marginTop: 16, fontSize: 16 }}>Set your Codeforces handle in your profile first.</div>}
        </div>
      )}
      {/* Waiting for opponent */}
      {duelState === "waiting" && (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="spinner" style={{ margin: '0 auto 18px', width: 48, height: 48, border: '6px solid #eee', borderTop: '6px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 20, color: '#7c3aed', fontWeight: 600, marginBottom: 8 }}>{statusMsg || 'Waiting for opponent...'}</div>
          <div style={{ color: '#888', fontSize: 16 }}>Share this page with a friend or wait to be matched.</div>
        </div>
      )}
      {/* Matched/Ready (show both handles, prepping to start) */}
      {duelState === "started" && duelInfo && !winner && (
        <>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 36, minHeight: 220, textAlign: 'center', position: 'relative', transition: 'all 0.3s', marginBottom: 32 }}>
            <div style={{ marginBottom: 18, fontSize: 18, fontWeight: 600, color: '#7c3aed' }}>
              Opponent: <span style={{ color: '#e53935', fontWeight: 700 }}>{opponent}</span>
            </div>
            <div style={{ marginBottom: 18, fontSize: 18 }}>
              <b>Players:</b> <span style={{ color: '#2196f3', fontWeight: 700 }}>{handle}</span> <span style={{ color: '#aaa', fontWeight: 400 }}>vs</span> <span style={{ color: '#e53935', fontWeight: 700 }}>{opponent}</span>
            </div>
            <div style={{ marginBottom: 18 }}>
              <a
                href={`https://codeforces.com/contest/${duelInfo.problem.contestId}/problem/${duelInfo.problem.index}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#2196f3', fontWeight: 700, fontSize: 22, textDecoration: 'none', letterSpacing: 1 }}
              >
                {duelInfo.problem.contestId}{duelInfo.problem.index} - {duelInfo.problem.name}
              </a>
            </div>
            <div style={{ fontSize: 22, marginBottom: 12, color: timer <= 30 ? '#e53935' : '#333', fontWeight: 700, letterSpacing: 1 }}>
              ⏰ Time Left: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(timer / 60).toString().padStart(2, '0')}:{(timer % 60).toString().padStart(2, '0')}</span>
            </div>
            <div style={{ fontSize: 15, color: '#e53935', marginBottom: 10 }}>
              Note: Refreshing the page will remove you from the duel and count as a forfeit.
            </div>
            <div style={{ fontSize: 17, marginBottom: 18, color: '#555' }}>
              Duel started! Solve the problem on Codeforces.<br />
              <span style={{ color: '#888', fontSize: 15 }}>(First to solve wins. Winner display coming soon!)</span>
            </div>
          </div>
          {/* Code Editor Section */}
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'flex-start', marginBottom: 32 }}>
            {/* Your Editor */}
            <div style={{ flex: 1, background: '#f7f8fa', borderRadius: 12, boxShadow: '0 2px 12px rgba(124,58,237,0.06)', padding: 18, minWidth: 320 }}>
              <div style={{ fontWeight: 700, color: '#2196f3', marginBottom: 8, fontSize: 17 }}>Your Code</div>
              <textarea
                rows={18}
                value={myCode}
                onChange={e => setMyCode(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 15, borderRadius: 8, border: '1px solid #bbb', padding: 12, minHeight: 260, background: '#fff' }}
                placeholder="Write your code here..."
              />
            </div>
            {/* Opponent's Editor */}
            <div style={{ flex: 1, background: '#f7f8fa', borderRadius: 12, boxShadow: '0 2px 12px rgba(237,58,58,0.06)', padding: 18, minWidth: 320 }}>
              <div style={{ fontWeight: 700, color: '#e53935', marginBottom: 8, fontSize: 17 }}>{opponent}'s Code</div>
              <textarea
                rows={18}
                value={opponentCode}
                readOnly
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 15, borderRadius: 8, border: '1px solid #bbb', padding: 12, minHeight: 260, background: '#f9f9f9', color: '#888' }}
                placeholder="Waiting for opponent's code..."
              />
            </div>
          </div>
        </>
      )}
      {/* Duel ended, show winner and play again */}
      {duelState === "ended" && duelInfo && (
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 36, minHeight: 220, textAlign: 'center', position: 'relative', transition: 'all 0.3s' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: winner === handle ? '#43a047' : '#e53935', marginBottom: 16 }}>
            {winner === handle ? '🎉 You won!' : `🏆 Winner: ${winner}`}
          </div>
          <div style={{ marginBottom: 18, fontSize: 18 }}>
            <b>Players:</b> <span style={{ color: '#2196f3', fontWeight: 700 }}>{handle}</span> <span style={{ color: '#aaa', fontWeight: 400 }}>vs</span> <span style={{ color: '#e53935', fontWeight: 700 }}>{opponent}</span>
          </div>
          <div style={{ marginBottom: 18 }}>
            <a
              href={`https://codeforces.com/contest/${duelInfo.problem.contestId}/problem/${duelInfo.problem.index}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2196f3', fontWeight: 700, fontSize: 22, textDecoration: 'none', letterSpacing: 1 }}
            >
              {duelInfo.problem.contestId}{duelInfo.problem.index} - {duelInfo.problem.name}
            </a>
          </div>
          <div style={{ marginTop: 18, fontSize: 19, color: '#333', fontWeight: 600 }}>
            Duel ended! {winner} won the duel.
          </div>
          <button
            onClick={resetDuel}
            style={{ marginTop: 28, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 32px', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 2px 12px rgba(124,58,237,0.08)' }}
          >
            Play Again
          </button>
        </div>
      )}
      {/* Add spinner animation keyframes */}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default DuelCF; 