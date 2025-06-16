import React from "react";

const DuelCF = ({ user }) => {
  // In a real implementation, fetch the user's Codeforces handle from profile (passed via props or fetched here)
  // For now, just show a placeholder
  return (
    <div style={{ padding: 32, maxWidth: 600, margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#7c3aed', textAlign: 'center', marginBottom: 16 }}>Codeforces Duel (Beta)</h2>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        {/* TODO: Fetch and show Codeforces handle from profile */}
        <b>Your Codeforces Handle:</b> <span style={{ color: '#2196f3' }}>[fetch from profile]</span>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', padding: 32, minHeight: 200, textAlign: 'center' }}>
        <p>This is where the Codeforces duel logic will go.</p>
        <p>Matchmaking, problem selection, and submission checking will be implemented here.</p>
      </div>
    </div>
  );
};

export default DuelCF; 