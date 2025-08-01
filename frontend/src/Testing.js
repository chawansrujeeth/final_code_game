import React from "react";

export default function Testing() {
  return (
    <div style={{ minHeight: 'calc(100vh - 128px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Testing Page</h1>
      <p style={{ fontSize: '1.25rem', color: 'var(--fg-muted)' }}>Coming Soon...</p>
    </div>
  );
}
