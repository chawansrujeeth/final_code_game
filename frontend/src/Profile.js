import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [form, setForm] = useState({ name: '', age: '', state: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    async function fetchUserAndData() {
      const { data: userData } = await supabase.auth.getUser();
      setUser(userData.user);
      if (userData.user) {
        // Fetch profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("name, age, state")
          .eq("user_id", userData.user.id)
          .single();
        setProfile(profileData);
        setProfileLoading(false);
        // Fetch submissions
        const { data, error } = await supabase
          .from("submissions")
          .select("id, source_code, language_id, result, created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });
        if (!error && data) setSubmissions(data);
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
      state: form.state
    });
    if (upsertError) {
      setError("Failed to save profile. Try again.");
    } else {
      setProfile({ name: form.name, age: form.age, state: form.state });
      setMessage("Profile saved successfully!");
      setEditing(false);
    }
    setSaving(false);
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
            <button type="submit" disabled={saving} style={{ padding: '8px 24px', fontSize: 16 }}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div><b>Name:</b> {profile.name}</div>
            <div><b>Age:</b> {profile.age}</div>
            <div><b>State:</b> {profile.state}</div>
            <button onClick={() => {
              setForm({ name: profile.name, age: profile.age, state: profile.state });
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