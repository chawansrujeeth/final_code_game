import React from "react";
import { useNavigate } from "react-router-dom";

export default function LandingHome() {
  const navigate = useNavigate();

  return (
    <>
      <style>{`
        @media (max-width: 600px) {
          .landing-title {
            font-size: 2rem !important;
          }
          .landing-tagline {
            font-size: 1rem !important;
          }
          .landing-main-btn {
            font-size: 1rem !important;
            padding: 0.7rem 1.5rem !important;
          }
          .landing-header {
            padding: 1.2rem 0 0.5rem 0 !important;
          }
        }
      `}</style>
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, var(--bg) 0%, var(--card) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, 'sans-serif'",
        padding: "0 1rem"
      }}>
        <header className="landing-header" style={{ width: "100%", maxWidth: 900, padding: "2rem 0 1rem 0", textAlign: "center" }}>
          <h1 className="landing-title" style={{ color: "#7c3aed", fontSize: "3rem", margin: 0, fontWeight: 800, letterSpacing: 1 }}>Code Stories</h1>

        </header>
        <main style={{ marginTop: 40, textAlign: "center", display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            className="btn btn-shadow"

            onClick={() => navigate("/lobby")}
          >
            Lobby
          </button>
          <button
            className="btn btn-shadow"

            onClick={() => navigate("/duel_cf")}
          >
            Duel (CF)
          </button>
        </main>
      </div>
    </>
  );
}