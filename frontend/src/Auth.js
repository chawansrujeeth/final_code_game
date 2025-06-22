// src/Auth.js
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setMessage('Check your email for confirmation link!');
    }
    setLoading(false);
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setMessage('Logged in! Redirecting...');
      setTimeout(() => navigate('/'), 800);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #e0ecff 0%, #b6d0f7 100%)' }}>
      <div style={{ background: '#fff', padding: 36, borderRadius: 14, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', minWidth: 320, maxWidth: 380, width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24, color: '#7c3aed', fontWeight: 800 }}>Sign In / Sign Up</h2>
        {error && <div style={{ color: '#e53935', marginBottom: 12, textAlign: 'center' }}>{error}</div>}
        {message && <div style={{ color: '#388e3c', marginBottom: 12, textAlign: 'center' }}>{message}</div>}
        <div style={{ marginBottom: 18 }}>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            style={{ width: '100%', padding: '10px 14px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc', marginBottom: 14 }}
            autoComplete="email"
          />
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            style={{ width: '100%', padding: '10px 14px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
            autoComplete="current-password"
          />
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 8 }}>
          <button
            onClick={handleSignIn}
            disabled={loading}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Loading...' : 'Log In'}
          </button>
          <button
            onClick={handleSignUp}
            disabled={loading}
            style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Loading...' : 'Sign Up'}
          </button>
        </div>
        <div style={{ textAlign: 'center', color: '#888', fontSize: 13, marginTop: 10 }}>
          Use your email and password to log in or create a new account.
        </div>
      </div>
    </div>
  );
}