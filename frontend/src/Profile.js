import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import axios from "axios";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [form, setForm] = useState({ name: '', age: '', state: '', codeforces_handle: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [cfVerified, setCfVerified] = useState(false);
  const [cfVerifying, setCfVerifying] = useState(false);
  const [cfVerifyMsg, setCfVerifyMsg] = useState("");
  const EASY_PROBLEMS = [
    { contestId: 1, index: "A", name: "Theatre Square" },
    { contestId: 4, index: "A", name: "Watermelon" },
    { contestId: 71, index: "A", name: "Way Too Long Words" },
    { contestId: 231, index: "A", name: "Team" },
    { contestId: 158, index: "A", name: "Next Round" }
  ];
  const [verifyProblem, setVerifyProblem] = useState(null);
  const [verifyStartTime, setVerifyStartTime] = useState(null);

  useEffect(() => {
    async function fetchUserAndData() {
      const { data: userData } = await supabase.auth.getUser();
      setUser(userData.user);
      if (userData.user) {
        // Fetch profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("name, age, state, codeforces_handle, cf_verified, cf_verify_problem_contest_id, cf_verify_problem_index, cf_verify_problem_name, cf_verify_start_time")
          .eq("user_id", userData.user.id)
          .single();
        setProfile(profileData);
        setProfileLoading(false);
        setCfVerified(!!profileData?.cf_verified);
        // Restore verification session if present
        if (profileData && profileData.cf_verify_problem_contest_id && profileData.cf_verify_problem_index && profileData.cf_verify_start_time) {
          setVerifyProblem({
            contestId: profileData.cf_verify_problem_contest_id,
            index: profileData.cf_verify_problem_index,
            name: profileData.cf_verify_problem_name || ''
          });
          setVerifyStartTime(Number(profileData.cf_verify_start_time));
        }
        // Fetch submissions
        const { data, error } = await supabase
          .from("submissions")
          .select("id, source_code, language_id, result, created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });
        if (!error && data) setSubmissions(data);
        // Set form values if profile exists
        if (profileData) {
          setForm({
            name: profileData.name || '',
            age: profileData.age || '',
            state: profileData.state || '',
            codeforces_handle: profileData.codeforces_handle || ''
          });
        }
      }
      setLoading(false);
    }
    fetchUserAndData();
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    // Validation
    if (!form.name || !form.age || !form.state) {
      setError("All fields are required.");
      setSaving(false);
      return;
    }
    if (isNaN(form.age) || Number(form.age) <= 0) {
      setError("Age must be a positive number.");
      setSaving(false);
      return;
    }
    const { error: upsertError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      name: form.name,
      age: form.age,
      state: form.state,
      codeforces_handle: form.codeforces_handle,
      cf_verified: cfVerified,
      cf_verify_problem_contest_id: verifyProblem ? verifyProblem.contestId : null,
      cf_verify_problem_index: verifyProblem ? verifyProblem.index : null,
      cf_verify_problem_name: verifyProblem ? verifyProblem.name : null,
      cf_verify_start_time: verifyStartTime || null
    });
    if (upsertError) {
      setError("Failed to save profile. Try again.");
    } else {
      setProfile({ name: form.name, age: form.age, state: form.state, codeforces_handle: form.codeforces_handle, cf_verified: cfVerified });
      setMessage("Profile saved successfully!");
      setEditing(false);
    }
    setSaving(false);
  };

  const startVerification = async () => {
    // Pick a random problem
    const problem = EASY_PROBLEMS[Math.floor(Math.random() * EASY_PROBLEMS.length)];
    const startTime = Date.now();
    setVerifyProblem(problem);
    setVerifyStartTime(startTime);
    setCfVerified(false);
    setCfVerifyMsg("");
    // Save to Supabase
    if (user) {
      await supabase.from('profiles').update({
        cf_verify_problem_contest_id: problem.contestId,
        cf_verify_problem_index: problem.index,
        cf_verify_problem_name: problem.name,
        cf_verify_start_time: startTime,
        cf_verified: false
      }).eq('user_id', user.id);
    }
  };

  const verifyCodeforcesHandle = async () => {
    setCfVerifying(true);
    setCfVerifyMsg("");
    setCfVerified(false);
    if (!form.codeforces_handle) {
      setCfVerifyMsg("Enter your Codeforces handle first.");
      setCfVerifying(false);
      return;
    }
    if (!verifyProblem || !verifyStartTime) {
      setCfVerifyMsg("Click 'Start Verification' to get your problem.");
      setCfVerifying(false);
      return;
    }
    try {
      // Fetch recent submissions
      const res = await axios.get(`https://codeforces.com/api/user.status?handle=${form.codeforces_handle}&count=20`);
      const submissions = res.data.result;
      // Check if any submission is for the verify problem and after verifyStartTime
      const found = submissions.find(sub =>
        sub.problem &&
        sub.problem.contestId === verifyProblem.contestId &&
        sub.problem.index === verifyProblem.index &&
        sub.creationTimeSeconds * 1000 > verifyStartTime
      );
      if (found) {
        setCfVerified(true);
        setCfVerifyMsg("Handle verified! You have submitted to the verification problem.");
        // Update Supabase to mark as verified
        if (user) {
          await supabase.from('profiles').update({ cf_verified: true }).eq('user_id', user.id);
        }
      } else {
        setCfVerifyMsg(`No recent submission found for problem ${verifyProblem.contestId}${verifyProblem.index} after you started verification. Please submit any solution to this problem on Codeforces, then click Verify again.`);
      }
    } catch (err) {
      setCfVerifyMsg("Could not verify handle. Please check the handle and try again.");
    }
    setCfVerifying(false);
  };

  if (loading || profileLoading) return <div style={{ marginTop: 120, textAlign: "center" }}>Loading...</div>;
  if (!user) return <div style={{ marginTop: 120, textAlign: "center" }}>Not logged in.</div>;

  return (
    <div style={{ marginTop: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#444' }}>
      <div style={{ background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', borderRadius: 12, padding: 32, minWidth: 340, maxWidth: 420 }}>
        <h2 style={{ marginBottom: 8 }}>Profile</h2>
        <div style={{ marginBottom: 8 }}><b>Email:</b> {user.email}</div>
        {(!profile || !profile.name || !profile.age || !profile.state || editing) ? (
          <form onSubmit={handleProfileSubmit} style={{ marginTop: 24 }}>
            {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
            {message && <div style={{ color: 'green', marginBottom: 8 }}>{message}</div>}
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                style={{ padding: 8, fontSize: 16, width: 200 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                type="number"
                placeholder="Age"
                value={form.age}
                onChange={e => setForm({ ...form, age: e.target.value })}
                required
                style={{ padding: 8, fontSize: 16, width: 200 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="State"
                value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}
                required
                style={{ padding: 8, fontSize: 16, width: 200 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Codeforces Handle (optional)"
                value={form.codeforces_handle}
                onChange={e => setForm({ ...form, codeforces_handle: e.target.value })}
                style={{ padding: 8, fontSize: 16, width: 200 }}
              />
              {form.codeforces_handle && (
                <>
                  <button type="button" onClick={startVerification} style={{ marginLeft: 8, padding: '6px 14px', fontSize: 14, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6 }}>
                    Start Verification
                  </button>
                  {verifyProblem && (
                    <a href={`https://codeforces.com/contest/${verifyProblem.contestId}/problem/${verifyProblem.index}`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, padding: '6px 14px', fontSize: 14, background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, textDecoration: 'none' }}>
                      Go to Problem: {verifyProblem.contestId}{verifyProblem.index} ({verifyProblem.name})
                    </a>
                  )}
                  <button type="button" onClick={verifyCodeforcesHandle} disabled={cfVerifying || !verifyProblem} style={{ marginLeft: 8, padding: '6px 14px', fontSize: 14 }}>
                    {cfVerifying ? "Verifying..." : "Verify"}
                  </button>
                  <div style={{ fontSize: 13, color: cfVerified ? 'green' : '#555', marginTop: 4 }}>
                    {cfVerifyMsg || (verifyProblem ?
                      <>Submit any solution to the problem above <b>after</b> clicking Start Verification, then click Verify.</>
                      : "Click 'Start Verification' to get your problem.")}
                  </div>
                </>
              )}
            </div>
            <button type="submit" disabled={saving} style={{ padding: '8px 24px', fontSize: 16 }}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div><b>Name:</b> {profile.name}</div>
            <div><b>Age:</b> {profile.age}</div>
            <div><b>State:</b> {profile.state}</div>
            <div><b>Codeforces Handle:</b> {profile.codeforces_handle || <span style={{ color: '#aaa' }}>Not set</span>}</div>
            {profile.codeforces_handle && (
              <span style={{ marginLeft: 8, color: cfVerified ? 'green' : 'orange', fontWeight: 600 }}>
                {cfVerified ? 'Verified' : 'Not Verified'}
              </span>
            )}
            <button onClick={() => {
              setForm({ name: profile.name, age: profile.age, state: profile.state, codeforces_handle: profile.codeforces_handle });
              setEditing(true);
              setMessage("");
              setError("");
            }} style={{ marginTop: 12, padding: '6px 18px', fontSize: 15 }}>Edit Profile</button>
          </div>
        )}
      </div>
      <div style={{ background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', borderRadius: 12, padding: 32, minWidth: 340, maxWidth: 900, marginTop: 32 }}>
        <h3 style={{ marginTop: 0 }}>Your Submissions</h3>
        {submissions.length === 0 ? (
          <div>No submissions yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ margin: '0 auto', borderCollapse: 'collapse', marginTop: 16, width: '100%' }}>
              <thead>
                <tr style={{ background: '#f3f3f3' }}>
                  <th style={{ border: '1px solid #eee', padding: 10 }}>Time</th>
                  <th style={{ border: '1px solid #eee', padding: 10 }}>Language</th>
                  <th style={{ border: '1px solid #eee', padding: 10 }}>Code</th>
                  <th style={{ border: '1px solid #eee', padding: 10 }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(sub => (
                  <tr key={sub.id}>
                    <td style={{ border: '1px solid #eee', padding: 10 }}>{new Date(sub.created_at).toLocaleString()}</td>
                    <td style={{ border: '1px solid #eee', padding: 10 }}>{sub.language_id}</td>
                    <td style={{ border: '1px solid #eee', padding: 10, maxWidth: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: 13 }}>{sub.source_code.slice(0, 100)}{sub.source_code.length > 100 ? '...' : ''}</td>
                    <td style={{ border: '1px solid #eee', padding: 10, maxWidth: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: 13 }}>{sub.result ? sub.result.slice(0, 100) : ''}{sub.result && sub.result.length > 100 ? '...' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
} 