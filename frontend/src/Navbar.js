import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate("/login");
  };

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
    <>
      <style>{`
        @media (max-width: 600px) {
          .navbar-inner {
            flex-direction: column;
            align-items: flex-start !important;
            padding: 0.5rem 1rem !important;
          }
          .navbar-links {
            flex-direction: column;
            gap: 8px !important;
            width: 100%;
            margin-top: 0.5rem;
          }
          .navbar-title {
            font-size: 1.1rem !important;
            padding-bottom: 0.2rem;
          }
        }
      `}</style>
      <nav style={navStyle}>
        <div className="navbar-inner" style={navInner}>
          <Link to="/" className="navbar-title" style={{ color: "#7c3aed", fontWeight: 800, fontSize: "1.5rem", textDecoration: "none" }}>
            Code Stories
          </Link>
          <div className="navbar-links" style={linksContainer}>
            <Link to="/" style={linkStyle("/")}>Home</Link>
            <Link to="/duel" style={linkStyle("/duel")}>Duel</Link>
            <Link to="/duel_cf" style={linkStyle("/duel_cf")}>Duel (CF)</Link>
            <Link to="/team_duel_cf" style={linkStyle("/team_duel_cf")}>Team Duel (2v2)</Link>
            <Link to="/lobby" style={linkStyle("/lobby")}>Lobby</Link>
            {user && <Link to="/profile" style={linkStyle("/profile")}>Profile</Link>}
            {!user && <Link to="/login" style={linkStyle("/login")}>Login</Link>}
            {user && <button onClick={handleLogout} style={{
              background: "none", border: "none", color: "#7c3aed", fontWeight: 600, fontSize: "1.1rem", cursor: "pointer", padding: 0, marginLeft: 8
            }}>Logout</button>}
          </div>
        </div>
      </nav>
    </>
  );
}