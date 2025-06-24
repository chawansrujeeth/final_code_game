import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import MonacoEditor from "@monaco-editor/react";

const CF_SOCKET_URL = process.env.REACT_APP_CF_SOCKET_URL || "https://final-code-game.onrender.com";
// Backend base URL for API calls
const BACKEND_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5051';

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

const judge0LangMap = {
  python: 71,      // Python 3
  cpp: 54,         // C++ (GCC 9.2.0)
  javascript: 63   // JavaScript (Node.js 12.14.0)
};

const DuelCF = ({ user }) => {
  const [socket, setSocket] = useState(null);
  const [duelInfo, setDuelInfo] = useState(null);
  const [timer, setTimer] = useState(600); // 10 min
  const [error, setError] = useState("");
  const [winner, setWinner] = useState(null);
  const [duelState, setDuelState] = useState("idle"); // idle, waiting, matched, started, ended
  const [opponent, setOpponent] = useState("");
  const opponentRef = useRef("");
  const [statusMsg, setStatusMsg] = useState("");
  const timerRef = useRef();
  const [myCode, setMyCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("python");
  const opponentCodeTimeout = useRef(null);
  const latestOpponentCode = useRef("");

  // React state for submission status and verdict
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verdict, setVerdict] = useState("");

  // Fetch user's Codeforces handle from profile
  const [handle, setHandle] = useState("");
  useEffect(() => {
    async function fetchProfile() {
      try {
        if (!user) return;
        if (user.codeforces_handle) {
          setHandle(user.codeforces_handle);
          return;
        }
        // fallback: fetch from supabase if not in user prop
        const { data, error } = await import("./supabaseClient").then(m => m.supabase)
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

  const updateOpponentCode = useRef(
    debounce((code) => {
      setOpponentCode(code);
    }, 300)
  ).current;

  // Connect to backend and handle matchmaking
  const joinDuel = () => {
    setError("");
    setDuelState("waiting");
    setStatusMsg("Connecting to server...");
    setWinner(null);
    setDuelInfo(null);
    setOpponent("");
    if (!handle) {
      setError("Set your Codeforces handle in your profile first.");
      setDuelState("idle");
      return;
    }
    // Disconnect previous socket if any
    if (socket) {
      socket.disconnect();
    }
    const sock = io(CF_SOCKET_URL);
    setSocket(sock);
    sock.on("connect", () => {
      console.log("[DEBUG] Socket connected!", sock.id);
      setStatusMsg("Connected! Joining matchmaking...");
      sock.emit("join_cf_matchmaking", {
        userId: user?.id || Math.random().toString(36).slice(2),
        handle
      });
    });
    sock.on("cf_waiting", (data) => {
      setStatusMsg(data.msg || "Waiting for opponent...");
      setDuelState("waiting");
    });
    sock.on("cf_duel_start", (data) => {
      console.log('[DEBUG] cf_duel_start received:', data);
      setDuelInfo(data);
      setDuelState("started");
      setStatusMsg("Duel started!");
      setTimer(600 - Math.floor((Date.now() - data.startTime) / 1000));
      setWinner(null);
      // Set opponent
      const opp = data.users.find(h => h !== handle);
      setOpponent(opp || "");
      setMyCode("");
      setOpponentCode("");
      // DEBUG: Log sample test cases if present
      console.log('[DEBUG] duelInfo.problem:', data.problem);
      if (data.problem && data.problem.sample) {
        console.log('[DEBUG] duelInfo.problem.sample:', data.problem.sample);
      }
    });
    sock.on("cf_duel_winner", (data) => {
      setWinner(data.winner);
      setDuelState("ended");
      setStatusMsg(`Winner: ${data.winner}`);
    });
    sock.on("disconnect", () => {
      setStatusMsg("Disconnected from server");
      setDuelState("idle");
      setDuelInfo(null);
      setWinner(null);
      setOpponent("");
    });
    sock.on("connect_error", (err) => {
      setError("Could not connect to duel server: " + err.message);
      setDuelState("idle");
    });
    // Code sync events
    // sock.on("cf_code_receive", ({ code, from }) => {
    //   console.log('[DEBUG] Received cf_code_receive:', { code, from, opponent });
    //   if (from === opponent) {
    //     latestOpponentCode.current = code;
    //     if (opponentCodeTimeout.current) {
    //       clearTimeout(opponentCodeTimeout.current);
    //     }
    //     opponentCodeTimeout.current = setTimeout(() => {
    //       console.log('[DEBUG] Updating opponentCode after delay:', latestOpponentCode.current);
    //       setOpponentCode(latestOpponentCode.current);
    //     }, 10000); // 10 seconds delay
    //   }
    // });
    // Optional: Debounce opponent updates to avoid flooding
    // const updateOpponentCode = useRef(debounce((code) => {
    //   setOpponentCode(code);
    // }, 300)).current;
  };

  const socketRef = useRef(null);
  const duelInfoRef = useRef(null);
  const handleRef = useRef("");

  // Debounced code send (robust version)
  const sendCodeUpdate = useCallback(
    debounce((code) => {
      const socketVal = socketRef.current;
      const duelInfoVal = duelInfoRef.current;
      const handleVal = handleRef.current;
      if (socketVal && duelInfoVal) {
        console.log('[DEBUG] Sending cf_code_update:', { roomId: duelInfoVal.roomId, code, from: handleVal });
        socketVal.emit("cf_code_update", {
          roomId: duelInfoVal.roomId,
          code,
          from: handleVal
        });
      }
    }, 500),
    []
  );

  // Attach cf_code_receive handler to the current socket
  useEffect(() => {
    if (!socket) return;
    const handler = ({ code, from }) => {
      console.log('[DEBUG] Received cf_code_receive:', { code, from, opponent: opponentRef.current });
      if (from === opponentRef.current) {
        updateOpponentCode(code);
      }
    };
    socket.on("cf_code_receive", handler);
    return () => {
      socket.off("cf_code_receive", handler);
    };
  }, [socket, updateOpponentCode]);

  // Timer countdown
  useEffect(() => {
    if (duelState !== "started") return;
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
  }, [duelState]);

  // Play again handler
  const resetDuel = () => {
    if (socket) socket.disconnect();
    setDuelState("idle");
    setDuelInfo(null);
    setWinner(null);
    setOpponent("");
    setStatusMsg("");
    setTimer(600);
  };

  // Fetch sample test cases from frontend API route (legacy, not backend)
  async function fetchCFSamples(contestId, index) {
    try {
      const res = await fetch(`/api/cf-samples?contestId=${contestId}&index=${index}`);
      const data = await res.json();
      console.log('[DEBUG] fetchCFSamples:', { contestId, index, data }); // DEBUG
      if (data.samples) return data.samples;
      setError("Failed to fetch test cases: " + (data.error || 'Unknown error'));
      return [];
    } catch (err) {
      setError("Failed to fetch test cases: " + err.message);
      console.log('[DEBUG] fetchCFSamples error:', err); // DEBUG
      return [];
    }
  }

  // Submit code to Judge0 and check verdict, then check Codeforces submission
  async function handleSubmit() {
    setIsSubmitting(true);
    setVerdict("");
    setError("");
    if (!duelInfo || !duelInfo.problem) {
      setError("No problem info available.");
      setIsSubmitting(false);
      return;
    }
    const { contestId, index } = duelInfo.problem;
    const samples = await fetchCFSamples(contestId, index);
    if (!samples.length) {
      setError("No sample test cases found.");
      setIsSubmitting(false);
      return;
    }
    let allPassed = true;
    for (let i = 0; i < samples.length; ++i) {
      const sample = samples[i];
      // Prepare Judge0 submission
      const resp = await fetch("https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_code: myCode,
          language_id: judge0LangMap[editorLanguage],
          stdin: sample.input
        })
      });
      const result = await resp.json();
      let output = result.stdout || "";
      output = output.replace(/\r/g, '').trim();
      const expected = (sample.output || "").replace(/\r/g, '').trim();
      if (output !== expected) {
        setVerdict(`Wrong Answer on sample ${i + 1}`);
        allPassed = false;
        setIsSubmitting(false);
        return;
      }
    }
    // If all Judge0 samples passed, check Codeforces submission
    // Fetch latest submissions for this handle and problem
    try {
      const cfResp = await fetch(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=20`);
      const cfData = await cfResp.json();
      if (cfData.status !== "OK") throw new Error("CF API error");
      // Find a submission for this contestId and index with verdict OK
      const found = cfData.result.find(sub =>
        sub.problem &&
        sub.problem.contestId == contestId &&
        sub.problem.index == index &&
        sub.verdict === "OK"
      );
      if (found) {
        setVerdict("Accepted on all samples and Codeforces! You are the winner!");
        // Optionally, emit winner to server
        if (socket && duelInfo && handle) {
          socket.emit("cf_duel_winner", { roomId: duelInfo.roomId, winner: handle });
        }
      } else {
        setVerdict("Passed all samples, but no Accepted submission found on Codeforces. Submit your solution on Codeforces!");
      }
    } catch (err) {
      setError("Failed to check Codeforces submission: " + (err.message || err));
    }
    setIsSubmitting(false);
  }

  // On my code change, send to server
  useEffect(() => {
    console.log('[DEBUG] myCode changed:', myCode, 'duelState:', duelState, 'duelInfo:', duelInfo);
    if (duelState === "started" && duelInfo) {
      sendCodeUpdate(myCode);
    }
    // eslint-disable-next-line
  }, [myCode, duelState, duelInfo, sendCodeUpdate]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (opponentCodeTimeout.current) {
        clearTimeout(opponentCodeTimeout.current);
      }
    };
  }, []);

  // Update opponent ref when opponent state changes
  useEffect(() => {
    opponentRef.current = opponent;
  }, [opponent]);

  // Clean up socket on unmount or when a new socket is created
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { duelInfoRef.current = duelInfo; }, [duelInfo]);
  useEffect(() => { handleRef.current = handle; }, [handle]);

  // Fetch random Codeforces problem and sample from backend
  const [cfSample, setCfSample] = useState(null);
  const [cfSampleLoading, setCfSampleLoading] = useState(false);
  const fetchRandomCFSample = async () => {
    setCfSampleLoading(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/cf-random-sample`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCfSample(data);
    } catch (err) {
      setError("Failed to fetch random CF sample: " + (err.message || err));
    }
    setCfSampleLoading(false);
  };

  // UI for each state
  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>⚡ Codeforces Duel</h2>
      <div style={{ marginBottom: 18, textAlign: 'center', fontSize: 18 }}>
        <b>Your Handle:</b> <span style={{ color: '#2196f3', fontWeight: 600 }}>{handle || '[not set]'}</span>
      </div>
      {error && <div style={{ color: '#e53935', marginBottom: 18, textAlign: 'center', fontSize: 17 }}>{error}</div>}
      {/* Idle state: show join button */}
      {duelState === "idle" && !error && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={joinDuel}
            disabled={!handle}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 40px', fontWeight: 700, fontSize: 22, cursor: handle ? 'pointer' : 'not-allowed', boxShadow: '0 2px 12px rgba(124,58,237,0.08)' }}
          >
            Join Duel
          </button>
          {!handle && <div style={{ color: '#e53935', marginTop: 16, fontSize: 16 }}>Set your Codeforces handle in your profile first.</div>}
          <div style={{ marginTop: 32 }}>
            <button
              onClick={fetchRandomCFSample}
              disabled={cfSampleLoading}
              style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 32px', fontWeight: 700, fontSize: 18, cursor: cfSampleLoading ? 'not-allowed' : 'pointer', marginBottom: 12 }}
            >
              {cfSampleLoading ? 'Loading...' : 'Get Random CF Problem & Sample'}
            </button>
            {cfSample && (
              <div style={{ marginTop: 18, background: '#f7f8fa', borderRadius: 10, padding: 18, boxShadow: '0 2px 12px rgba(33,150,243,0.06)' }}>
                <a href={cfSample.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2196f3', fontWeight: 700, fontSize: 18, textDecoration: 'none' }}>{cfSample.url}</a>
                <div style={{ marginTop: 10 }}>
                  <b>Sample Input:</b>
                  <pre style={{ background: '#eee', borderRadius: 6, padding: 8, fontSize: 15 }}>{cfSample.sample.input || '[none found]'}</pre>
                </div>
                <div style={{ marginTop: 10 }}>
                  <b>Sample Output:</b>
                  <pre style={{ background: '#eee', borderRadius: 6, padding: 8, fontSize: 15 }}>{cfSample.sample.output || '[none found]'}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Waiting for opponent */}
      {duelState === "waiting" && (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="spinner" style={{ margin: '0 auto 18px', width: 48, height: 48, border: '6px solid #eee', borderTop: '6px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 20, color: '#7c3aed', fontWeight: 600, marginBottom: 8 }}>{statusMsg || 'Waiting for opponent...'}</div>
          <div style={{ color: '#888', fontSize: 16 }}>Share this page with a friend or wait to be matched.</div>
        </div>
      )}
      {/* Matched/Ready (show both handles, prepping to start) */}
      {duelState === "started" && duelInfo && !winner && (
        <>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 36, minHeight: 220, textAlign: 'center', position: 'relative', transition: 'all 0.3s', marginBottom: 32 }}>
            <div style={{ marginBottom: 18, fontSize: 18, fontWeight: 600, color: '#7c3aed' }}>
              Opponent: <span style={{ color: '#e53935', fontWeight: 700 }}>{opponent}</span>
            </div>
            <div style={{ marginBottom: 18, fontSize: 18 }}>
              <b>Players:</b> <span style={{ color: '#2196f3', fontWeight: 700 }}>{handle}</span> <span style={{ color: '#aaa', fontWeight: 400 }}>vs</span> <span style={{ color: '#e53935', fontWeight: 700 }}>{opponent}</span>
            </div>
            <div style={{ marginBottom: 18, fontSize: 18 }}>
              <b>Problem:</b> <a
                href={`https://codeforces.com/contest/${duelInfo.problem.contestId}/problem/${duelInfo.problem.index}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#2196f3', fontWeight: 700, fontSize: 22, textDecoration: 'none', letterSpacing: 1 }}
              >
                {duelInfo.problem.contestId}{duelInfo.problem.index} - {duelInfo.problem.name}
              </a>
            </div>
            {/* Show sample input/output for the duel problem */}
            {/* Always show sample input/output boxes, even if missing */}
            <div style={{ margin: '18px 0', background: '#f7f8fa', borderRadius: 10, padding: 18, boxShadow: '0 2px 12px rgba(33,150,243,0.06)' }}>
              <div>
                <b>Sample Input:</b>
                {console.log('[DEBUG] Rendering sample input:', duelInfo?.problem?.sample)} {/* DEBUG */}
                <pre style={{ background: '#eee', borderRadius: 6, padding: 8, fontSize: 15 }}>{duelInfo.problem?.sample?.input || '[none found]'}</pre>
              </div>
              <div style={{ marginTop: 10 }}>
                <b>Sample Output:</b>
                <pre style={{ background: '#eee', borderRadius: 6, padding: 8, fontSize: 15 }}>{duelInfo.problem?.sample?.output || '[none found]'}</pre>
              </div>
            </div>
            <div style={{ fontSize: 22, marginBottom: 12, color: timer <= 30 ? '#e53935' : '#333', fontWeight: 700, letterSpacing: 1 }}>
              ⏰ Time Left: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(timer / 60).toString().padStart(2, '0')}:{(timer % 60).toString().padStart(2, '0')}</span>
            </div>
            <div style={{ fontSize: 15, color: '#e53935', marginBottom: 10 }}>
              Note: Refreshing the page will remove you from the duel and count as a forfeit.
            </div>
            <div style={{ fontSize: 17, marginBottom: 18, color: '#555' }}>
              Duel started! Solve the problem on Codeforces.<br />
              <span style={{ color: '#888', fontSize: 15 }}>(First to solve wins. Winner display coming soon!)</span>
            </div>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
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
          </div>
          {/* Code Editor Section */}
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'flex-start', marginBottom: 32 }}>
            {/* Your Editor */}
            <div style={{ flex: 1, background: '#f7f8fa', borderRadius: 12, boxShadow: '0 2px 12px rgba(124,58,237,0.06)', padding: 18, minWidth: 320 }}>
              <div style={{ fontWeight: 700, color: '#2196f3', marginBottom: 8, fontSize: 17 }}>Your Code</div>
              <MonacoEditor
                height="350px"
                language={editorLanguage}
                value={myCode}
                onChange={value => {
                  console.log('[DEBUG] MonacoEditor onChange:', value);
                  setMyCode(value || "");
                }}
                theme="vs-light"
                options={{ fontSize: 15, minimap: { enabled: false } }}
              />
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{ marginTop: 16, background: '#43a047', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontWeight: 700, fontSize: 18, cursor: isSubmitting ? 'not-allowed' : 'pointer', boxShadow: '0 2px 12px rgba(67,160,71,0.08)' }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
              {verdict && <div style={{ marginTop: 14, fontSize: 17, fontWeight: 600, color: verdict.startsWith('Accepted') ? '#43a047' : '#e53935' }}>{verdict}</div>}
            </div>
            {/* Opponent's Editor */}
            <div style={{ flex: 1, background: '#f7f8fa', borderRadius: 12, boxShadow: '0 2px 12px rgba(237,58,58,0.06)', padding: 18, minWidth: 320 }}>
              <div style={{ fontWeight: 700, color: '#e53935', marginBottom: 8, fontSize: 17 }}>{opponent}'s Code</div>
              <MonacoEditor
                height="350px"
                language={editorLanguage}
                value={opponentCode}
                options={{ readOnly: true, fontSize: 15, minimap: { enabled: false } }}
                theme="vs-light"
              />
            </div>
          </div>
        </>
      )}
      {/* Duel ended, show winner and play again */}
      {duelState === "ended" && duelInfo && (
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 36, minHeight: 220, textAlign: 'center', position: 'relative', transition: 'all 0.3s' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: winner === handle ? '#43a047' : '#e53935', marginBottom: 16 }}>
            {winner === handle ? '🎉 You won!' : `🏆 Winner: ${winner}`}
          </div>
          <div style={{ marginBottom: 18, fontSize: 18 }}>
            <b>Players:</b> <span style={{ color: '#2196f3', fontWeight: 700 }}>{handle}</span> <span style={{ color: '#aaa', fontWeight: 400 }}>vs</span> <span style={{ color: '#e53935', fontWeight: 700 }}>{opponent}</span>
          </div>
          <div style={{ marginBottom: 18 }}>
            <a
              href={`https://codeforces.com/contest/${duelInfo.problem.contestId}/problem/${duelInfo.problem.index}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2196f3', fontWeight: 700, fontSize: 22, textDecoration: 'none', letterSpacing: 1 }}
            >
              {duelInfo.problem.contestId}{duelInfo.problem.index} - {duelInfo.problem.name}
            </a>
          </div>
          <div style={{ marginTop: 18, fontSize: 19, color: '#333', fontWeight: 600 }}>
            Duel ended! {winner} won the duel.
          </div>
          <button
            onClick={resetDuel}
            style={{ marginTop: 28, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 32px', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 2px 12px rgba(124,58,237,0.08)' }}
          >
            Play Again
          </button>
        </div>
      )}
      {/* Add spinner animation keyframes */}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default DuelCF;