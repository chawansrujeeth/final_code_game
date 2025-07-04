import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function PlayerProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, age, state, codeforces_handle, rating, cf_verified')
        .eq('user_id', id)
        .single();
      if (!error) setProfile(data);
      setLoading(false);
    }
    fetchProfile();
    // Fetch match history
    async function fetchMatches() {
      const { data: rows } = await supabase
        .from('duel_history')
        .select('*')
        .contains('participants', [id])
        .order('created_at', { ascending: false })
        .limit(20);
      setMatches(rows || []);
    }
    fetchMatches();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-center">Profile not found.</div>;
  }

  return (
    <div className="max-w-xl mx-auto p-8 font-sans">
      <Link to="/lobby" className="text-primary hover:underline">← Back</Link>
      <h2 className="heading mb-6">{profile.name || 'Unknown Player'}</h2>

      <div className="card mb-6">
        <p className="mb-2"><span className="font-semibold">Age:</span> {profile.age || 'N/A'}</p>
        <p className="mb-2"><span className="font-semibold">State:</span> {profile.state || 'N/A'}</p>
        <p className="mb-2"><span className="font-semibold">Codeforces Handle:</span> {profile.codeforces_handle || 'N/A'}</p>
        {profile.rating && (
          <p className="mb-2"><span className="font-semibold">CF Rating:</span> {profile.rating}</p>
        )}
        {profile.cf_verified && <span className="inline-block px-3 py-1 bg-green-600 text-white rounded-md text-sm">CF Verified</span>}
      </div>
          {matches.length > 0 && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-4">Recent Matches</h3>
          <div className="space-y-4">
            {matches.map(m => {
              const isTeamA = m.team_a_ids.includes(id);
              const won = m.winner_team === (isTeamA ? 'A' : 'B');
              const ratingDelta = m.rating_deltas?.[id] ?? 0;
              return (
                <div key={m.id} className={`card flex justify-between items-center border-l-4 ${won ? 'border-green-600' : 'border-red-600'}`}>
                  <div>
                    <p className="font-medium">{won ? 'Win' : 'Loss'} {won ? '🎉' : '😞'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(m.created_at).toLocaleString()}</p>
                    <p className="text-sm mt-1"><span className="font-semibold">Score Diff:</span> {m.score_diff}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm"><span className="font-semibold">Rating:</span> {ratingDelta > 0 ? '+' : ''}{ratingDelta}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
