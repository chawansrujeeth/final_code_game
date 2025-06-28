import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import MonacoEditor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import randomColor from "randomcolor";
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
  // List of accepted friends (objects: { userId, name })
  const [friends, setFriends] = useState([]);
  const [selectedTeammates, setSelectedTeammates] = useState([]);
  const [inLobby, setInLobby] = useState(true);
  const teamCodeRef = useRef("");
  const channelRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const providerRef = useRef(null);
  const [collabReady, setCollabReady] = useState(false);

  // ---- Friends helpers ----
  const fetchFriends = useCallback(async () => {
    if (!user?.id) return;
    const { data: rows, error } = await supabase
      .from('friends')
      .select('user_id,friend_id,status')
      .eq('status', 'accepted')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    if (error) {
      console.error('Error fetching friends', error);
      return;
    }
    const ids = rows.map(r => (r.user_id === user.id ? r.friend_id : r.user_id));
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id,name')
        .in('user_id', ids);
      const frs = ids.map(id => ({
        userId: id,
        name: profs?.find(p => p.user_id === id)?.name || id,
      }));
      setFriends(frs);
    } else {
      setFriends([]);
    }
  }, [user]);

  // Fetch friends once on mount / when user changes
  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

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
    console.log("[Yjs] connecting", providerUrl + "/" + docName);
    const provider = new WebsocketProvider(providerUrl, docName, ydoc);
    provider.on('status', event => {
      console.log('[Yjs] connection status', event.status);
    });
    providerRef.current = provider;
    const ytext = ydoc.getText("monaco");
    ytextRef.current = ytext;
    // Set local awareness state for colored cursors
    const color = randomColor({ luminosity: "bright", seed: user?.id || Math.random() });
    provider.awareness.setLocalStateField("user", {
      name: user?.username || user?.email || "anon",
      color,
    });
    // inject local CSS for this client color
    const styleId = `y-style-${provider.doc.clientID}`;
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        .yRemoteSelection-${provider.doc.clientID} { background-color: ${color}55; }
        .yRemoteSelectionHead-${provider.doc.clientID} { border-left: 2px solid ${color}; }
      `;
      document.head.appendChild(style);
    }
    // share initial language
    provider.awareness.setLocalStateField("lang", editorLanguage);
    setCollabReady(true);
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId, teamId]);

  // Listen for language changes from others
  useEffect(() => {
    if (!providerRef.current) return;
    const awareness = providerRef.current.awareness;
    const addCssForClient = (clientId, clr) => {
      const id = `y-style-${clientId}`;
      if (!document.getElementById(id)) {
        const st = document.createElement('style');
        st.id = id;
        st.innerHTML = `
          .yRemoteSelection-${clientId} { background-color: ${clr}55; }
          .yRemoteSelectionHead-${clientId} { border-left: 2px solid ${clr}; }
        `;
        document.head.appendChild(st);
      }
    };
    const handler = () => {
      awareness.getStates().forEach((st, id) => {
      if (st.user && st.user.color) addCssForClient(id, st.user.color);
      if (st.lang && st.lang !== editorLanguage) {
        setEditorLanguage(st.lang);
        if (monacoRef.current && editorRef.current) {
          monacoRef.current.editor.setModelLanguage(editorRef.current.getModel(), st.lang);
        }
      }
    });
    };
    awareness.on('change', handler);
    return () => awareness.off('change', handler);
  }, [editorLanguage]);

  // Bind Monaco <-> Yjs using y-monaco (handles cursors & incremental updates)
  function handleEditorDidMount(editor, monaco) {
    monacoRef.current = monaco;
    editorRef.current = editor;
    if (!ytextRef.current || !providerRef.current) return;
    bindingRef.current = new MonacoBinding(
      ytextRef.current,
      editor.getModel(),
      new Set([editor]),
      providerRef.current.awareness
    );
  }

  // sendCodeUpdate & handleCodeChange removed – Yjs now manages code sync

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
        {
          // Compute online friends (accepted & currently in lobby)
        }
        {(() => {
          const onlineFriends = friends.filter(f => lobby.some(p => p.userId === f.userId));
          return (
            <>
              <div style={{ marginBottom: 18, textAlign: 'center', fontSize: 18 }}>
                <b>Online Friends:</b> {onlineFriends.length} / {friends.length}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: 18 }}>
                {onlineFriends.map(fr => (
                  <li key={fr.userId} style={{ margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedTeammates.includes(fr.userId)}
                      disabled={fr.userId === user?.id}
                      onChange={() => toggleTeammate(fr.userId)}
                      style={{ marginRight: 8 }}
                    />
                    <span style={{ fontWeight: fr.userId === user?.id ? 700 : 400 }}>
                      {fr.name || fr.userId} {fr.userId === user?.id ? '(You)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
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
          onChange={e => {
            const newLang = e.target.value;
            setEditorLanguage(newLang);
            // update monaco model language locally
            if (monacoRef.current && editorRef.current) {
              monacoRef.current.editor.setModelLanguage(editorRef.current.getModel(), newLang);
            }
            // broadcast language change
            if (providerRef.current) {
              providerRef.current.awareness.setLocalStateField("lang", newLang);
            }
          }}
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
