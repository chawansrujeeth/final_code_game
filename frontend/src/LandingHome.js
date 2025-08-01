import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

export default function LandingHome() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/login');
  };
  const [user, setUser] = useState(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) navigate('/login');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) navigate('/login');
    });
    // fetch profile row to check if registered
    if (user) {
      supabase.from('profiles').select('name, codeforces_handle').eq('user_id', user.id).single()
        .then(({ data, error }) => {
          if (error) return;
          const missing = !(data && data.name && data.name.trim() && data.codeforces_handle && data.codeforces_handle.trim());
          setNeedsProfile(missing);
        });
    }
    return () => listener.subscription.unsubscribe();
  }, []);

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
            className="btn btn-shadow btn-rect" style={{minWidth:120}}

            onClick={() => navigate("/lobby")}
          >
            Lobby
          </button>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120}}

            onClick={() => navigate("/duel_cf")}
          >
            Duel (CF)
          </button>
          <button
            className="btn btn-shadow btn-rect" style={{minWidth:120}}
            onClick={() => navigate("/testing")}
          >
            Testing
          </button>
          {user && (
            <button
              className={needsProfile ? 'btn btn-attn btn-rect' : 'btn btn-shadow btn-rect'}
              style={needsProfile ? {} : {minWidth:120}}
              onClick={() => navigate('/profile')}
            >
              Profile
            </button>
          )}
        </main>
        {user && (
          <button
            className="btn btn-shadow btn-rect"
            style={{position:'fixed', bottom:24, right:24, zIndex:101, padding:'0.6rem 1.4rem', fontSize:'0.9rem'}}
            onClick={handleLogout}
          >
            Logout
          </button>
        )}
      </div>
    </>
  );
}