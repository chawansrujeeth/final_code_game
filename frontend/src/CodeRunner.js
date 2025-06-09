import React, { useState, useEffect } from "react";
import axios from "axios";
import { supabase } from "./supabaseClient";
import { useLocation } from "react-router-dom";

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
  const location = useLocation();

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post(`${API_URL}/run`, {
        source_code: sourceCode,
        language_id: languageId,
        stdin: testcase.input,
        expected_output: testcase.expected_output,
      });
      setResult(res.data);
    } catch (err) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  if (testcaseLoading) {
    return <div style={{ maxWidth: 600, margin: "2rem auto" }}>Loading test case...</div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto" }}>
      <h2>Online Code Runner</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Language:
          <select
            value={languageId}
            onChange={(e) => setLanguageId(Number(e.target.value))}
          >
            {languageOptions.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
        </label>
        <br />
        <label>
          Source Code:
          <br />
          <textarea
            rows={10}
            cols={60}
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
            required
          />
        </label>
        <br />
        <button type="submit" disabled={loading}>
          {loading ? "Running..." : "Run Code"}
        </button>
      </form>
      {result && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Result:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}


