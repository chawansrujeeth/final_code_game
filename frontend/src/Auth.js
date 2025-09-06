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
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
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
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      // Successful sign-in handled via auth state listener
    }
    setLoading(false);
  };

  // Google OAuth login
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #e0ecff 0%, #b6d0f7 100%)' }}>
      <div style={{ background: '#fff', padding: 36, borderRadius: 14, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', minWidth: 320, maxWidth: 380, width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24, color: '#7c3aed', fontWeight: 800 }}>Sign In with Google</h2>
        {error && <div style={{ color: '#e53935', marginBottom: 12, textAlign: 'center' }}>{error}</div>}
        {message && <div style={{ color: '#388e3c', marginBottom: 12, textAlign: 'center' }}>{message}</div>}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#4285F4',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontWeight: 700,
              fontSize: 16,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Loading...' : (
              <>
                <svg width="20" height="20" viewBox="0 0 533.5 544.3" fill="currentColor">
                  <path d="M533.5 278.4c0-18.4-1.5-36-4.3-53.1H272v100.8h147.5c-6.3 34-25 62.7-53.4 82v68.3h86.4c50.7-46.7 80-115.4 80-198z"/>
                  <path d="M272 544.3c72.6 0 133.6-24.1 178.1-65.5l-86.4-68.3c-24 16.1-54.7 25.6-91.8 25.6-70.7 0-130.7-47.8-152.3-112.6H28.7v70.7C73.8 475.3 166.3 544.3 272 544.3z"/>
                  <path d="M119.7 323.5c-10.8-32-10.8-66 0-98.1V154.7H28.7c-43.4 86.8-43.4 190.1 0 276.9l91-70.1z"/>
                  <path d="M272 107.3c39.5-.6 78.1 13.7 107.8 40.3l80.6-80.6C435 .3 356.4-23.8 272 24.1S108.4 151.3 119.7 225.4l91 70.1C141.2 201.9 201.3 107.3 272 107.3z"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>
        </div>
        <div style={{ textAlign: 'center', color: '#888', fontSize: 13 }}>
          Sign in with your Google account to continue.
        </div>
      </div>
    </div>
  );
}