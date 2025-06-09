import React from "react";
import { useNavigate } from "react-router-dom";

const backgroundUrl = "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1500&q=80"; // Random nice background

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <div style={{
      backgroundImage: `url(${backgroundUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      width: "100vw",
      height: "100vh",
      position: "relative"
    }}>
      <button
        style={{
          position: "absolute",
          left: 40,
          top: "50%",
          transform: "translateY(-50%)",
          padding: "1rem 2rem",
          fontSize: "1.5rem",
          borderRadius: "8px",
          border: "none",
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
        }}
        onClick={() => navigate("/code")}
      >
        Start Coding
      </button>
    </div>
  );
} 