import React from "react";
import { useNavigate } from "react-router-dom";

export default function LandingHome() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, 'sans-serif'"
    }}>
      <header style={{ width: "100%", padding: "2rem 0 1rem 0", textAlign: "center" }}>
        <h1 style={{ color: "#7c3aed", fontSize: "3rem", margin: 0, fontWeight: 800, letterSpacing: 1 }}>Code Stories</h1>
        <p style={{ color: "#444", fontSize: "1.3rem", marginTop: 16, marginBottom: 0 }}>
          Dive into coding adventures with interactive manga and challenges.
        </p>
      </header>
      <main style={{ marginTop: 40, textAlign: "center" }}>
        <button
          style={{
            background: "#7c3aed",
            color: "#fff",
            border: "none",
            borderRadius: 32,
            padding: "1rem 2.5rem",
            fontSize: "1.3rem",
            fontWeight: 700,
            boxShadow: "0 4px 24px rgba(124,58,237,0.15)",
            cursor: "pointer",
            transition: "background 0.2s"
          }}
          onClick={() => navigate("/manga")}
        >
          Start Game
        </button>
      </main>
    </div>
  );
} 