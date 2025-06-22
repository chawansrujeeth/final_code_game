import React, { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import axios from "axios";

const EASY_PROBLEMS = [
  { contestId: 1, index: "A", name: "Theatre Square" },
  { contestId: 4, index: "A", name: "Watermelon" },
  { contestId: 71, index: "A", name: "Way Too Long Words" },
  { contestId: 231, index: "A", name: "Team" },
  { contestId: 158, index: "A", name: "Next Round" }
];

const DuelCF = ({ user }) => {
  const [handle, setHandle] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [roomState, setRoomState] = useState(null); // { users: [], problem, startTime, status }
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(null);
  const [timer, setTimer] = useState(600); // 10 min
  const [intervalId, setIntervalId] = useState(null);
  const [subscribed, setSubscribed] = useState(false);

  // Fetch user's Codeforces handle from profile
  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("codeforces_handle")
        .eq("user_id", user.id)
        .single();
      if (data && data.codeforces_handle) setHandle(data.codeforces_handle);
    }
    fetchProfile();
  }, [user]);

  // Subscribe to room updates as soon as roomId is set
  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    setSubscribed(false);
    const channel = supabase.channel(`duel_room_${roomId}`);
    channelRef.current = channel;
    let unsubscribed = false;
    // Listen for room updates
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'duel_rooms', filter: `id=eq.${roomId}` }, async (payload) => {
      if (!unsubscribed && payload.new) {
        const room = payload.new;
        const users = [
          { handle: room.player1_handle, id: room.player1_id },
          ...(room.player2_id ? [{ handle: room.player2_handle, id: room.player2_id }] : [])
        ];
        setRoomState({ users, problem: room.problem, startTime: room.start_time, status: room.status });
        // Always fetch latest state after update
        const { data: latest } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
        if (latest) {
          const users2 = [
            { handle: latest.player1_handle, id: latest.player1_id },
            ...(latest.player2_id ? [{ handle: latest.player2_handle, id: latest.player2_id }] : [])
          ];
          setRoomState({ users: users2, problem: latest.problem, startTime: latest.start_time, status: latest.status });
        }
      }
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setSubscribed(true);
        // Initial fetch
        const { data: room } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
        if (room) {
          const users = [
            { handle: room.player1_handle, id: room.player1_id },
            ...(room.player2_id ? [{ handle: room.player2_handle, id: room.player2_id }] : [])
          ];
          setRoomState({ users, problem: room.problem, startTime: room.start_time, status: room.status });
        }
        setLoading(false);
      }
    });
    return () => {
      unsubscribed = true;
      channel.unsubscribe();
    };
  }, [roomId]);

  // Table-based matchmaking
  const joinRoom = async () => {
    setStatus("Joining a room...");
    setLoading(true);
    // 1. Look for a waiting room
    const { data: rooms, error } = await supabase
      .from('duel_rooms')
      .select('*')
      .eq('status', 'waiting')
      .is('player2_id', null)
      .limit(1);
    let newRoomId = null;
    if (rooms && rooms.length > 0) {
      // Join as player2
      const room = rooms[0];
      newRoomId = room.id;
      setRoomId(newRoomId); // Subscribe BEFORE updating
      // Wait for subscription to be ready
      const waitForSub = () => new Promise(res => {
        const check = () => subscribed ? res() : setTimeout(check, 50);
        check();
      });
      await waitForSub();
      const problem = EASY_PROBLEMS[Math.floor(Math.random() * EASY_PROBLEMS.length)];
      const startTime = Date.now();
      await supabase.from('duel_rooms').update({
        player2_id: user.id,
        player2_handle: handle,
        status: 'active',
        problem,
        start_time: startTime
      }).eq('id', room.id);
      setStatus("Joined room: " + room.id);
      setLoading(false);
    } else {
      // Create a new room as player1
      const { data: newRoom, error: insertErr } = await supabase.from('duel_rooms').insert({
        player1_id: user.id,
        player1_handle: handle,
        status: 'waiting',
        problem: null,
        start_time: null
      }).select().single();
      newRoomId = newRoom.id;
      setRoomId(newRoomId); // Subscribe immediately
      setStatus("Created room: " + newRoomId + ". Waiting for opponent...");
      setLoading(false);
    }
  };

  // Start timer when duel starts (problem assigned)
  useEffect(() => {
    if (roomState && roomState.problem && roomState.startTime && roomState.status === 'active') {
      // Calculate time left based on startTime
      const updateTimer = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - roomState.startTime) / 1000);
        const timeLeft = Math.max(0, 600 - elapsed);
        setTimer(timeLeft);
      };
      updateTimer();
      if (intervalId) clearInterval(intervalId);
      const id = setInterval(updateTimer, 1000);
      setIntervalId(id);
      return () => clearInterval(id);
    } else {
      setTimer(600);
      if (intervalId) clearInterval(intervalId);
    }
  }, [roomState && roomState.problem, roomState && roomState.startTime, roomState && roomState.status]);

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>⚡ Codeforces Duel</h2>
      <div style={{ marginBottom: 24, textAlign: 'center', fontSize: 18 }}>
        <b>Your Handle:</b> <span style={{ color: '#2196f3', fontWeight: 600 }}>{handle || '[not set]'}</span>
      </div>
      {loading && <div style={{ textAlign: 'center', color: '#888', fontSize: 18, margin: '24px 0' }}>Loading room...</div>}
      {!roomId && !loading ? (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={joinRoom}
            disabled={!handle}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 40px', fontWeight: 700, fontSize: 22, cursor: handle ? 'pointer' : 'not-allowed', boxShadow: '0 2px 12px rgba(124,58,237,0.08)' }}
          >
            Join Room
          </button>
          {!handle && <div style={{ color: '#e53935', marginTop: 16, fontSize: 16 }}>Set your Codeforces handle in your profile first.</div>}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 36, minHeight: 220, textAlign: 'center', position: 'relative' }}>
          <div style={{ marginBottom: 18, fontSize: 17 }}>
            <b>Room:</b> <span style={{ color: '#7c3aed' }}>{roomId}</span>
          </div>
          <div style={{ marginBottom: 18, fontSize: 18 }}>
            <b>Players:</b> {roomState && roomState.users.map(u => (
              <span key={u.id} style={{ color: u.handle === handle ? '#2196f3' : '#7c3aed', fontWeight: 700, margin: '0 8px' }}>{u.handle}</span>
            )).reduce((prev, curr) => [prev, <span style={{ color: '#aaa', fontWeight: 400 }}>vs</span>, curr])}
          </div>
          {roomState && roomState.problem && roomState.status === 'active' ? (
            <>
              <div style={{ marginBottom: 18 }}>
                <a
                  href={`https://codeforces.com/contest/${roomState.problem.contestId}/problem/${roomState.problem.index}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#2196f3', fontWeight: 700, fontSize: 22, textDecoration: 'none', letterSpacing: 1 }}
                >
                  {roomState.problem.contestId}{roomState.problem.index} - {roomState.problem.name}
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