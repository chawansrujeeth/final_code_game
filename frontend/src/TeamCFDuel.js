import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from 'react-router-dom';
import { socket, safeJoinLobby, queueMatch } from "./socket";
import useDarkMode from "./useDarkMode";
import MonacoEditor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import randomColor from "randomcolor";
import VoiceChat from "./VoiceChat";
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
  const [isDark, toggleDark] = useDarkMode();
  
  const [teamCode, setTeamCode] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("python");
  const [statusMsg, setStatusMsg] = useState("Initializing...");
  const initialStoredRoom = localStorage.getItem('roomId');
  const [roomId, setRoomId] = useState(initialStoredRoom || null);
  const roomIdRef = useRef(null);
  const [teamId, setTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [opponents, setOpponents] = useState([]);
  const teamCodeRef = useRef("");
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const providerRef = useRef(null);
  const [collabReady, setCollabReady] = useState(false);

  // Set roomId early if available
  useEffect(() => {
    if (initialStoredRoom && !roomIdRef.current) {
      roomIdRef.current = initialStoredRoom;
      setRoomId(initialStoredRoom);
    }
  }, [initialStoredRoom]);
  
  // Connect to socket and handle team events
  useEffect(() => {
    const sock = socket;
    
    sock.on("connect", () => {
      setStatusMsg("Connected! Checking for room assignment...");
      sock.emit("reconnect_user", { userId: user?.id });
    });

    const enrichNames = async (arr) => {
      const missingIds = arr
        .filter(p => !p.name || p.name === 'Player')
        .map(p => p.userId);
      if (missingIds.length) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id,name')
          .in('user_id', missingIds);
        if (data) {
          return arr.map(p => {
            const match = data.find(d => d.user_id === p.userId);
            return match ? { ...p, name: match.name } : p;
          });
        }
      }
      return arr;
    };

    sock.on("team_assignment", async ({ roomId, teamId, teamMembers, opponents }) => {
      console.log('[TeamCFDuel] Received team_assignment:', { roomId, teamId, teamMembers, opponents });
      setCollabReady(false); // reset before new provider
      const fullTeam = await enrichNames(teamMembers);
      const fullOpp = await enrichNames(opponents);
      setRoomId(roomId);
      roomIdRef.current = roomId;
      setTeamId(teamId);
      setTeamMembers(fullTeam);
      setOpponents(fullOpp);
      setStatusMsg("Team assigned! Loading collaborative editor...");
      // Store room info in localStorage for persistence
      localStorage.setItem('roomId', roomId);
      console.log('[TeamCFDuel] State updated:', { roomId, teamId, teamMembers: fullTeam, opponents: fullOpp });
    });

    sock.on("team_code_update", ({ code }) => {
      setTeamCode(code);
      teamCodeRef.current = code;
    });

    return () => {
      // Don't disconnect socket as it's shared
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
      // forward to status message if wanted
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
      setCollabReady(false);
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

  // If no room or team assigned yet, show waiting message
  if (!roomId || !teamId) {
    return (
      <div style={{ padding: 32, maxWidth: 700, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif', textAlign: 'center' }}>
        <h2 style={{ color: '#7c3aed', marginBottom: 16 }}>⚡ Team Duel</h2>
        <div style={{ color: '#888', fontSize: 18 }}>{statusMsg}</div>
        <div style={{ marginTop: 16, color: '#666' }}>
          Waiting for room assignment...
        </div>
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
      <VoiceChat socket={socket} roomKey={`${roomId}_${teamId}`} userId={user?.id} teammates={teamMembers} />
    </div>
  );
};

export default TeamCFDuel;
