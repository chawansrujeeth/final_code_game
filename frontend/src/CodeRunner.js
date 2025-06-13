import React, { useState, useEffect } from "react";
import axios from "axios";
import { supabase } from "./supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";

const languageOptions = [
  { id: 71, name: "Python 3" },
  { id: 63, name: "JavaScript (Node.js)" },
  { id: 54, name: "C++" },
  // Add more languages as needed
];

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5051";

export default function CodeRunner() {
  const [sourceCode, setSourceCode] = useState("");
  const [languageId, setLanguageId] = useState(71);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testcase, setTestcase] = useState(null);
  const [testcaseLoading, setTestcaseLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loginMessage, setLoginMessage] = useState("");

  useEffect(() => {
    async function fetchTestcaseById(id) {
      setTestcaseLoading(true);
      const { data, error } = await supabase
        .from("testcases")
        .select("input, expected_output")
        .eq("id", id)
        .single();
      if (!error && data) {
        setTestcase(data);
      }
      setTestcaseLoading(false);
    }
    // If testcase_id is passed via router state, fetch that testcase
    if (location.state && location.state.testcase_id) {
      fetchTestcaseById(location.state.testcase_id);
    } else if (location.state && location.state.testcase) {
      // fallback for old state passing
      setTestcase(location.state.testcase);
      setTestcaseLoading(false);
    } else {
      // Otherwise, fetch the first testcase from Supabase
      async function fetchFirstTestcase() {
        setTestcaseLoading(true);
        const { data, error } = await supabase
          .from("testcases")
          .select("input, expected_output")
          .limit(1)
          .single();
        if (!error && data) {
          setTestcase(data);
        }
        setTestcaseLoading(false);
      }
      fetchFirstTestcase();
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    async function fetchUser() {
      const { data: userData } = await supabase.auth.getUser();
      setUser(userData.user);
    }
    fetchUser();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginMessage("");
    if (!user) {
      setLoginMessage("You must be logged in to submit code.");
      return;
    }
    setLoading(true);
    setResult(null);
    setAccepted(false);
    try {
      const res = await axios.post(`${API_URL}/run`, {
        source_code: sourceCode,
        language_id: languageId,
        stdin: testcase.input,
        expected_output: testcase.expected_output,
      });
      setResult(res.data);
      // If correct, mark progress
      if (res.data && res.data.status && res.data.status.id === 3 && res.data.stdout && (!res.data.expected_output || res.data.stdout.trim() === res.data.expected_output.trim())) {
        // status.id === 3 means Done, and output matches expected
        const pageIndex = location.state && typeof location.state.page_index === 'number' ? location.state.page_index : 0;
        await supabase.from('progress').upsert({
          user_id: user.id,
          page_index: pageIndex + 1 // unlock the next page
        });
        setAccepted(true);
      }
    } catch (err) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  if (testcaseLoading) {
    return <div style={{ maxWidth: 600, margin: "2rem auto" }}>Loading challenge...</div>;
  }

  // Toggle: Go to Story
  const handleToggleStory = () => {
    const pageIndex = location.state && typeof location.state.page_index === 'number' ? location.state.page_index : 0;
    navigate('/manga', { state: { goToPage: pageIndex } });
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '80vh', padding: '40px 0', background: '#f7f8fa' }}>
      {/* Left: Code Editor and Controls */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', padding: 32, minWidth: 420, maxWidth: 540, marginRight: 32, flex: '1 1 420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 26, color: '#3a3a3a' }}>Submit Your Solution</h2>
          <button onClick={handleToggleStory} style={{ background: '#eee', border: 'none', borderRadius: 6, padding: '6px 16px', fontWeight: 600, cursor: 'pointer', color: '#7c3aed' }}>Go to Story</button>
        </div>
        <form onSubmit={handleSubmit}>
          {loginMessage && (
            <div style={{ color: 'red', marginBottom: 12, fontWeight: 600 }}>{loginMessage}</div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: 15 }}>Language:</label>
            <select
              value={languageId}
              onChange={(e) => setLanguageId(Number(e.target.value))}
              style={{ marginLeft: 12, padding: '6px 12px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: '#fafaff' }}
            >
              {languageOptions.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: 15, display: 'block', marginBottom: 6 }}>Source Code:</label>
            <textarea
              rows={16}
              cols={60}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              required
              style={{ width: '100%', fontSize: 15, fontFamily: 'monospace', borderRadius: 8, border: '1px solid #ccc', padding: 12, resize: 'vertical', minHeight: 220 }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 32px', fontWeight: 700, fontSize: 17, cursor: 'pointer', marginTop: 8 }}>
            {loading ? "Submitting..." : "Submit"}
          </button>
          {accepted && (
            <button
              type="button"
              style={{ marginLeft: 18, background: "#2196f3", color: "#fff", border: "none", borderRadius: 8, padding: "10px 32px", fontWeight: 700, fontSize: 17, cursor: "pointer" }}
              onClick={() => {
                const nextPage = location.state && typeof location.state.page_index === 'number' ? location.state.page_index + 1 : 1;
                setTimeout(() => {
                  navigate('/manga', { state: { goToPage: nextPage } });
                }, 400);
              }}
            >
              Done! Go to Next Story
            </button>
          )}
        </form>
        {result && (
          <div style={{ marginTop: "1.5rem", background: '#f6f6fa', borderRadius: 8, padding: 18, border: '1px solid #e0e0e0' }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Result:</h3>
            <pre style={{ fontSize: 14, margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
      {/* Right: Expected Input/Output */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', padding: 32, minWidth: 320, maxWidth: 400, flex: '1 1 320px' }}>
        <h3 style={{ marginTop: 0, color: '#3a3a3a' }}>Challenge Details</h3>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Expected Input:</div>
          <pre style={{ background: '#f3f3f7', borderRadius: 6, padding: 10, fontSize: 15, minHeight: 40 }}>{testcase.input || 'N/A'}</pre>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Expected Output:</div>
          <pre style={{ background: '#f3f3f7', borderRadius: 6, padding: 10, fontSize: 15, minHeight: 40 }}>{testcase.expected_output || 'N/A'}</pre>
        </div>
      </div>
    </div>
  );
}


