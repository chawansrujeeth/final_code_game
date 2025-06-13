import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserAndSubmissions() {
      const { data: userData } = await supabase.auth.getUser();
      setUser(userData.user);
      if (userData.user) {
        const { data, error } = await supabase
          .from("submissions")
          .select("id, source_code, language_id, result, created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });
        if (!error && data) setSubmissions(data);
      }
      setLoading(false);
    }
    fetchUserAndSubmissions();
  }, []);

  if (loading) return <div style={{ marginTop: 120, textAlign: "center" }}>Loading...</div>;
  if (!user) return <div style={{ marginTop: 120, textAlign: "center" }}>Not logged in.</div>;

  return (
    <div style={{ marginTop: 120, textAlign: "center", color: "#444" }}>
      <h2>Profile</h2>
      <div><b>Email:</b> {user.email}</div>
      <h3 style={{ marginTop: 32 }}>Your Submissions</h3>
      {submissions.length === 0 ? (
        <div>No submissions yet.</div>
      ) : (
        <table style={{ margin: "0 auto", borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: 8 }}>Time</th>
              <th style={{ border: "1px solid #ccc", padding: 8 }}>Language</th>
              <th style={{ border: "1px solid #ccc", padding: 8 }}>Code</th>
              <th style={{ border: "1px solid #ccc", padding: 8 }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map(sub => (
              <tr key={sub.id}>
                <td style={{ border: "1px solid #ccc", padding: 8 }}>{new Date(sub.created_at).toLocaleString()}</td>
                <td style={{ border: "1px solid #ccc", padding: 8 }}>{sub.language_id}</td>
                <td style={{ border: "1px solid #ccc", padding: 8, maxWidth: 200, overflow: "auto", fontFamily: "monospace", fontSize: 13 }}>{sub.source_code.slice(0, 100)}{sub.source_code.length > 100 ? '...' : ''}</td>
                <td style={{ border: "1px solid #ccc", padding: 8, maxWidth: 200, overflow: "auto", fontFamily: "monospace", fontSize: 13 }}>{sub.result ? sub.result.slice(0, 100) : ''}{sub.result && sub.result.length > 100 ? '...' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
} 