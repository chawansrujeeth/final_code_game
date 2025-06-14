import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const SOCKET_URL = 'http://localhost:5051'; // Change if backend runs elsewhere

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

  useEffect(() => {
    const sock = io(SOCKET_URL);
    setSocket(sock);
    setStatus('Connecting to server...');

    sock.on('connect', () => {
      setStatus('Connected! Joining matchmaking...');
      sock.emit('join_matchmaking', {
        userId: user?.id || Math.random().toString(36).slice(2),
        level: user?.level || 1,
        username: user?.username || 'Guest',
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
        socket.emit('duel_submission', { roomId: duelInfo.roomId, user: user.username });
      }
    } catch (err) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Real-Time Coding Duel</h2>
      <p>Status: {status}</p>
      {duelInfo && (
        <div style={{ border: '1px solid #ccc', padding: 16, marginTop: 16 }}>
          <h3>Room: {duelInfo.roomId}</h3>
          <p>Players: {duelInfo.users.join(' vs ')}</p>
          <h4>Problem: {duelInfo.problem.title}</h4>
          <p>{duelInfo.problem.description}</p>
          <p>Difficulty: {duelInfo.problem.difficulty}</p>
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
            <button type="submit" disabled={loading} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 32px', fontWeight: 700, fontSize: 17, cursor: 'pointer' }}>
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
            <div style={{ marginTop: 18, fontWeight: 700, color: winner === user.username ? 'green' : 'red' }}>
              {winner === user.username ? 'You win!' : `${winner} wins!`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Duel; 