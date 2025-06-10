import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const location = useLocation();
  const navStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    background: "#fff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 2rem",
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, 'sans-serif'"
  };
  const linkStyle = (path) => ({
    color: location.pathname === path ? "#7c3aed" : "#333",
    textDecoration: "none",
    fontWeight: 600,
    marginLeft: 32,
    fontSize: "1.1rem",
    borderBottom: location.pathname === path ? "2px solid #7c3aed" : "2px solid transparent",
    paddingBottom: 2
  });
  return (
    <nav style={navStyle}>
      <Link to="/" style={{ color: "#7c3aed", fontWeight: 800, fontSize: "1.5rem", textDecoration: "none" }}>
        Anime Stories
      </Link>
      <div>
        <Link to="/" style={linkStyle("/")}>Home</Link>
        <Link to="/profile" style={linkStyle("/profile")}>Profile</Link>
        <Link to="/login" style={linkStyle("/login")}>Login</Link>
      </div>
    </nav>
  );
} 