import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const pages = [
  {
    background: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1500&q=80",
    content: <h1 style={{ color: '#fff', textShadow: '0 2px 8px #000' }}>Welcome to Code Game!</h1>,
  },
  {
    background: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1500&q=80",
    content: <h1 style={{ color: '#fff', textShadow: '0 2px 8px #000' }}>Solve coding challenges and test your skills.</h1>,
  },
  {
    background: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=1500&q=80",
    content: <h1 style={{ color: '#fff', textShadow: '0 2px 8px #000' }}>Ready to start?</h1>,
  },
];

export default function LandingPage() {
  const [page, setPage] = useState(0);
  const navigate = useNavigate();
  const isFirst = page === 0;
  const isLast = page === pages.length - 1;

  return (
    <div style={{
      backgroundImage: `url(${pages[page].background})`,
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
        {pages[page].content}
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
      {/* Start Coding Button */}
      <button
        style={{
          position: "absolute",
          bottom: 60,
          right: 60,
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: "none",
          background: isLast ? "#4caf50" : "rgba(0,0,0,0.7)",
          color: "#fff",
          fontSize: "1.2rem",
          fontWeight: "bold",
          cursor: isLast ? "pointer" : "not-allowed",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          opacity: isLast ? 1 : 0.7,
          transition: "background 0.2s, opacity 0.2s"
        }}
        onClick={() => isLast && navigate("/code")}
        disabled={!isLast}
      >
        Start Coding
      </button>
    </div>
  );
} 