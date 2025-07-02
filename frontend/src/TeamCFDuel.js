import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import { socket } from "./socket";
import useDarkMode from "./useDarkMode";
import MonacoEditor from "@monaco-editor/react";
// Yjs collaborative editing
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

const languageOptions = [
  { id: "python", name: "Python 3" },
  { id: "cpp", name: "C++" },
  { id: "javascript", name: "JavaScript (Node.js)" },
];

function TeamCFDuel({ user }) {
  const navigate = useNavigate();
  const [isDark, toggleDark] = useDarkMode();
  
  const [matchData, setMatchData] = useState(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [lastEditor, setLastEditor] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [timeRemaining, setTimeRemaining] = useState(5 * 60 * 1000); // 5 minutes
  const editorRef = useRef(null);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    // Get match data from localStorage
    const storedMatchData = localStorage.getItem('matchData');
    if (!storedMatchData) {
      setStatus("No match data found. Returning to lobby...");
      setTimeout(() => navigate('/lobby'), 2000);
      return;
    }

    const data = JSON.parse(storedMatchData);
    setMatchData(data);
    setStatus("Joining room...");

    // Join the room
    socket.emit("join_room", { roomId: data.roomId, userId: user.id });

  }, [user.id, navigate]);

  useEffect(() => {
    const sock = socket;

    sock.on("room_joined", ({ roomId, teamId, teammates, opponents, timeRemaining: remaining }) => {
      console.log("[room] Successfully joined room:", { roomId, teamId, teammates, opponents });
      setStatus("Room joined! Start coding...");
      setTimeRemaining(remaining);
      
      // Start countdown timer
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1000;
          if (newTime <= 0) {
            clearInterval(timerRef.current);
            setStatus("Time's up! Room expired.");
            return 0;
          }
          return newTime;
        });
      }, 1000);
    });

    sock.on("room_not_found", () => {
      setStatus("Room not found. Returning to lobby...");
      setTimeout(() => navigate('/lobby'), 2000);
    });

    sock.on("not_in_room", () => {
      setStatus("You are not part of this room. Returning to lobby...");
      setTimeout(() => navigate('/lobby'), 2000);
    });

    sock.on("room_expired", ({ message }) => {
      setStatus(message);
      setTimeout(() => navigate('/lobby'), 3000);
    });

    

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);

    };
  }, [navigate]);

  // Initialize Yjs provider once editor and matchData available
  useEffect(() => {
    if (!matchData || !editorRef.current) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const wsUrl = process.env.REACT_APP_YJS_WS || 'ws://localhost:5051';
    const roomName = `room-${matchData.roomId}-${matchData.teamId}`; // separate code-space per team
    const provider = new WebsocketProvider(wsUrl, roomName, ydoc);
    providerRef.current = provider;

    const yText = ydoc.getText('monaco');
    const model = editorRef.current.getModel();

    // Create binding
    const binding = new MonacoBinding(yText, model, new Set([editorRef.current]), provider.awareness);

    // Track awareness changes for "last editor" info
    provider.awareness.setLocalStateField('user', { name: user.name || user.email });
    const awarenessHandler = ({ added, updated }) => {
      const states = Array.from(provider.awareness.getStates().entries());
      const changedId = [...added, ...updated][0];
      const state = states.find(([id]) => id === changedId)?.[1];
      if (state?.user?.name) {
        setLastEditor(state.user.name === (user.name || user.email) ? 'You' : state.user.name);
      }
    };
    provider.awareness.on('change', awarenessHandler);

    // Clean up on unmount
    return () => {
      provider.awareness.off('change', awarenessHandler);
      provider.destroy();
      ydoc.destroy();
    };
  }, [matchData, editorRef.current]);

  const handleCodeChange = (value) => {
    setCode(value || "");
    setLastEditor('You');
  };

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
  };

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const returnToLobby = () => {
    localStorage.removeItem('matchData');
    navigate('/lobby');
  };

  if (!matchData) {
    return (
      <div style={{ 
        padding: 32, 
        textAlign: 'center', 
        fontFamily: 'Segoe UI, sans-serif' 
      }}>
        <h2 style={{ color: '#7c3aed' }}>⚡ Team Duel</h2>
        <p>{status}</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: 24, 
      fontFamily: 'Segoe UI, sans-serif',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 16
      }}>
        <h2 style={{ color: '#7c3aed', margin: 0 }}>⚡ Team Duel</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ 
            padding: '8px 16px',
            background: timeRemaining > 60000 ? '#16a34a' : '#dc2626',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 600
          }}>
            Time: {formatTime(timeRemaining)}
          </div>
          
          <button 
            onClick={toggleDark}
            style={{
              padding: '8px 16px',
              border: '1px solid #7c3aed',
              borderRadius: 6,
              background: 'transparent',
              color: isDark ? '#fff' : '#000',
              cursor: 'pointer'
            }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          
          <button
            onClick={returnToLobby}
            style={{
              padding: '8px 16px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Leave Room
          </button>
        </div>
      </div>

      {/* Status */}
      <div style={{ 
        background: isDark ? '#2a2a2a' : '#f8f9fa',
        padding: 16,
        borderRadius: 8,
        marginBottom: 24,
        textAlign: 'center'
      }}>
        <p style={{ margin: 0, fontSize: 16 }}>{status}</p>
      </div>

      {/* Teams Display */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: 24, 
        marginBottom: 24 
      }}>
        {/* Your Team */}
        <div style={{ 
          background: '#16a34a20',
          border: '2px solid #16a34a',
          borderRadius: 8,
          padding: 16
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#16a34a' }}>
            Your Team (Team {matchData.teamId})
          </h3>
          <div style={{ display: 'grid', gap: 4 }}>
            {matchData.teammates.map(member => (
              <div key={member.userId} style={{ 
                padding: 8,
                background: member.userId === user.id ? '#16a34a40' : '#16a34a10',
                borderRadius: 4,
                fontWeight: member.userId === user.id ? 600 : 400
              }}>
                {member.name} {member.userId === user.id && '(You)'}
              </div>
            ))}
          </div>
        </div>

        {/* Opponent Team */}
        <div style={{ 
          background: '#dc262620',
          border: '2px solid #dc2626',
          borderRadius: 8,
          padding: 16
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#dc2626' }}>
            Opponents (Team {matchData.teamId === 'A' ? 'B' : 'A'})
          </h3>
          <div style={{ display: 'grid', gap: 4 }}>
            {matchData.opponents.map(member => (
              <div key={member.userId} style={{ 
                padding: 8,
                background: '#dc262610',
                borderRadius: 4
              }}>
                {member.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Code Editor */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 12 
        }}>
          <h3 style={{ margin: 0, color: '#7c3aed' }}>Collaborative Code Editor</h3>
          {lastEditor && (
            <span style={{ fontSize: 12, color: '#888', marginLeft: 12 }}>
              Last edit by {lastEditor}
            </span>
          ) }
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="language-select" style={{ fontWeight: 600 }}>Language:</label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid #ccc',
                background: '#fff'
              }}
            >
              {languageOptions.map(lang => (
                <option key={lang.id} value={lang.id}>{lang.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ 
          border: '1px solid #ddd',
          borderRadius: 8,
          overflow: 'hidden'
        }}>
          <MonacoEditor
            height="500px"
            language={language}
            value={code}
            onChange={handleCodeChange}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            theme={isDark ? "vs-dark" : "vs-light"}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              wordWrap: 'on',
              automaticLayout: true
            }}
          />
        </div>
      </div>

      {/* Instructions */}
      <div style={{ 
        background: isDark ? '#2a2a2a' : '#f8f9fa',
        padding: 16,
        borderRadius: 8,
        fontSize: 14,
        color: '#666'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>Instructions:</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Work together with your teammates to solve the problem</li>
          <li>Code changes are shared in real-time with your team</li>
          <li>You have {Math.floor(timeRemaining / 60000)} minutes remaining</li>
          <li>Room will automatically expire after 5 minutes</li>
        </ul>
      </div>
    </div>
  );
}

export default TeamCFDuel;
