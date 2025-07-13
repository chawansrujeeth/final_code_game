import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Page that handles the redirect from Supabase email / OAuth links.
// It exchanges the code in the URL (or hash fragments) for a logged-in session
// and then forwards the user to the standard home page.
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function handleRedirect() {
      try {
        // For Supabase JS v2 (PKCE / OAuth) style URL: ?code=...&state=...
        if (window.location.search.includes('code=')) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
        }
        // For magic-link style hash fragment: #access_token=...
        else if (window.location.hash.includes('access_token=')) {
          // supabase-js v2 will automatically detect and set the session on initialisation,
          // but calling getSessionFromUrl() makes it explicit and cleans the URL.
          await supabase.auth.getSessionFromUrl();
        }
      } catch (err) {
        console.error('Supabase auth callback error', err);
      } finally {
        // Regardless of success/failure, send user to the landing page.
        navigate('/', { replace: true });
      }
    }

    handleRedirect();
    // we only want to run this once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <h2 style={{ color: '#7c3aed', marginBottom: 12 }}>Signing you in…</h2>
      <p>Please wait while we complete your login.</p>
    </div>
  );
}
