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

function randomRoomId() {
  return 'room_' + Math.random().toString(36).substr(2, 9);
}

const DuelCF = ({ user }) => {
  const [handle, setHandle] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [roomState, setRoomState] = useState(null); // { users: [], problem, startTime }
  const [status, setStatus] = useState("");
  const channelRef = useRef(null);
  const [timer, setTimer] = useState(600); // 10 min
  const [intervalId, setIntervalId] = useState(null);

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

  // Join or create a room
  const findDuel = async () => {
    setStatus("Looking for an opponent...");
    // Use a public channel for matchmaking
    const matchChannel = supabase.channel('duel_matchmaking');
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
    matchChannel.send({ type: 'broadcast', event: 'find_room', payload: { handle } });
    // Wait for a short time, then create your own room if none found
    setTimeout(async () => {
      if (!foundRoom) {
        const newRoom = randomRoomId();
        setRoomId(newRoom);
        setStatus("Created room: " + newRoom + ". Waiting for opponent...");
        // Broadcast your open room
        matchChannel.send({ type: 'broadcast', event: 'open_room', payload: { roomId: newRoom, handle } });
        matchChannel.unsubscribe();
      }
    }, 2000);
  };

  // Room channel logic
  useEffect(() => {
    if (!roomId || !handle) return;
    // Join the room channel
    const channel = supabase.channel(roomId);
    channelRef.current = channel;
    let unsubscribed = false;
    // Initial state
    let localState = { users: [{ handle, id: user.id }], problem: null, startTime: null };
    setRoomState(localState);
    // Listen for state updates
    channel.on('broadcast', { event: 'room_state' }, (payload) => {
      if (!unsubscribed) setRoomState(payload.payload);
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Announce yourself to the room
        channel.send({ type: 'broadcast', event: 'join', payload: { handle, id: user.id } });
      }
    });
    // Listen for join events
    channel.on('broadcast', { event: 'join' }, (payload) => {
      const joinedUser = payload.payload;
      if (!localState.users.find(u => u.id === joinedUser.id)) {
        localState = { ...localState, users: [...localState.users, joinedUser] };
        // If two users, assign problem and start time
        if (localState.users.length === 2 && !localState.problem) {
          const prob = EASY_PROBLEMS[Math.floor(Math.random() * EASY_PROBLEMS.length)];
          localState = { ...localState, problem: prob, startTime: Date.now() };
        }
        // Broadcast updated state
        channel.send({ type: 'broadcast', event: 'room_state', payload: localState });
      }
    });
    return () => {
      unsubscribed = true;
      channel.unsubscribe();
    };
  }, [roomId, handle, user]);

  // Start timer when duel starts (problem assigned)
  useEffect(() => {
    if (roomState && roomState.problem && roomState.startTime) {
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
  }, [roomState && roomState.problem, roomState && roomState.startTime]);

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>⚡ Codeforces Duel</h2>
      <div style={{ marginBottom: 24, textAlign: 'center', fontSize: 18 }}>
        <b>Your Handle:</b> <span style={{ color: '#2196f3', fontWeight: 600 }}>{handle || '[not set]'}</span>
      </div>
      {!roomId ? (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={findDuel}
            disabled={!handle}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 40px', fontWeight: 700, fontSize: 22, cursor: handle ? 'pointer' : 'not-allowed', boxShadow: '0 2px 12px rgba(124,58,237,0.08)' }}
          >
            Find Duel
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
          {roomState && roomState.problem ? (
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