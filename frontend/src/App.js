import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import CodeRunner from "./CodeRunner";
import MangaReader from "./MangaReader";
import LandingHome from "./LandingHome";
import Navbar from "./Navbar";
import Profile from "./Profile";
import Login from "./Login";
import Footer from "./Footer";

function App() {
  return (
    <Router>
      <Navbar />
      <div style={{ paddingTop: 64, minHeight: 'calc(100vh - 350px)' }}>
        <Routes>
          <Route path="/" element={<LandingHome />} />
          <Route path="/manga" element={<MangaReader />} />
          <Route path="/code" element={<CodeRunner />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/login" element={<Login />} />
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