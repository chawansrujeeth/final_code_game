import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import MonacoEditor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { supabase } from "./supabaseClient";

// Update to new backend URL
const CF_SOCKET_URL = "https://final-code-game-team.onrender.com";

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

const TeamCFDuel = ({ user }) => {
  const [socket, setSocket] = useState(null);
  const [teamCode, setTeamCode] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("python");
  const [statusMsg, setStatusMsg] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [opponents, setOpponents] = useState([]);
  const [lobby, setLobby] = useState([]);
  const [selectedTeammates, setSelectedTeammates] = useState([]);
  const [inLobby, setInLobby] = useState(true);
  const teamCodeRef = useRef("");
  const channelRef = useRef(null);
  const editorRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const providerRef = useRef(null);
  const [collabReady, setCollabReady] = useState(false);

  // Connect to socket and handle lobby/team events
  useEffect(() => {
    const sock = io(CF_SOCKET_URL);
    setSocket(sock);
    sock.on("connect", () => {
      setStatusMsg("Connected! Joining lobby...");
      sock.emit("join_lobby", { userId: user?.id || Math.random().toString(36).slice(2), name: user?.name || user?.email });
      sock.emit("get_lobby");
      // Try to reconnect to a team if possible
      sock.emit("reconnect_user", { userId: user?.id });
    });
    // Legacy socket lobby update (kept as fallback)
    // sock.on("lobby_update", (lobbyList) => {
    //   setLobby(lobbyList);
    // });
    sock.on("team_assignment", ({ roomId, teamId, teamMembers, opponents }) => {
      setRoomId(roomId);
      setTeamId(teamId);
      setTeamMembers(teamMembers);
      setOpponents(opponents);
      setInLobby(false);
      setStatusMsg("Team assigned! Waiting for all players...");
    });
    sock.on("team_code_update", ({ code }) => {
      setTeamCode(code);
      teamCodeRef.current = code;
    });
    // Setup Supabase presence for lobby users
    if (user?.id && !channelRef.current) {
      const ch = supabase.channel('lobby', {
        config: {
          presence: {
            key: user.id,
          },
        },
      });
      channelRef.current = ch;
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const people = Object.values(state).map(arr => arr[0]);
        setLobby(people);
      });
      ch.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ userId: user.id, name: user.name || user.email });
        }
      });
    }

    return () => {
      sock.disconnect();
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [user]);

  // Setup Yjs provider when room & team IDs are ready
  useEffect(() => {
    if (!roomId || !teamId) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    // Determine Yjs websocket URL (use env or fallback to same host without explicit port)
    const providerUrl = process.env.REACT_APP_YJS_URL || "wss://final-code-game-cobcode.onrender.com";
    const docName = `teamduel_${roomId}_${teamId}`;
    const provider = new WebsocketProvider(providerUrl, docName, ydoc);
    providerRef.current = provider;
    const ytext = ydoc.getText("monaco");
    ytextRef.current = ytext;
    setCollabReady(true);
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId, teamId]);

  // Bind Monaco <-> Yjs
  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
    if (!ytextRef.current) return;
    editor.setValue(ytextRef.current.toString());
    const updateMonaco = () => {
      if (editor.getValue() !== ytextRef.current.toString()) {
        const pos = editor.getPosition();
        editor.setValue(ytextRef.current.toString());
        if (pos) editor.setPosition(pos);
      }
    };
    ytextRef.current.observe(updateMonaco);
    editor.onDidChangeModelContent(() => {
      if (editor.getValue() !== ytextRef.current.toString()) {
        ytextRef.current.delete(0, ytextRef.current.length);
        ytextRef.current.insert(0, editor.getValue());
      }
    });
  }

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

  // Select/deselect teammates
  const toggleTeammate = (userId) => {
    setSelectedTeammates((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Create team (2v2: self + 1 teammate, 2 opponents)
  const handleCreateTeam = () => {
    if (!user?.id || selectedTeammates.length !== 1) return;
    // Pick 2 random opponents from lobby not in selectedTeammates or self
    const others = lobby.filter(p => p.userId !== user.id && !selectedTeammates.includes(p.userId));
    if (others.length < 2) {
      setStatusMsg("Not enough opponents in lobby.");
      return;
    }
    const shuffled = others.sort(() => Math.random() - 0.5);
    const teamA = [ { userId: user.id, name: user.name || user.email },
                    ...lobby.filter(p => selectedTeammates.includes(p.userId)) ];
    const teamB = shuffled.slice(0, 2);
    socket.emit("create_team_duel", { teamA, teamB });
    setStatusMsg("Team created! Assigning teams...");
  };

  if (inLobby) {
    return (
      <div style={{ padding: 32, maxWidth: 700, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
        <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>⚡ Team Duel Lobby</h2>
        <div style={{ marginBottom: 18, textAlign: 'center', fontSize: 18 }}>
          <b>Lobby Users:</b> {lobby.length}
        </div>
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: 18 }}>
          {lobby.map(p => (
            <li key={p.userId} style={{ margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={selectedTeammates.includes(p.userId)}
                disabled={p.userId === user?.id}
                onChange={() => toggleTeammate(p.userId)}
                style={{ marginRight: 8 }}
              />
              <span style={{ fontWeight: p.userId === user?.id ? 700 : 400 }}>
                {p.name || p.userId} {p.userId === user?.id ? '(You)' : ''}
              </span>
            </li>
          ))}
        </ul>
        <button
          onClick={handleCreateTeam}
          disabled={selectedTeammates.length !== 1}
          style={{ padding: '10px 24px', fontSize: 16, borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', marginBottom: 12 }}
        >
          Start 2v2 Duel
        </button>
        <div style={{ color: '#888', textAlign: 'center', marginTop: 10 }}>{statusMsg}</div>
      </div>
    );
  }

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
      {collabReady ? (
        <MonacoEditor
          height="400px"
          defaultLanguage={editorLanguage}
          theme="vs-light"
          options={{ fontSize: 15, minimap: { enabled: false } }}
          onMount={handleEditorDidMount}
        />
      ) : (
        <div>Loading collaborative editor...</div>
      )}
      <div style={{ marginTop: 18, color: '#888', textAlign: 'center' }}>{statusMsg}</div>
    </div>
  );
};

export default TeamCFDuel;
