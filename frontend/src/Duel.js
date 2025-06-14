import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5051'; // Change if backend runs elsewhere

const languageOptions = [
  { id: 71, name: 'Python 3' },
  { id: 63, name: 'JavaScript (Node.js)' },
  { id: 54, name: 'C++' },
];
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5051';

const Duel = ({ user }) => {
  const [socket, setSocket] = useState(null);
  const [duelInfo, setDuelInfo] = useState(null);
  const [status, setStatus] = useState('Waiting to join matchmaking...');
  const [sourceCode, setSourceCode] = useState('');
  const [languageId, setLanguageId] = useState(71);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [winner, setWinner] = useState(null);
  const [timer, setTimer] = useState(20 * 60); // 20 minutes in seconds
  const timerRef = useRef();

  useEffect(() => {
    const sock = io(SOCKET_URL);
    setSocket(sock);
    setStatus('Connecting to server...');

    sock.on('connect', () => {
      setStatus('Connected! Joining matchmaking...');
      sock.emit('join_matchmaking', {
        userId: user?.id || Math.random().toString(36).slice(2),
        level: user?.level || 1,
        username: user?.email || 'Guest',
      });
    });

    sock.on('duel_start', (data) => {
      setDuelInfo(data);
      setStatus('Duel started!');
    });

    sock.on('disconnect', () => {
      setStatus('Disconnected from server');
    });

    // Listen for duel result (win/lose)
    sock.on('duel_result', (data) => {
      setWinner(data.winner);
    });

    return () => {
      sock.disconnect();
    };
  }, [user]);

  // Timer countdown
  useEffect(() => {
    if (!duelInfo || winner) return;
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          // Time's up: declare draw or no winner
          if (!winner) setWinner('Time Up! No winner');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [duelInfo, winner]);

  // Format timer
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post(`${API_URL}/run`, {
        source_code: sourceCode,
        language_id: languageId,
        stdin: duelInfo.problem.input || '',
        expected_output: duelInfo.problem.expected_output || '',
      });
      setResult(res.data);
      // If correct, emit duel_submission
      if (res.data && res.data.status && res.data.status.id === 3 && res.data.stdout && (!res.data.expected_output || res.data.stdout.trim() === res.data.expected_output.trim())) {
        socket.emit('duel_submission', { roomId: duelInfo.roomId, user: user.email });
      } else {
        // If wrong, emit duel_submission for the other user as winner
        const otherUser = duelInfo.users.find(u => u !== user.email);
        if (otherUser) {
          socket.emit('duel_submission', { roomId: duelInfo.roomId, user: otherUser });
        }
      }
    } catch (err) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  if (!user) {
    return <div style={{ padding: 24 }}>Loading user info...</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 8 }}>Real-Time Coding Duel</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span>Status: <b>{status}</b></span>
        {duelInfo && <span style={{ fontWeight: 700, color: '#e53935', fontSize: 18 }}>⏰ {formatTime(timer)}</span>}
      </div>
      {duelInfo && (
        <div style={{ border: '1px solid #ccc', borderRadius: 12, padding: 24, marginTop: 8, background: '#f8f8ff', boxShadow: '0 2px 12px rgba(124,58,237,0.07)' }}>
          <h3 style={{ color: '#3a3a3a', marginBottom: 6 }}>Room: <span style={{ color: '#7c3aed' }}>{duelInfo.roomId}</span></h3>
          <p style={{ margin: 0, fontWeight: 600 }}>Players: <span style={{ color: '#2196f3' }}>{duelInfo.users.join(' vs ')}</span></p>
          <h4 style={{ marginTop: 18, color: '#7c3aed' }}>Problem: {duelInfo.problem.title}</h4>
          <p style={{ fontSize: 16 }}>{duelInfo.problem.description}</p>
          <p style={{ fontWeight: 600 }}>Difficulty: <span style={{ color: '#ff9800' }}>{duelInfo.problem.difficulty}</span></p>
          {/* Code Editor and Submission */}
          <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600 }}>Language: </label>
              <select value={languageId} onChange={e => setLanguageId(Number(e.target.value))} style={{ marginLeft: 8 }}>
                {languageOptions.map(lang => (
                  <option key={lang.id} value={lang.id}>{lang.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, display: 'block' }}>Source Code:</label>
              <textarea
                rows={10}
                cols={60}
                value={sourceCode}
                onChange={e => setSourceCode(e.target.value)}
                required
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', padding: 10 }}
              />
            </div>
            <button type="submit" disabled={loading || !!winner || timer === 0} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 32px', fontWeight: 700, fontSize: 17, cursor: loading || !!winner || timer === 0 ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </form>
          {result && (
            <div style={{ marginTop: 18, background: '#f6f6fa', borderRadius: 8, padding: 14, border: '1px solid #e0e0e0' }}>
              <h4 style={{ margin: 0 }}>Result:</h4>
              <pre style={{ fontSize: 14, margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
          {winner && (
            <div style={{ marginTop: 18, fontWeight: 700, color: winner === user.email ? 'green' : (winner === 'Time Up! No winner' ? '#e53935' : '#e53935'), fontSize: 20 }}>
              {winner === user.email ? 'You win!' : (winner === 'Time Up! No winner' ? 'Time Up! No winner' : `${winner} wins!`)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Duel; 