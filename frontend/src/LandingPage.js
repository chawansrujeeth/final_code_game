import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const backgrounds = [
  "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1500&q=80",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1500&q=80",
  "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=1500&q=80"
];

export default function LandingPage() {
  const [page, setPage] = useState(0);
  const [testcases, setTestcases] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const isFirst = page === 0;
  const isLast = page === testcases.length - 1;

  useEffect(() => {
    async function fetchTestcases() {
      setLoading(true);
      const { data, error } = await supabase
        .from("testcases")
        .select("input, expected_output")
        .order("id", { ascending: true });
      if (!error && data) {
        setTestcases(data);
      }
      setLoading(false);
    }
    fetchTestcases();
  }, []);

  if (loading) {
    return <div style={{ maxWidth: 600, margin: "2rem auto" }}>Loading test cases...</div>;
  }

  // Fallback for backgrounds if there are more testcases than backgrounds
  const bg = backgrounds[page % backgrounds.length];

  return (
    <div style={{
      backgroundImage: `url(${bg})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      width: "100vw",
      height: "100vh",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{ position: "absolute", top: 80, width: "100%", textAlign: "center" }}>
        <h1 style={{ color: '#fff', textShadow: '0 2px 8px #000' }}>Test Case {page + 1}</h1>
        <pre style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', padding: 16, borderRadius: 8, display: 'inline-block' }}>
Input:
{testcases[page].input}

Expected Output:
{testcases[page].expected_output}
        </pre>
      </div>
      {/* Left Arrow */}
      {!isFirst && (
        <button
          style={{
            position: "absolute",
            bottom: 60,
            left: 60,
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 32,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
          }}
          onClick={() => setPage(page - 1)}
        >
          &#8592;
        </button>
      )}
      {/* Right Arrow */}
      {!isLast && (
        <button
          style={{
            position: "absolute",
            bottom: 60,
            right: 140,
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 32,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
          }}
          onClick={() => setPage(page + 1)}
        >
          &#8594;
        </button>
      )}
      {/* Start Coding Button (always enabled) */}
      <button
        style={{
          position: "absolute",
          bottom: 60,
          right: 60,
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: "none",
          background: "#4caf50",
          color: "#fff",
          fontSize: "1.2rem",
          fontWeight: "bold",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          transition: "background 0.2s, opacity 0.2s"
        }}
        onClick={() => navigate("/code", { state: { testcase: testcases[page] } })}
      >
        Start Coding
      </button>
    </div>
  );
} 