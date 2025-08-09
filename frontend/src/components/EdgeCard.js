import React from 'react';

// Utility helpers for consistent badge colours
const diffBg = (d) => d === 'easy' ? '#28a745' : d === 'medium' ? '#ffc107' : '#dc3545';
const diffFg = (d) => d === 'medium' ? '#000' : '#fff';
const typeBg = (t) => t === 'inward' ? '#17a2b8' : t === 'lateral' ? '#ffc107' : t === 'final' ? '#dc3545' : '#6c757d';
const typeFg = (t) => t === 'lateral' ? '#000' : '#fff';

export default function EdgeCard({ edge, onSelect }) {
  if (!edge) return null;
  const {
    id,
    source,
    target,
    difficulty = 'easy',
    pathType = 'inward',
  } = edge;

  // Human-readable description
  const pathDescription = edge.pathDescription || `${source} → ${target}`;

  return (
    <div
      onClick={() => onSelect && onSelect(edge)}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '10px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'background 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{id}</span>
        <span style={{ color: '#00ff88', fontSize: '13px' }}>{pathDescription}</span>
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        <span style={{
          background: diffBg(difficulty),
          color: diffFg(difficulty),
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '11px',
          fontWeight: 'bold',
        }}>
          {difficulty.toUpperCase()}
        </span>
        <span style={{
          background: typeBg(pathType),
          color: typeFg(pathType),
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '11px',
          fontWeight: 'bold',
        }}>
          {pathType.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
