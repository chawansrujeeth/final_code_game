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
    const TICK_MS = 100; // 0.1 s for smoother animation (~10 FPS)
    const interval = setInterval(() => {
      setGameTimer(t => t + TICK_MS/1000);
      setPhaseTimer(t => t + TICK_MS/1000);
      
      if (!safeCircle) return;

      if (phase === 'moving') {
        const diff = blueRadius - safeCircle.r;
        if (diff <= 1) {
          setBlueRadius(safeCircle.r);
          setPhase('waiting');
          setPhaseTimer(0);
        } else {
          const shrinkPerTick = (diff / 60) * (TICK_MS / 1000); // spread over 60 s
          setBlueRadius(r => Math.max(safeCircle.r, r - shrinkPerTick));
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
    }, TICK_MS);
    
    return () => clearInterval(interval);
  }, [phase, phaseTimer, blueRadius, safeCircle, nextSafeCircle]);

  // Canvas drawing for zones
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    
    const resize = () => {
      const parent = canvas.parentNode;
      // High-DPI canvas — keep CSS size but increase backing store
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      canvas.width = parent.clientWidth * DPR;
      canvas.height = parent.clientHeight * DPR;
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
      const cy = cyRef.current;
      if (!cy) { requestAnimationFrame(draw); return; }
      const z = cy.zoom();
      const p = cy.pan();

      // Device-pixel-ratio aware transform
      const scale = z * DPR;
      ctx.setTransform(
        scale, 0,
        0, scale,
        p.x * DPR,
        p.y * DPR
      );

      // Boundary
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([]);
      ctx.strokeRect(-MAP_BOUNDARY, -MAP_BOUNDARY, MAP_BOUNDARY*2, MAP_BOUNDARY*2);

      // Safe circle
      if (safeCircle) {
        ctx.beginPath();
        ctx.arc(safeCircle.x, safeCircle.y, safeCircle.r, 0, 2*Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash([10/scale, 5/scale]);
        ctx.stroke();

        // Next safe preview
        if (nextSafeCircle && phase === 'waiting') {
          ctx.beginPath();
          ctx.arc(nextSafeCircle.x, nextSafeCircle.y, nextSafeCircle.r, 0, 2*Math.PI);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1 / scale;
          ctx.setLineDash([3/scale, 3/scale]);
          ctx.stroke();
        }
      }

      // Blue zone
      ctx.beginPath();
      ctx.arc(safeCircle ? safeCircle.x : 0, safeCircle ? safeCircle.y : 0, blueRadius, 0, 2*Math.PI);
      ctx.strokeStyle = phase === 'moving' ? '#ff4444' : '#4444ff';
      ctx.lineWidth = 3 / scale;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = phase === 'moving' ? '#ff4444' : '#4444ff';
      ctx.fill();
      ctx.globalAlpha = 1;

      // Keep drawing for zone updates
      requestAnimationFrame(draw);
    };

    const cy = cyRef.current;
    if (cy) {
      cy.on('render', draw);
      // Kickstart the draw loop at least once so animation runs even without user interaction
      draw();
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (cyRef.current) {
        cyRef.current.removeListener('render', draw);
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
          // Use angular mapping for even distribution between rings
          const targetIdx = Math.round((i / count) * innerCount) % innerCount;
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

    // === Viewport constraints ===
    const containerEl = document.getElementById('battle-royale-map');
    const calcMinZoom = () => Math.min(containerEl.clientWidth, containerEl.clientHeight) / (MAP_BOUNDARY * 2);
    let initialMinZoom = calcMinZoom();
    
    // Initialize Cytoscape
    cyRef.current = cytoscape({
      container: containerEl,
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
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: initialMinZoom,
      maxZoom: 2
    });

    // Lock center and enforce initial min zoom
    cyRef.current.center();
    // Prevent nodes from being dragged
    cyRef.current.nodes().ungrabify();
    if (cyRef.current.zoom() < initialMinZoom) {
      cyRef.current.zoom(initialMinZoom);
    }

    // === Canvas draw uses Cytoscape viewport transform ===

    // Recalculate minZoom on window resize
    const handleResizeCy = () => {
      initialMinZoom = calcMinZoom();
      cyRef.current.minZoom(initialMinZoom);
      if (cyRef.current.zoom() < initialMinZoom) {
        cyRef.current.zoom(initialMinZoom);
      }
    };
    window.addEventListener('resize', handleResizeCy);
    

    
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
      window.removeEventListener('resize', handleResizeCy);
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
