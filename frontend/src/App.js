import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import CodeRunner from "./CodeRunner";
import MangaReader from "./MangaReader";
import LandingHome from "./LandingHome";
import Navbar from "./Navbar";
import Profile from "./Profile";
import Footer from "./Footer";
import Auth from "./Auth";
import AuthCallback from "./AuthCallback";
import { supabase } from "./supabaseClient";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Duel from "./Duel";
import DuelCF from "./DuelCF";
import TeamCFDuel from "./TeamCFDuel";
import GameLobby from "./GameLobby";
import PlayerProfile from "./PlayerProfile";

function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate("/login");
      else setUser(data.user);
    });
  }, [navigate]);
  if (!user) return null;
  return children;
}

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchUserAndProfile(userObj) {
      if (userObj) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, codeforces_handle")
          .eq("user_id", userObj.id)
          .maybeSingle();
        if (mounted) setUser({ ...userObj, name: profile?.name || userObj.email, codeforces_handle: profile?.codeforces_handle });
      } else {
        if (mounted) setUser(false);
      }
    }

    // Initial check
    supabase.auth.getUser().then(({ data }) => {
      fetchUserAndProfile(data.user);
    });

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchUserAndProfile(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <Router>
      <Navbar />
      <div style={{ paddingTop: 64, minHeight: 'calc(100vh - 350px)' }}>
        <Routes>
          <Route path="/" element={<LandingHome />} />
          <Route path="/manga" element={<MangaReader />} />
          <Route path="/code" element={<CodeRunner />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/login" element={<Auth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/duel" element={
            user === null
              ? <div style={{ padding: 24 }}>Loading user info...</div>
              : user === false
                ? <Navigate to="/login" />
                : <Duel user={user} />
          } />
          <Route path="/duel_cf" element={
            user === null
              ? <div style={{ padding: 24 }}>Loading user info...</div>
              : user === false
                ? <Navigate to="/login" />
                : <DuelCF user={user} />
          } />
          <Route path="/team_duel_cf" element={
            user === null
              ? <div style={{ padding: 24 }}>Loading user info...</div>
              : user === false
                ? <Navigate to="/login" />
                : <TeamCFDuel user={user} />
          } />
        <Route path="/lobby" element={
            user === null
              ? <div style={{ padding: 24 }}>Loading user info...</div>
              : user === false
                ? <Navigate to="/login" />
                : <GameLobby user={user} />
          } />
                    <Route path="/player/:id" element={<PlayerProfile />} />
          </Routes>
      </div>
      <Footer />
    </Router>
  );
}

export default App;



// import logo from './logo.svg';
// import './App.css';

// function App() {
//   return (
//     <div className="App">
//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.js</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

// export default App;


// const user = supabase.auth.getUser(); // Get the current user (async, see note below)

// const handleSubmit = async (e) => {
//   e.preventDefault();
//   setLoading(true);
//   setResult(null);
//   try {
//     const res = await axios.post(`${process.env.REACT_APP_API_URL}/run`, {
//       source_code: sourceCode,
//       language_id: languageId,
//       stdin,
//     });
//     setResult(res.data);

//     // Store submission in Supabase
//     const { data: userData } = await supabase.auth.getUser();
//     if (userData && userData.user) {
//       await supabase.from('submissions').insert([
//         {
//           user_id: userData.user.id,
//           source_code: sourceCode,
//           language_id: languageId,
//           result: JSON.stringify(res.data),
//         }
//       ]);
//     }
//   } catch (err) {
//     setResult({ error: err.message });
//   }
//   setLoading(false);
// };