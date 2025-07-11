import React, { useEffect, useState, useCallback, useRef } from "react";
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
  // ---- Friends feature state ----
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendLoading, setFriendLoading] = useState(false);
  const [addHandle, setAddHandle] = useState('');
  const [friendMessage, setFriendMessage] = useState('');
  // online presence
  const [onlineIds, setOnlineIds] = useState([]);
  const presenceRef = useRef(null);
  // Tailwind input style
  const inputClass = "w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary";

  useEffect(() => {
    async function fetchUserAndData() {
      const { data: userData } = await supabase.auth.getUser();
      setUser(userData.user);
      if (userData.user) {
        // Fetch profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("name, age, state, codeforces_handle, rating, cf_verified, cf_verify_problem_contest_id, cf_verify_problem_index, cf_verify_problem_name, cf_verify_start_time")
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

  // ------- Friends feature helpers -------
  const fetchFriends = useCallback(async () => {
    if (!user) return;
    setFriendLoading(true);
    const { data: rows, error } = await supabase
      .from('friends')
      .select('*')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    if (!error && rows) {
      const accepted = [];
      const incoming = [];
      rows.forEach(r => {
        if (r.status === 'accepted') {
          accepted.push(r);
        } else if (r.status === 'pending' && r.friend_id === user.id) {
          incoming.push(r);
        }
      });
      const ids = Array.from(new Set([...accepted, ...incoming].map(r => (r.user_id === user.id ? r.friend_id : r.user_id))));
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('user_id,name').in('user_id', ids);
        const nameMap = {};
        (profs || []).forEach(p => { nameMap[p.user_id] = p.name; });
        accepted.forEach(r => {
          r.friend_user_id = r.user_id === user.id ? r.friend_id : r.user_id;
          r.friend_name = nameMap[r.friend_user_id] || r.friend_user_id;
        });
        incoming.forEach(r => {
          r.requester_name = nameMap[r.user_id] || r.user_id;
        });
      }
      setFriends(accepted);
      setFriendRequests(incoming);
    }
    setFriendLoading(false);
  }, [user]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // presence: track online users
  useEffect(() => {
    if (!user || presenceRef.current) return;
    const ch = supabase.channel('online_users', {
      config: { presence: { key: user.id } }
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      setOnlineIds(Object.keys(state));
    });
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ name: user.email });
      }
    });
    presenceRef.current = ch;
    return () => {
      ch.unsubscribe();
      presenceRef.current = null;
    };
  }, [user]);

  const handleSendFriendRequest = async () => {
    if (!addHandle.trim()) return;
    setFriendLoading(true);
    setFriendMessage('');
    const handle = addHandle.trim();
    const { data: prof, error } = await supabase.from('profiles').select('user_id').eq('codeforces_handle', handle).single();
    if (error || !prof) {
      setFriendMessage('User not found.');
      setFriendLoading(false);
      return;
    }
    if (prof.user_id === user.id) {
      setFriendMessage("That's you!");
      setFriendLoading(false);
      return;
    }
    const { data: existing } = await supabase.from('friends').select('id,status').or(`and(user_id.eq.${user.id},friend_id.eq.${prof.user_id}),and(user_id.eq.${prof.user_id},friend_id.eq.${user.id})`).maybeSingle();
    if (existing) {
      setFriendMessage('Friend request already exists.');
      setFriendLoading(false);
      return;
    }
    await supabase.from('friends').insert({ user_id: user.id, friend_id: prof.user_id, status: 'pending' });
    setFriendMessage('Friend request sent!');
    setAddHandle('');
    fetchFriends();
    setFriendLoading(false);
  };

  const respondFriendRequest = async (reqId, accept) => {
    await supabase.from('friends').update({ status: accept ? 'accepted' : 'declined' }).eq('id', reqId);
    fetchFriends();
  };

  if (loading || profileLoading) return <div style={{ marginTop: 120, textAlign: "center" }}>Loading...</div>;
  if (!user) return <div style={{ marginTop: 120, textAlign: "center" }}>Not logged in.</div>;

  return (
    <div className="mt-20 flex flex-col items-center px-4 text-gray-700">
      <div className="card w-full max-w-md">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>
        <div style={{ marginBottom: 8 }}><b>Email:</b> {user.email}</div>
        {(!profile || !profile.name || !profile.age || !profile.state || editing) ? (
          <form onSubmit={handleProfileSubmit} style={{ marginTop: 24 }}>
            {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
            {message && <div style={{ color: 'green', marginBottom: 8 }}>{message}</div>}
            <div className="mb-3">
              <input
                type="text"
                placeholder="Name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="mb-3">
              <input
                type="number"
                placeholder="Age"
                value={form.age}
                onChange={e => setForm({ ...form, age: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="State"
                value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Codeforces Handle (optional)"
                value={form.codeforces_handle}
                onChange={e => setForm({ ...form, codeforces_handle: e.target.value })}
                className={inputClass}
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
            <button type="submit" disabled={saving} className="button-primary">
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div><b>Name:</b> {profile.name}</div>
            <div><b>Age:</b> {profile.age}</div>
            <div><b>State:</b> {profile.state}</div>
            <div><b>Rating:</b> {profile.rating != null ? profile.rating : 800}</div>
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
            }} className="button-primary mt-3">Edit Profile</button>
          </div>
        )}
      </div>
      {/* Friends Section */}
      <div className="card w-full max-w-2xl mt-8">
        <h3 className="text-lg font-semibold mb-3">Friends</h3>
        {friendLoading ? (
          <div>Loading...</div>
        ) : (
          <>
            {friends.length === 0 ? (
              <div className="mb-3">You have no friends yet.</div>
            ) : (
              <ul className="list-none mb-3">
                {friends.map(f => (
                  <li key={f.id} className="my-1.5 flex items-center">
                    <span className="w-2 h-2 rounded-full inline-block mr-1" style={{ background: onlineIds.includes(f.friend_user_id) ? 'limegreen' : '#bbb' }}></span>
                    {f.friend_name || f.friend_user_id}
                  </li>
                ))}
              </ul>
            )}
            <div className="mb-3">
              <input
                type="text"
                placeholder="Friend's Codeforces handle"
                value={addHandle}
                onChange={e => setAddHandle(e.target.value)}
                className={inputClass + ' mr-2'}
              />
              <button onClick={handleSendFriendRequest} disabled={friendLoading || !addHandle.trim()} className="button-primary">
                Add Friend
              </button>
            </div>
            {friendMessage && <div className="text-green-600 mb-3">{friendMessage}</div>}
            <h4 className="my-3 font-semibold">Incoming Requests</h4>
            {friendRequests.length === 0 ? (
              <div>No pending requests.</div>
            ) : (
              <ul className="list-none">
                {friendRequests.map(req => (
                  <li key={req.id} style={{ margin: '6px 0' }}>
                    {req.requester_name || 'Unknown'}
                    <button onClick={() => respondFriendRequest(req.id, true)} className="button-success mx-1">Accept</button>
                    <button onClick={() => respondFriendRequest(req.id, false)} className="button-danger">Decline</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="card w-full max-w-2xl mt-8">
        <h3 className="text-lg font-semibold mb-3">Your Submissions</h3>
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