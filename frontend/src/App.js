import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import CodeRunner from "./CodeRunner";
import MangaReader from "./MangaReader";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MangaReader />} />
        <Route path="/code" element={<CodeRunner />} />
      </Routes>
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