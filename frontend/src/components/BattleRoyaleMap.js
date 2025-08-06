import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

// Map radius constants - optimized for PUBG-style battle royale
const MAP_R1 = 80;   // inner ring radius
const MAP_R2 = 140;  // middle ring radius
const MAP_R3 = 200;  // outer ring radius
const MAP_BOUNDARY = 480; // total map boundary

export default function BattleRoyaleMap({ 
  gameState = {},
  onNodeClick = () => {},
  onEdgeClick = () => {},
  isMinimized = false,
  showHUD = true,
  enableZoom = false,
  enablePan = false,
  players = {}
}) {
  const cyRef = useRef(null);
  const nodeCoordsRef = useRef({});
  const canvasRef = useRef(null);
  
  // Game state
  const [gameTimer, setGameTimer] = useState(0);
  const [safeCircle, setSafeCircle] = useState(null);
  const [nextSafeCircle, setNextSafeCircle] = useState(null);
  const [blueRadius, setBlueRadius] = useState(MAP_BOUNDARY);
  const [phase, setPhase] = useState('moving'); // 'moving' | 'waiting'
  const [phaseTimer, setPhaseTimer] = useState(0);

  // Initialize safe zones
  useEffect(() => {
    if (!safeCircle) {
      const firstSafe = { x: 0, y: 0, r: MAP_R3 };
      const randomInner = (parent) => {
        const r = Math.random() * (parent.r * 0.5) + parent.r * 0.25;
        const a = Math.random() * 2 * Math.PI;
        const d = Math.random() * (parent.r - r);
        return { 
          x: parent.x + Math.cos(a) * d, 
          y: parent.y + Math.sin(a) * d, 
          r 
        };
      };
      setSafeCircle(firstSafe);
      setNextSafeCircle(randomInner(firstSafe));
    }
  }, [safeCircle]);

  // Game loop - zone shrinking mechanics
  useEffect(() => {
    const interval = setInterval(() => {
      setGameTimer(t => t + 1);
      setPhaseTimer(t => t + 1);
      
      if (!safeCircle) return;

      if (phase === 'moving') {
        const diff = blueRadius - safeCircle.r;
        if (diff <= 1) {
          setBlueRadius(safeCircle.r);
          setPhase('waiting');
          setPhaseTimer(0);
        } else {
          const perSec = diff / 60; // 60 second shrink time
          setBlueRadius(r => Math.max(safeCircle.r, r - perSec));
        }
      } else if (phase === 'waiting' && phaseTimer >= 60) {
        setSafeCircle(nextSafeCircle);
        if (nextSafeCircle.r > 20) {
          const parent = nextSafeCircle;
          const r = Math.random() * (parent.r * 0.5) + parent.r * 0.25;
          const a = Math.random() * 2 * Math.PI;
          const d = Math.random() * (parent.r - r);
          setNextSafeCircle({ 
            x: parent.x + Math.cos(a) * d, 
            y: parent.y + Math.sin(a) * d, 
            r 
          });
        } else {
          setNextSafeCircle({ x: nextSafeCircle.x, y: nextSafeCircle.y, r: 0 });
        }
        setPhase('moving');
        setPhaseTimer(0);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [phase, phaseTimer, blueRadius, safeCircle, nextSafeCircle]);

  // Canvas drawing for zones
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const resize = () => {
      const parent = canvas.parentNode;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    
    resize();
    window.addEventListener('resize', resize);
    
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      // Reset transform & clear
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,w,h);

      // Get cy viewport
      const z = cyRef.current.zoom();
      const p = cyRef.current.pan();

      // Map graph-space to canvas
      ctx.setTransform(
        z, 0,
        0, z,
        p.x + w/2,
        p.y + h/2
      );

      // Boundary
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4 / z;
      ctx.setLineDash([]);
      ctx.strokeRect(-MAP_BOUNDARY, -MAP_BOUNDARY, MAP_BOUNDARY*2, MAP_BOUNDARY*2);

      // Safe circle
      if (safeCircle) {
        ctx.beginPath();
        ctx.arc(safeCircle.x, safeCircle.y, safeCircle.r, 0, 2*Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / z;
        ctx.setLineDash([10/z, 5/z]);
        ctx.stroke();

        // Next safe preview
        if (nextSafeCircle && phase === 'waiting') {
          ctx.beginPath();
          ctx.arc(nextSafeCircle.x, nextSafeCircle.y, nextSafeCircle.r, 0, 2*Math.PI);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1 / z;
          ctx.setLineDash([3/z,3/z]);
          ctx.stroke();
        }
      }

      // Blue zone
      ctx.beginPath();
      ctx.arc(0,0, blueRadius, 0, 2*Math.PI);
      ctx.strokeStyle = phase === 'moving' ? '#ff4444' : '#4444ff';
      ctx.lineWidth = 3 / z;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = phase === 'moving' ? '#ff4444' : '#4444ff';
      ctx.fill();
      ctx.globalAlpha = 1;

      requestAnimationFrame(draw);
    };

      
      
        , safeCircle.y * scale, safeCircle.r * scale, 0, 2*Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.stroke();
      }
      
      // Draw next safe circle preview (during waiting phase)
      if (nextSafeCircle && phase === 'waiting') {
        
        ctx.beginPath();
        , nextSafeCircle.y * scale, nextSafeCircle.r * scale, 0, 2*Math.PI);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      }
      
      // Draw blue zone (deadly area)
      
      ctx.beginPath();
      ctx.arc(0, 0, blueRadius, 0, 2*Math.PI);
      ctx.strokeStyle = phase === 'moving' ? '#ff4444' : '#4444ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.stroke();
      
      // Add subtle blue zone fill
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = phase === 'moving' ? '#ff4444' : '#4444ff';
      ctx.fill();
      ctx.globalAlpha = 1;
      

    
    draw();
    return () => {
      window.removeEventListener('resize', resize);
      if (cyRef.current) {
        
      }
    };
  }, [safeCircle, nextSafeCircle, blueRadius, phase, isMinimized]);

  // Initialize Cytoscape network
  useEffect(() => {
    if (cyRef.current) cyRef.current.destroy();
    
    const polar = (r, deg) => ({ 
      x: r * Math.cos(deg * Math.PI / 180), 
      y: r * Math.sin(deg * Math.PI / 180) 
    });
    
    const nodes = [];
    const edges = [];
    
    const pushEdge = (s, t, color) => {
      edges.push({ 
        data: { id: `${s}-${t}`, source: s, target: t }, 
        style: { 'line-color': color }
      });
    };
    
    // Create TARGET (victory point)
    nodes.push({ 
      data: { id: 'TARGET', level: 0 }, 
      position: { x: 0, y: 0 }
    });
    
    // Create concentric rings
    [[1, MAP_R1], [2, MAP_R2], [3, MAP_R3]].forEach(([lvl, R]) => {
      const count = lvl === 1 ? 6 : 8;
      for (let i = 0; i < count; i++) {
        const id = `R${lvl}_${i + 1}`;
        const pos = polar(R, (i * 360) / count);
        
        nodes.push({ data: { id, level: lvl }, position: pos });
        
        // Connect inward
        if (lvl === 1) {
          pushEdge(id, 'TARGET', '#ff4444'); // Hard (red)
          pushEdge('TARGET', id, '#ff4444');
        } else {
          const innerCount = lvl === 2 ? 6 : 8;
          const targetIdx = Math.floor((i * innerCount) / count);
          const targetId = `R${lvl-1}_${targetIdx + 1}`;
          const color = lvl === 2 ? '#ffff44' : '#44ff44'; // Medium/Easy
          pushEdge(id, targetId, color);
          pushEdge(targetId, id, color);
        }
        
        // Circular connections
        if (count > 1) {
          const nextId = `R${lvl}_${((i + 1) % count) + 1}`;
          const circColor = lvl === 1 ? '#ff8844' : lvl === 2 ? '#ffff88' : '#88ff88';
          pushEdge(id, nextId, circColor);
          pushEdge(nextId, id, circColor);
        }
      }
    });
    
    // Store coordinates
    nodes.forEach(n => nodeCoordsRef.current[n.data.id] = n.position);
    
    // Initialize Cytoscape
    cyRef.current = cytoscape({
      container: document.getElementById('battle-royale-map'),
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node[id="TARGET"]',
          style: {
            'background-color': '#ff6b6b',
            'width': isMinimized ? 25 : 35,
            'height': isMinimized ? 25 : 35,
            'label': 'TARGET',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#ffffff',
            'font-size': isMinimized ? '8px' : '10px',
            'font-weight': 'bold',
            'border-width': 3,
            'border-color': '#ffffff'
          }
        },
        {
          selector: 'node[level > 0]',
          style: {
            'background-color': '#4ecdc4',
            'width': isMinimized ? 20 : 30,
            'height': isMinimized ? 20 : 30,
            'label': 'data(id)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#ffffff',
            'font-size': isMinimized ? '6px' : '8px',
            'font-weight': 'bold'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 3,
            'line-color': 'data(line-color)',
            'curve-style': 'straight',
            'opacity': 0.8
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'width': 5,
            'opacity': 1,
            'line-color': '#00ff88'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#00ff88'
          }
        }
      ],
      layout: { name: 'preset' },
      userZoomingEnabled: enableZoom,
      userPanningEnabled: enablePan,
      minZoom: 0.5,
      maxZoom: 2
    });

    // === Canvas draw uses Cytoscape viewport transform ===
    

    
    // Add interaction handlers
    cyRef.current.on('tap', 'node', (e) => {
      onNodeClick(e.target.data());
    });
    
    cyRef.current.on('tap', 'edge', (e) => {
      onEdgeClick(e.target.data());
    });
    
    // Auto-fit for different view modes
    setTimeout(() => {
      if (isMinimized) {
        cyRef.current.fit(cyRef.current.elements(), 20);
      } else {
        cyRef.current.center();
        cyRef.current.zoom(1);
      }
    }, 100);
    
    return () => {
      if (cyRef.current) cyRef.current.destroy();
    };
  }, [enableZoom, enablePan, isMinimized, onNodeClick, onEdgeClick]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      background: 'radial-gradient(circle at center, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      border: '2px solid #333',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* Game HUD */}
      {showHUD && !isMinimized && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '12px',
          border: '1px solid #444'
        }}>
          <div style={{ marginBottom: '8px', color: '#00ff88', fontWeight: 'bold' }}>🎯 BATTLE ROYALE</div>
          <div>⏱️ Time: {Math.floor(gameTimer / 60)}:{(gameTimer % 60).toString().padStart(2, '0')}</div>
          <div style={{ color: phase === 'moving' ? '#ff4444' : '#4444ff' }}>
            🔵 Zone: {phase === 'moving' ? 'SHRINKING' : 'SAFE'}
          </div>
          <div>⚠️ Phase: {Math.max(0, 60 - phaseTimer)}s</div>
          {safeCircle && (
            <div>🎯 Safe: R{Math.round(safeCircle.r)}</div>
          )}
          <div style={{ color: '#ff4444' }}>💀 Blue: R{Math.round(blueRadius)}</div>
          
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #444', fontSize: '10px' }}>
            <div>🟢 Easy Path</div>
            <div>🟡 Medium Path</div>
            <div>🔴 Hard Path</div>
            <div style={{ marginTop: '4px', color: '#ff4444' }}>⚠️ Stay in white circle!</div>
          </div>
        </div>
      )}
      
      {/* Zone overlay canvas */}
      <canvas 
        ref={canvasRef} 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          pointerEvents: 'none', 
          zIndex: 10 
        }} 
      />
      
      {/* Cytoscape map container */}
      <div 
        id="battle-royale-map" 
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'relative',
          zIndex: 5
        }}
      />
    </div>
  );
}
