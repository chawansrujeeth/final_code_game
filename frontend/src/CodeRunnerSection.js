import React from 'react';

export default function CodeRunnerSection({ testcaseId, onAccepted }) {
  return (
    <div style={{ border: '1px dashed #aaa', padding: 16, margin: '16px 0', background: '#f9f9f9' }}>
      <p>CodeRunnerSection Placeholder (testcaseId: {testcaseId})</p>
      <button onClick={onAccepted} style={{ padding: '6px 18px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none' }}>
        Mark as Solved
      </button>
    </div>
  );
} 