import React from 'react';

export default function SafePointCard({ node }) {
  if (!node) return null;

  const { id, level } = node;

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.6)',
      border: '1px solid #00ff88',
      borderRadius: '10px',
      padding: '12px',
      color: '#fff',
      fontSize: '14px',
      maxWidth: '250px',
    }}>
      <h4 style={{ margin: '0 0 8px 0', color: '#00ff88', fontSize: '16px' }}>SAFE POINT</h4>
      <div><strong>ID:</strong> {id}</div>
      {level !== undefined && <div><strong>Ring Level:</strong> {level}</div>}
    </div>
  );
}
