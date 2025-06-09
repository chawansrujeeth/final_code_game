import React, { useState } from "react";
import axios from "axios";

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
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post(`${API_URL}/run`, {
        source_code: sourceCode,
        language_id: languageId,
        stdin,
      });
      setResult(res.data);
    } catch (err) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

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
        <label>
          Input (stdin):
          <br />
          <textarea
            rows={2}
            cols={60}
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
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


