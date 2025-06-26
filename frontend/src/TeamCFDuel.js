import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import MonacoEditor from "@monaco-editor/react";

const CF_SOCKET_URL = "https://final-code-game-2.onrender.com";

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

const languageOptions = [
  { id: "python", name: "Python 3" },
  { id: "cpp", name: "C++" },
  { id: "javascript", name: "JavaScript (Node.js)" },
];

// TODO: Implement 2v2 team collaborative duel logic here
const TeamCFDuel = ({ user }) => {
  const [socket, setSocket] = useState(null);
  const [teamCode, setTeamCode] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("python");
  const [statusMsg, setStatusMsg] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [opponents, setOpponents] = useState([]);
  const teamCodeRef = useRef("");

  // Connect to socket and join team room
  useEffect(() => {
    const sock = io(CF_SOCKET_URL);
    setSocket(sock);
    sock.on("connect", () => {
      setStatusMsg("Connected! Waiting for team...");
      sock.emit("join_team_duel", { userId: user?.id || Math.random().toString(36).slice(2), name: user?.name || user?.email });
    });
    sock.on("team_assignment", ({ roomId, teamId, teamMembers, opponents }) => {
      setRoomId(roomId);
      setTeamId(teamId);
      setTeamMembers(teamMembers);
      setOpponents(opponents);
      setStatusMsg("Team assigned! Waiting for all players...");
    });
    sock.on("team_code_update", ({ code }) => {
      setTeamCode(code);
      teamCodeRef.current = code;
    });
    return () => sock.disconnect();
  }, [user]);

  // Send code updates to team (with roomId/teamId)
  const sendCodeUpdate = useCallback(
    debounce((code) => {
      if (socket && roomId && teamId) {
        socket.emit("team_code_update", { code, roomId, teamId });
      }
    }, 300),
    [socket, roomId, teamId]
  );

  // On code change, broadcast to team
  const handleCodeChange = (value) => {
    setTeamCode(value || "");
    teamCodeRef.current = value || "";
    sendCodeUpdate(value || "");
  };

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>⚡ Codeforces Team Duel (2v2)</h2>
      <div style={{ marginBottom: 18, textAlign: 'center', fontSize: 18 }}>
        <b>Collaborative Team Code Editor</b>
      </div>
      <div style={{ marginBottom: 18, textAlign: 'center', fontSize: 16 }}>
        <b>Your Team:</b> {teamMembers.map(m => m.name || m.userId).join(', ') || '[waiting...]'}<br/>
        <b>Opponents:</b> {opponents.map(m => m.name || m.userId).join(', ') || '[waiting...]'}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>
        <label htmlFor="language-select">Language: </label>
        <select
          id="language-select"
          value={editorLanguage}
          onChange={e => setEditorLanguage(e.target.value)}
          style={{ marginLeft: 8, padding: '6px 12px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: '#fafaff' }}
        >
          {languageOptions.map(lang => (
            <option key={lang.id} value={lang.id}>{lang.name}</option>
          ))}
        </select>
      </div>
      <MonacoEditor
        height="400px"
        language={editorLanguage}
        value={teamCode}
        onChange={handleCodeChange}
        theme="vs-light"
        options={{ fontSize: 15, minimap: { enabled: false } }}
      />
      <div style={{ marginTop: 18, color: '#888', textAlign: 'center' }}>{statusMsg}</div>
    </div>
  );
};

export default TeamCFDuel;
