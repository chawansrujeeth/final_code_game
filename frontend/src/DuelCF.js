import React, { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";

const EASY_PROBLEMS = [
  { contestId: 1, index: "A", name: "Theatre Square" },
  { contestId: 4, index: "A", name: "Watermelon" },
  { contestId: 71, index: "A", name: "Way Too Long Words" },
  { contestId: 231, index: "A", name: "Team" },
  { contestId: 158, index: "A", name: "Next Round" }
];

function randomRoomId() {
  return 'cfroom_' + Math.random().toString(36).substr(2, 9);
}

const DuelCF = ({ user }) => {
  const [handle, setHandle] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]); // [{id, handle}]
  const [problem, setProblem] = useState(null);
  const [timer, setTimer] = useState(600); // 10 min
  const [duelStarted, setDuelStarted] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef();
  const channelRef = useRef();

  // Fetch user's Codeforces handle from profile
  useEffect(() => {
    async function fetchProfile() {
      try {
        if (!user) return;
        const { data, error } = await supabase
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

  // Join matchmaking channel and room
  const joinDuel = async () => {
    setError("");
    setLoading(true);
    setStatus("Looking for an opponent...");
    try {
      if (!handle) {
        setError("Set your Codeforces handle in your profile first.");
        setLoading(false);
        return;
      }
      const matchChannel = supabase.channel('cf_duel_matchmaking');
      let foundRoom = null;
      // Listen for open rooms
      const onMsg = (payload) => {
        if (payload.event === 'open_room' && !foundRoom) {
          foundRoom = payload.payload.roomId;
          setRoomId(foundRoom);
          setStatus("Joining room: " + foundRoom);
          matchChannel.unsubscribe();
        }
      };
      matchChannel.on('broadcast', { event: 'open_room' }, onMsg);
      await matchChannel.subscribe();
      // Broadcast that you want to join a room
      matchChannel.send({ type: 'broadcast', event: 'find_room', payload: { handle, id: user.id } });
      // Wait for a short time, then create your own room if none found
      setTimeout(() => {
        if (!foundRoom) {
          const newRoom = randomRoomId();
          setRoomId(newRoom);
          setStatus("Created room: " + newRoom + ". Waiting for opponent...");
          // Broadcast your open room
          matchChannel.send({ type: 'broadcast', event: 'open_room', payload: { roomId: newRoom, handle, id: user.id } });
          matchChannel.unsubscribe();
        }
        setLoading(false);
      }, 2000);
    } catch (err) {
      setError("Failed to join duel: " + (err.message || err));
      setLoading(false);
    }
  };

  // Room logic: subscribe, handle join, start duel
  useEffect(() => {
    if (!roomId || !handle) return;
    setError("");
    setLoading(true);
    const channel = supabase.channel(roomId);
    channelRef.current = channel;
    let localPlayers = [];
    let duelStartedLocal = false;
    // Listen for join events
    channel.on('broadcast', { event: 'join' }, (payload) => {
      const joined = payload.payload;
      if (!localPlayers.find(p => p.id === joined.id)) {
        localPlayers = [...localPlayers, joined];
        setPlayers([...localPlayers]);
        // If two players, start duel
        if (localPlayers.length === 2 && !duelStartedLocal) {
          duelStartedLocal = true;
          const prob = EASY_PROBLEMS[Math.floor(Math.random() * EASY_PROBLEMS.length)];
          channel.send({ type: 'broadcast', event: 'duel_start', payload: { players: localPlayers, problem: prob, startTime: Date.now() } });
        }
      }
    });
    // Listen for duel start
    channel.on('broadcast', { event: 'duel_start' }, (payload) => {
      setPlayers(payload.payload.players);
      setProblem(payload.payload.problem);
      setDuelStarted(true);
      setStatus('Duel started!');
      setTimer(600 - Math.floor((Date.now() - payload.payload.startTime) / 1000));
      setLoading(false);
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Announce yourself to the room
        channel.send({ type: 'broadcast', event: 'join', payload: { handle, id: user.id } });
      }
    });
    return () => {
      channel.unsubscribe();
    };
  }, [roomId, handle, user]);

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
      {!roomId && !loading && !error ? (
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
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 36, minHeight: 220, textAlign: 'center', position: 'relative' }}>
          <div style={{ marginBottom: 18, fontSize: 17 }}>
            <b>Room:</b> <span style={{ color: '#7c3aed' }}>{roomId}</span>
          </div>
          <div style={{ marginBottom: 18, fontSize: 18 }}>
            <b>Players:</b> {players.map(p => (
              <span key={p.id} style={{ color: p.handle === handle ? '#2196f3' : '#7c3aed', fontWeight: 700, margin: '0 8px' }}>{p.handle}</span>
            )).reduce((prev, curr) => [prev, <span style={{ color: '#aaa', fontWeight: 400 }}>vs</span>, curr])}
          </div>
          {duelStarted && problem ? (
            <>
              <div style={{ marginBottom: 18 }}>
                <a
                  href={`https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#2196f3', fontWeight: 700, fontSize: 22, textDecoration: 'none', letterSpacing: 1 }}
                >
                  {problem.contestId}{problem.index} - {problem.name}
                </a>
              </div>
              <div style={{ fontSize: 22, marginBottom: 12, color: timer <= 30 ? '#e53935' : '#333', fontWeight: 700, letterSpacing: 1 }}>
                ⏰ Time Left: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(timer / 60).toString().padStart(2, '0')}:{(timer % 60).toString().padStart(2, '0')}</span>
              </div>
              <div style={{ fontSize: 17, marginBottom: 18, color: '#555' }}>
                Duel started! Solve the problem on Codeforces. <br />
                <span style={{ color: '#888', fontSize: 15 }}>(First to solve wins. Winner display coming soon!)</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 18, marginBottom: 18, color: '#888' }}>{status || 'Waiting for opponent...'}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default DuelCF; 