// src/Auth.js
import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : 'Check your email for confirmation link!');
  };

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : 'Logged in!');
  };

  return (
    <div>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" />
      <button onClick={handleSignUp}>Sign Up</button>
      <button onClick={handleSignIn}>Log In</button>
      <div>{message}</div>
    </div>
  );
}