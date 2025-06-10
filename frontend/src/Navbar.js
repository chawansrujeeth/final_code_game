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
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, 'sans-serif'",
  };
  const navInner = {
    maxWidth: 1100,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 2rem",
  };
  const linksContainer = {
    display: "flex",
    gap: 18,
    alignItems: "center",
    flexWrap: "wrap"
  };
  const linkStyle = (path) => ({
    color: location.pathname === path ? "#7c3aed" : "#333",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "1.1rem",
    borderBottom: location.pathname === path ? "2px solid #7c3aed" : "2px solid transparent",
    paddingBottom: 2,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 6,
    transition: "background 0.2s"
  });
  return (
    <nav style={navStyle}>
      <div style={navInner}>
        <Link to="/" style={{ color: "#7c3aed", fontWeight: 800, fontSize: "1.5rem", textDecoration: "none" }}>
          Code Stories
        </Link>
        <div style={linksContainer}>
          <Link to="/" style={linkStyle("/")}>Home</Link>
          <Link to="/profile" style={linkStyle("/profile")}>Profile</Link>
          <Link to="/login" style={linkStyle("/login")}>Login</Link>
        </div>
      </div>
    </nav>
  );
} 