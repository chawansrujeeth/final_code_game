import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const CF_SOCKET_URL = process.env.REACT_APP_CF_SOCKET_URL || "https://final-code-game.onrender.com";

const DuelCF = ({ user }) => {
  const [socket, setSocket] = useState(null);
  const [duelInfo, setDuelInfo] = useState(null);
  const [status, setStatus] = useState("Waiting to join matchmaking...");
  const [timer, setTimer] = useState(600); // 10 min
  const [duelStarted, setDuelStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [winner, setWinner] = useState(null);
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
    setLoading(true);
    if (!handle) {
      setError("Set your Codeforces handle in your profile first.");
      setLoading(false);
      return;
    }
    const sock = io(CF_SOCKET_URL);
    setSocket(sock);
    setStatus("Connecting to server...");
    sock.on("connect", () => {
      setStatus("Connected! Joining matchmaking...");
      sock.emit("join_cf_matchmaking", {
        userId: user?.id || Math.random().toString(36).slice(2),
        handle
      });
    });
    sock.on("cf_waiting", (data) => {
      setStatus(data.msg || "Waiting for opponent...");
      setLoading(false);
    });
    sock.on("cf_duel_start", (data) => {
      setDuelInfo(data);
      setDuelStarted(true);
      setStatus("Duel started!");
      setTimer(600 - Math.floor((Date.now() - data.startTime) / 1000));
      setLoading(false);
      setWinner(null);
    });
    sock.on("cf_duel_winner", (data) => {
      setWinner(data.winner);
      setStatus(`Winner: ${data.winner}`);
      setDuelStarted(false);
    });
    sock.on("disconnect", () => {
      setStatus("Disconnected from server");
      setDuelStarted(false);
      setDuelInfo(null);
      setLoading(false);
    });
    sock.on("connect_error", (err) => {
      setError("Could not connect to duel server: " + err.message);
      setLoading(false);
    });
  };

  // Timer countdown
  useEffect(() => {
    if (!duelStarted) return;
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
  }, [duelStarted]);

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>⚡ Codeforces Duel</h2>
      <div style={{ marginBottom: 24, textAlign: 'center', fontSize: 18 }}>
        <b>Your Handle:</b> <span style={{ color: '#2196f3', fontWeight: 600 }}>{handle || '[not set]'}</span>
      </div>
      {error && <div style={{ color: '#e53935', marginBottom: 18, textAlign: 'center', fontSize: 17 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', color: '#888', fontSize: 18, margin: '24px 0' }}>Loading...</div>}
      {!duelStarted && !loading && !error ? (
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
      ) : duelInfo ? (
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 36, minHeight: 220, textAlign: 'center', position: 'relative' }}>
          <div style={{ marginBottom: 18, fontSize: 17 }}>
            <b>Room:</b> <span style={{ color: '#7c3aed' }}>{duelInfo.roomId}</span>
          </div>
          <div style={{ marginBottom: 18, fontSize: 18 }}>
            <b>Players:</b> {duelInfo.users.map(h => (
              <span key={h} style={{ color: h === handle ? '#2196f3' : '#7c3aed', fontWeight: 700, margin: '0 8px' }}>{h}</span>
            )).reduce((prev, curr) => [prev, <span style={{ color: '#aaa', fontWeight: 400 }}>vs</span>, curr])}
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
            {winner ? (
              <>
                <span style={{ color: winner === handle ? '#43a047' : '#e53935', fontWeight: 700, fontSize: 20 }}>
                  {winner === handle ? '🎉 You won!' : `🏆 Winner: ${winner}`}
                </span>
                <div style={{ marginTop: 10, fontSize: 17, color: '#333', fontWeight: 600 }}>
                  Duel ended! {winner} won the duel.
                </div>
              </>
            ) : (
              <>
                Duel started! Solve the problem on Codeforces. <br />
                <span style={{ color: '#888', fontSize: 15 }}>(First to solve wins. Winner display coming soon!)</span>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DuelCF; 