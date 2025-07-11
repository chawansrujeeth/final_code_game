import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Helper to compute gamified level/xp
function getLevelData(rating = 800) {
  const level = Math.floor(rating / 200) + 1;
  const xp = rating % 200;
  const xpPercent = (xp / 200) * 100;
  return { level, xpPercent };
}

export default function PlayerProfile() {
  const { id } = useParams();

  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      // Profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('name, age, state, codeforces_handle, rating, cf_verified')
        .eq('user_id', id)
        .maybeSingle();
      setProfile(prof);

      // Matches
      const { data: matchRows } = await supabase
        .from('duel_history')
        .select('*')
        .contains('participants', [id])
        .order('created_at', { ascending: false })
        .limit(20);
      setMatches(matchRows || []);

      // Submissions
      const { data: subRows } = await supabase
        .from('submissions')
        .select('id, language_id, created_at, result')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      setSubs(subRows || []);

      setLoading(false);
    }
    fetchData();
  }, [id]);

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;
  if (!profile) return <div className="p-8 text-center">Profile not found.</div>;

  const { level, xpPercent } = getLevelData(profile.rating ?? 800);

  return (
    <div className="max-w-xl mx-auto p-8 font-sans">
      <Link to="/lobby" className="text-primary hover:underline mb-4 inline-block">
        ← Back
      </Link>

      {/* Header */}
      <div className="flex flex-col items-center text-center space-y-3 mb-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary">
            {(profile.name || '?').charAt(0).toUpperCase()}
          </div>
          {profile.cf_verified && (
            <span className="absolute -bottom-1 -right-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
              CF ✓
            </span>
          )}
        </div>
        <h2 className="text-2xl font-semibold">{profile.name || 'Unknown Player'}</h2>
        <div className="flex items-center space-x-2">
          <span className="px-2 py-1 bg-primary text-white rounded-md text-sm">Lvl {level}</span>
          <span className="text-gray-500 text-sm">{profile.rating ?? 800} RP</span>
        </div>
        <div className="w-40 bg-gray-200 rounded-full h-3">
          <div className="bg-primary h-3 rounded-full" style={{ width: `${xpPercent}%` }}></div>
        </div>
        {profile.codeforces_handle && (
          <div className="text-sm text-gray-600">CF: {profile.codeforces_handle}</div>
        )}
        <div className="text-sm text-gray-500">
          {profile.age ? `${profile.age} yrs` : ''} {profile.state && `• ${profile.state}`}
        </div>
      </div>

      {/* Recent Matches */}
      {matches.length > 0 && (
        <section className="mt-10">
          <h3 className="text-xl font-semibold mb-4">Recent Matches</h3>
          <div className="space-y-4">
            {matches.map((m) => {
              const isTeamA = m.team_a_ids.includes(id);
              const won = m.winner_team === (isTeamA ? 'A' : 'B');
              const ratingDelta = m.rating_deltas?.[id] ?? 0;
              return (
                <div
                  key={m.id}
                  className={`card flex justify-between items-center border-l-4 ${won ? 'border-green-600' : 'border-red-600'} hover:shadow-md transition-shadow`}
                >
                  <div>
                    <p className="font-medium">
                      {won ? 'Win' : 'Loss'} {won ? '🎉' : '😞'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                    <p className="text-sm mt-1">
                      <span className="font-semibold">Score Diff:</span> {m.score_diff}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      <span className="font-semibold">Rating:</span> {ratingDelta > 0 ? '+' : ''}
                      {ratingDelta}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Submissions */}
      {subs.length > 0 && (
        <section className="mt-10">
          <h3 className="text-xl font-semibold mb-4">Recent Submissions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Language</th>
                  <th className="px-3 py-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{s.language_id}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{s.result?.slice(0, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';

export default function PlayerProfile() {
  // Helper to compute level & xp
  const getLevelData = (ratingValue = 800) => {
    const level = Math.floor(ratingValue / 200) + 1;
    const xp = ratingValue % 200;
    const xpPercent = (xp / 200) * 100;
    return { level, xpPercent };
  };
  const { id } = useParams();
  
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [submissions, setSubmissions] = useState([]);
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
    // Fetch submissions
    async function fetchSubs() {
      const { data } = await supabase
        .from('submissions')
        .select('id, language_id, created_at, source_code, result')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      setSubmissions(data || []);
    }
    fetchSubs();
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
      <div className="flex flex-col items-center text-center space-y-3 mb-6">
        {/* Avatar */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary">
            {(profile.name || '?').charAt(0).toUpperCase()}
          </div>
          {profile.cf_verified && <span className="absolute -bottom-1 -right-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">CF ✓</span>}
        </div>
        <h2 className="text-2xl font-semibold">{profile.name || 'Unknown Player'}</h2>
        {(() => {
          if (!profile) return null;
          const { level, xpPercent } = getLevelData(profile.rating ?? 800);
          return (
            <>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 bg-primary text-white rounded-md text-sm">Lvl {level}</span>
                <span className="text-gray-500 text-sm">{profile.rating ?? 800} RP</span>
              </div>
              <div className="w-40 bg-gray-200 rounded-full h-3">
                <div className="bg-primary h-3 rounded-full" style={{ width: `${xpPercent}%` }}></div>
              </div>
            </>
          );
        })()}
        {profile.codeforces_handle && (
          <div className="text-sm text-gray-600">CF: {profile.codeforces_handle}</div>
        )}
        <div className="text-sm text-gray-500">{profile.age ? `${profile.age} yrs` : ''} {profile.state && `• ${profile.state}`}</div>
      </div>
        {/* Recent Matches */}
        {matches.length > 0 && (
          <div className="mt-10">
            <h3 className="text-xl font-semibold mb-4">Recent Matches</h3>
            <div className="space-y-4">
              {matches.map(m => {
                const isTeamA = m.team_a_ids.includes(id);
                const won = m.winner_team === (isTeamA ? 'A' : 'B');
                const ratingDelta = m.rating_deltas?.[id] ?? 0;
                return (
                  <div key={m.id} className={`card flex justify-between items-center border-l-4 ${won ? 'border-green-600' : 'border-red-600'} hover:shadow-md transition-shadow`}>
                    <div>
                      <p className="font-medium">{won ? 'Win' : 'Loss'} {won ? '🎉' : '😞'}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(m.created_at).toLocaleString()}</p>
                      <p className="text-sm mt-1"><span className="font-semibold">Score Diff:</span> {m.score_diff}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm"><span className="font-semibold">Rating:</span> {ratingDelta > 0 ? '+' : ''}{ratingDelta}</p>
                    </div>
          <div className="space-y-4">
            {matches.map(m => {
              const isTeamA = m.team_a_ids.includes(id);
              const won = m.winner_team === (isTeamA ? 'A' : 'B');
              const ratingDelta = m.rating_deltas?.[id] ?? 0;
              return (
                <div key={m.id} className={`card flex justify-between items-center border-l-4 ${won ? 'border-green-600' : 'border-red-600'} hover:shadow-md transition-shadow`}>
                  <div>
                    <p className="font-medium">{won ? 'Win' : 'Loss'} {won ? '🎉' : '😞'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(m.created_at).toLocaleString()}</p>
                    <p className="text-sm mt-1"><span className="font-semibold">Score Diff:</span> {m.score_diff}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm"><span className="font-semibold">Rating:</span> {ratingDelta > 0 ? '+' : ''}{ratingDelta}</p>
                  </div>
                </div>
          </div>
        )}

        {/* Recent Submissions */}
      {submissions.length > 0 && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-4">Recent Submissions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Language</th>
                  <th className="px-3 py-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(s => (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{s.language_id}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{s.result?.slice(0, 80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
