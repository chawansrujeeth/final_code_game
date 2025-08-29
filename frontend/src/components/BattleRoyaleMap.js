import React, { useEffect, useRef, useState } from 'react';

import cytoscape from 'cytoscape';

// Global map state key to persist across component unmounts (e.g. when toggling
// minimap/full-screen). This prevents the zone timer from restarting and keeps
// the blue-zone progression in sync for the current client.
const MAP_STATE_KEY = '__BR_MAP_STATE__';
if (typeof window !== 'undefined') {
  window[MAP_STATE_KEY] = window[MAP_STATE_KEY] || {};
}
// Inject global animation styles once
if (typeof document !== 'undefined' && !document.getElementById('br-map-anim-style')) {
  const style = document.createElement('style');
  style.id = 'br-map-anim-style';
  style.innerHTML = `
    @keyframes timerPulse {
      0%   { transform: scale(1); color: #ffffff; }
      50%  { transform: scale(1.02); color: #b2ffd9; }
      100% { transform: scale(1); color: #ffffff; }
    }
  `;
  document.head.appendChild(style);
}

// Map radius constants - optimized for PUBG-style battle royale
const MAP_R1 = 80;   // inner ring radius
const MAP_R2 = 140;  // middle ring radius
const MAP_R3 = 200;  // outer ring radius
const MAP_R4 = 260;  // ring 4 radius
const MAP_R5 = 340;  // ring 5 radius
const MAP_BOUNDARY = 480; // total map boundary

// Timing (can tune later)
const SHRINK_SECONDS = 30; // duration the blue zone takes to reach safe circle
const WAIT_SECONDS = 30;   // waiting time before next shrink

export default function BattleRoyaleMap({ 
  zoneState = null,
  gameState = {},
  onNodeClick = () => {},
  onEdgeClick = () => {},
  isMinimized = false,
  showHUD = true,
  enableZoom = false,
  enablePan = false,
  players = {},
  lobbySelections = [],
  selfPlayerId = null,
  // When provided, only these node IDs are clickable; also highlighted
  allowedNodeIds = null,
  // Map selection: 1 = original radial, 2 = BGMI Erangel style
  mapType = 1,
  // Accessible edges that should be highlighted
  accessibleEdges = []
  }) {
  const cyRef = useRef(null);
  const nodeCoordsRef = useRef({});
  const canvasRef = useRef(null);
  const allowedNodeIdsRef = useRef(null);
  useEffect(() => { allowedNodeIdsRef.current = allowedNodeIds; }, [allowedNodeIds]);
  
  // Game state (client-driven if zoneState not provided)
  // Use persisted values (if any) so the timer/zone state does not reset when the
// map component unmounts/remounts (e.g. when toggling minimap ↔ full-screen).
const persisted = typeof window !== 'undefined' ? window[MAP_STATE_KEY] : {};

const [gameTimer, setGameTimer] = useState(persisted.gameTimer || 0);
  const [safeCircle, setSafeCircle] = useState(persisted.safeCircle || null);
  const [nextSafeCircle, setNextSafeCircle] = useState(persisted.nextSafeCircle || null);
  const [blueRadius, setBlueRadius] = useState(persisted.blueRadius || MAP_BOUNDARY);
  const [phase, setPhase] = useState(persisted.phase || 'moving'); // 'moving' | 'waiting'
  const [phaseTimer, setPhaseTimer] = useState(persisted.phaseTimer || 0);
  // Markers
  const [markers, setMarkers] = useState([]);
  const [markerMode, setMarkerMode] = useState(false);

  // Derived values for HUD animations
  const phaseTotal = phase === 'moving' ? SHRINK_SECONDS : WAIT_SECONDS;
  const markerModeRef = useRef(false);
  useEffect(() => { markerModeRef.current = markerMode; }, [markerMode]);

  // Initialize safe zones
  useEffect(() => {
    if (!safeCircle) {
      const firstSafe = { x: 0, y: 0, r: MAP_R5 };
      const randomInner = (parent) => {
        const scale = 0.8 + Math.random() * 0.1; // 80% - 90%
        const r = parent.r * scale;
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

  // ---------------------------------------------------------------------------
  // Game loop - zone shrinking mechanics (only run if this client is driving)
  // ---------------------------------------------------------------------------
  const serverControlled = zoneState !== null;
  useEffect(() => {
    if (!serverControlled) return; // when server controls, just mirror updates
  }, [serverControlled]);

  // Existing effect below only if !serverControlled
  useEffect(() => {
    if (serverControlled) return; // skip local progression when server authoritative
    const TICK_MS = 50; // 0.05 s for smoother animation (~20 FPS)
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
          const shrinkPerTick = (diff / SHRINK_SECONDS) * (TICK_MS / 1000);
          setBlueRadius(r => Math.max(safeCircle.r, r - shrinkPerTick));
        }
      } else if (phase === 'waiting' && phaseTimer >= WAIT_SECONDS) {
        setSafeCircle(nextSafeCircle);
        if (nextSafeCircle.r > 20) {
          const parent = nextSafeCircle;
          const scale = 0.8 + Math.random() * 0.1; // 80% - 90%
          const r = parent.r * scale;
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
  }, [serverControlled, phase, phaseTimer, blueRadius, safeCircle, nextSafeCircle]);

// Sync from server zoneState
useEffect(() => {
  if (!zoneState) return;
  setSafeCircle(zoneState.safeCircle);
  setNextSafeCircle(zoneState.nextSafeCircle);
  setBlueRadius(zoneState.blueRadius);
  setPhase(zoneState.phase);
  setPhaseTimer(zoneState.phaseTimer);
  // Note: gameTimer may diverge; keep local
}, [zoneState]);

// -----------------------------------------------------------------------------
// Persist the latest timer/zone state to the global object so it can be reused
// by the next BattleRoyaleMap instance on this page.
// -----------------------------------------------------------------------------
useEffect(() => {
  if (typeof window === 'undefined') return;
  const g = window[MAP_STATE_KEY];
  g.gameTimer = gameTimer;
  g.safeCircle = safeCircle;
  g.nextSafeCircle = nextSafeCircle;
  g.blueRadius = blueRadius;
  g.phase = phase;
  g.phaseTimer = phaseTimer;
}, [gameTimer, safeCircle, nextSafeCircle, blueRadius, phase, phaseTimer]);

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

      // Boundary - show for both map types
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([]);
      if (mapType === 2) {
        // For BGMI Erangel map, create a boundary that encompasses all nodes
        const boundarySize = 400; // Slightly larger than the node spread
        ctx.strokeRect(-boundarySize, -boundarySize, boundarySize*2, boundarySize*2);
      } else {
        // Original boundary for Map 1
        ctx.strokeRect(-MAP_BOUNDARY, -MAP_BOUNDARY, MAP_BOUNDARY*2, MAP_BOUNDARY*2);
      }

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
      ctx.strokeStyle = phase === 'moving' ? '#4444ff' : '#ff4444';
      ctx.lineWidth = 3 / scale;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = phase === 'moving' ? '#4444ff' : '#ff4444';
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

  // Helper function to create BGMI Erangel-style irregular network
  const createErangelNetwork = () => {
    const nodes = [];
    const edges = [];
    
    // Define irregular node positions inspired by BGMI Erangel map
    const nodePositions = [
      // Top row
      { id: 'N1', x: -200, y: -150 },
      { id: 'N2', x: -50, y: -180 },
      { id: 'N3', x: 100, y: -160 },
      { id: 'N4', x: 250, y: -140 },
      
      // Second row
      { id: 'N5', x: -250, y: -50 },
      { id: 'N6', x: -100, y: -80 },
      { id: 'N7', x: 80, y: -60 },
      { id: 'N8', x: 200, y: -40 },
      { id: 'N9', x: 300, y: -20 },
      
      // Middle row
      { id: 'N10', x: -180, y: 40 },
      { id: 'N11', x: -30, y: 20 },
      { id: 'N12', x: 120, y: 50 },
      { id: 'N13', x: 280, y: 60 },
      
      // Fourth row
      { id: 'N14', x: -220, y: 140 },
      { id: 'N15', x: -70, y: 120 },
      { id: 'N16', x: 90, y: 150 },
      { id: 'N17', x: 240, y: 130 },
      
      // Bottom row
      { id: 'N18', x: -150, y: 220 },
      { id: 'N19', x: 50, y: 240 },
      { id: 'N20', x: 200, y: 210 }
    ];
    
    // Create all nodes with uniform properties
    nodePositions.forEach(pos => {
      nodes.push({
        data: { id: pos.id, type: 'location', level: 1 },
        position: { x: pos.x, y: pos.y }
      });
    });
    
    // Define connections inspired by the reference image
    const connections = [
      // Top connections
      ['N1', 'N2'], ['N2', 'N3'], ['N3', 'N4'],
      ['N1', 'N5'], ['N2', 'N6'], ['N3', 'N7'], ['N4', 'N8'],
      
      // Second row connections
      ['N5', 'N6'], ['N6', 'N7'], ['N7', 'N8'], ['N8', 'N9'],
      ['N5', 'N10'], ['N6', 'N11'], ['N7', 'N12'], ['N8', 'N13'], ['N9', 'N13'],
      
      // Middle connections
      ['N10', 'N11'], ['N11', 'N12'], ['N12', 'N13'],
      ['N10', 'N14'], ['N11', 'N15'], ['N12', 'N16'], ['N13', 'N17'],
      
      // Fourth row connections
      ['N14', 'N15'], ['N15', 'N16'], ['N16', 'N17'],
      ['N14', 'N18'], ['N15', 'N19'], ['N16', 'N19'], ['N17', 'N20'],
      
      // Bottom connections
      ['N18', 'N19'], ['N19', 'N20'],
      
      // Some diagonal/cross connections for complexity
      ['N6', 'N12'], ['N11', 'N16'], ['N7', 'N13'], ['N2', 'N11'],
      ['N15', 'N12'], ['N10', 'N6'], ['N16', 'N13']
    ];
    
    // Create all edges with uniform properties and random question IDs
    connections.forEach(([source, target]) => {
      const questionId = Math.floor(Math.random() * 1000) + 1;
      edges.push({
        data: { 
          id: `${source}-${target}`, 
          source, 
          target, 
          type: 'path',
          question_id: questionId
        }
      });
    });
    
    return { nodes, edges };
  };

  // Helper function to create original radial network
  const createRadialNetwork = () => {
    const polar = (r, deg) => ({ 
      x: r * Math.cos(deg * Math.PI / 180), 
      y: r * Math.sin(deg * Math.PI / 180) 
    });
    
    const nodes = [];
    const edges = [];
    
    const pushEdge = (s, t, color) => {
      edges.push({ 
        data: { id: `${s}-${t}`, source: s, target: t }, 
        style: { }
      });
    };
    
    // Create TARGET (victory point)
    nodes.push({ 
      data: { id: 'TARGET', level: 0 }, 
      position: { x: 0, y: 0 }
    });
    
    // Create concentric rings
    [[1, MAP_R1], [2, MAP_R2], [3, MAP_R3], [4, MAP_R4], [5, MAP_R5]].forEach(([lvl, R]) => {
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
    
    return { nodes, edges };
  };

  // Initialize Cytoscape network
  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Build elements for selected map type
    const net = mapType === 2 ? createErangelNetwork() : createRadialNetwork();
    const nodes = net.nodes;
    const edges = net.edges;

    // Cache node coordinates for player markers
    nodeCoordsRef.current = {};
    nodes.forEach(n => {
      if (n && n.data && n.data.id && n.position) {
        nodeCoordsRef.current[n.data.id] = { x: n.position.x, y: n.position.y };
      }
    });

    const containerEl = document.getElementById('battle-royale-map');

    // Compute the minimum zoom so the boundary fits the viewport
    const calcMinZoom = () => {
      if (!containerEl) return 0.1;
      const pad = 40; // small padding
      const w = Math.max(1, containerEl.clientWidth - pad);
      const h = Math.max(1, containerEl.clientHeight - pad);
      const boundary = mapType === 2 ? 400 : MAP_BOUNDARY; // tighter boundary for Erangel
      const totalW = boundary * 2;
      const totalH = boundary * 2;
      const kx = w / totalW;
      const ky = h / totalH;
      return Math.min(1, Math.min(kx, ky));
    };

    let initialMinZoom = calcMinZoom();

    cyRef.current = cytoscape({
      container: containerEl,
      elements: [...nodes, ...edges],
      style: (mapType === 2 ? [
        {
          selector: 'node',
          style: {
            'background-color': '#34495e',
            'width': isMinimized ? 20 : 30,
            'height': isMinimized ? 20 : 30,
            'label': 'data(id)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#ffffff',
            'font-size': isMinimized ? '6px' : '8px',
            'font-weight': 'bold',
            'border-width': 2,
            'border-color': '#2c3e50'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#7f8c8d',
            'curve-style': 'straight',
            'opacity': 0.8
          }
        },
      ] : [
        // Map 1 (Original Radial)
        {
          selector: 'node[id="TARGET"]',
          style: {
            'background-color': '#ff6b6b',
            'width': isMinimized ? 25 : 35,
            'height': isMinimized ? 25 : 35,
            'label': '',
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
            'label': '',
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
            'line-color': '#aaaaaa',
            'curve-style': 'straight',
            'opacity': 0.8
          }
        }
      ]).concat([
        {
          selector: 'node[spawnAvailable]',
          style: {
            'border-width': 3,
            'border-color': '#00ff88',
            'box-shadow': '0 0 8px #00ff88'
          }
        },
        {
          selector: 'node[lobbySelected]',
          style: {
            'border-width': 6,
            'border-color': 'data(lobbySelectedColor)'
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
          selector: 'edge[accessible]',
          style: {
            'width': 6,
            'line-color': '#00ff88',
            'line-style': 'solid',
            'opacity': 1,
            'z-index': 999,
            'shadow-blur': 15,
            'shadow-color': '#00ff88',
            'shadow-opacity': 0.8
          }
        },
        {
          selector: 'edge[currentPlayerEdge]',
          style: {
            'width': 8,
            'line-color': '#ff6b35',
            'line-style': 'solid',
            'opacity': 1,
            'z-index': 1000,
            'shadow-blur': 20,
            'shadow-color': '#ff6b35',
            'shadow-opacity': 1
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#00ff88'
          }
        },
        {
          selector: 'node[currentPlayer]',
          style: {
            'border-width': 5,
            'border-color': '#ff6b35',
            'box-shadow': '0 0 20px #ff6b35',
            'background-color': '#ff6b35'
          }
        },
        {
          selector: 'node[marker]',
          style: {
            'background-color': '#ffeb3b',
            'shape': 'star',
            'width': 16,
            'height': 16,
            'border-width': 0
          }
        },
        {
          selector: 'node[playerMarker]',
          style: {
            'background-color': 'data(color)',
            'shape': 'ellipse',
            'width': isMinimized ? 12 : 18,
            'height': isMinimized ? 12 : 18,
            'border-width': 2,
            'border-color': '#222',
            'label': 'data(label)',
            'font-size': isMinimized ? '6px' : '8px',
            'color': '#111',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.8,
            'text-background-shape': 'roundrectangle'
          }
        }
      ]),
      layout: { name: 'preset' },
      userZoomingEnabled: enableZoom && !isMinimized,
      userPanningEnabled: enablePan && !isMinimized,
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
      const id = e.target.id();
      const allow = allowedNodeIdsRef.current;
      if (Array.isArray(allow) && allow.length > 0 && !allow.includes(id)) {
        return; // ignore clicks on disallowed nodes when restricted
      }
      const data = e.target.data();
      const payload = { id, ...data };
      onNodeClick(payload);
    });

    cyRef.current.on('tap', 'edge', (e) => {
      onEdgeClick(e.target.data());
    });

    // Generic tap for placing markers when in marker mode
    cyRef.current.on('tap', (e) => {
      if (isMinimized) return; // Disable marker placement in minimap
      if (markerModeRef.current) {
        const id = `MARK_${Date.now()}`;
        const pos = e.position;
        cyRef.current.add({ group: 'nodes', data: { id, marker: true }, position: pos });
        setMarkers(prev => [...prev, id]);
        setMarkerMode(false);
      }
    });

    // Dynamic panning when zoomed in (expanded map only)
    let onZoomHandler = null;
    if (!isMinimized) {
      const applyPanning = () => {
        const z = cyRef.current.zoom();
        cyRef.current.userPanningEnabled(enablePan && z > 1.05);
      };
      applyPanning();
      onZoomHandler = () => applyPanning();
      cyRef.current.on('zoom', onZoomHandler);
    }

    // Auto-fit for different view modes
    setTimeout(() => {
      if (isMinimized) {
        // Center minimap on the self player with some surrounding nodes
        const cy = cyRef.current;
        let focus;
        if (selfPlayerId && players && players[selfPlayerId]) {
          const markerNode = cy.$(`#PLAYER_${selfPlayerId}`);
          if (markerNode && markerNode.length) {
            focus = markerNode;
          } else {
            const nodeId = players[selfPlayerId].currentNode;
            if (nodeId) focus = cy.$(`#${nodeId}`);
          }
        }
        // Fallback to random node if self not found yet
        if (!focus || !focus.length) {
          const candidates = cy.nodes('[level > 0]');
          focus = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : cy.$('#TARGET');
        }
        const viewSet = focus.closedNeighborhood();
        cy.fit(viewSet, 40);
        cy.zoom(Math.min(cy.maxZoom(), cy.zoom() * 1.2));
        cy.center(focus);
      } else {
        cyRef.current.center();
        cyRef.current.zoom(1);
      }
    }, 100);

    // Clear markers when switching to minimap view
    if (isMinimized && markers.length) {
      markers.forEach(id => cyRef.current.$(`#${id}`).remove());
      setMarkers([]);
      setMarkerMode(false);
    }

    return () => {
      window.removeEventListener('resize', handleResizeCy);
      if (cyRef.current) {
        if (onZoomHandler) cyRef.current.removeListener('zoom', onZoomHandler);
        cyRef.current.destroy();
      }
    };
  }, [enableZoom, enablePan, isMinimized, mapType]);

  // Update accessible edges highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear all accessible and current player flags first
    cy.edges().forEach(e => {
      if (e.data('accessible')) {
        e.removeData('accessible');
      }
      if (e.data('currentPlayerEdge')) {
        e.removeData('currentPlayerEdge');
      }
    });

    // Mark accessible edges with glow effect
    if (accessibleEdges && accessibleEdges.length > 0) {
      accessibleEdges.forEach(edge => {
        const edgeId = edge.edgeId || edge.id || `${edge.fromNode || edge.source}-${edge.toNode || edge.target}`;
        const cyEdge = cy.$(`edge[id="${edgeId}"]`);
        if (cyEdge.length > 0) {
          cyEdge.data('accessible', true);
          // Add special highlighting for current player's edges
          if (edge.fromNode && players[selfPlayerId] && players[selfPlayerId].currentNode === edge.fromNode) {
            cyEdge.data('currentPlayerEdge', true);
          }
        }
        
        // Also check reverse edge for undirected graph
        const reverseId = `${edge.toNode || edge.target}-${edge.fromNode || edge.source}`;
        const reverseEdge = cy.$(`edge[id="${reverseId}"]`);
        if (reverseEdge.length > 0) {
          reverseEdge.data('accessible', true);
          if (edge.fromNode && players[selfPlayerId] && players[selfPlayerId].currentNode === edge.fromNode) {
            reverseEdge.data('currentPlayerEdge', true);
          }
        }
      });
    }
  }, [accessibleEdges, players, selfPlayerId]);

  // Update current player node highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear all current player node flags first
    cy.nodes().forEach(n => {
      if (n.data('currentPlayer')) {
        n.removeData('currentPlayer');
      }
    });

    // Highlight current player's node
    if (selfPlayerId && players[selfPlayerId] && players[selfPlayerId].currentNode) {
      const currentNode = players[selfPlayerId].currentNode;
      const cyNode = cy.$(`node[id="${currentNode}"]`);
      if (cyNode.length > 0) {
        cyNode.data('currentPlayer', true);
      }
    }
  }, [players, selfPlayerId]);

  // Update lobby selection highlights on nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear previous selection flags
    cy.nodes().forEach(n => {
      if (n.data('lobbySelected')) {
        n.removeData('lobbySelected');
        n.removeData('lobbySelectedColor');
      }
    });

    const selfColor = '#00ff88';
    const otherColor = '#ff5555';

    (lobbySelections || []).forEach(sel => {
      const node = cy.$(`#${sel.nodeId}`);
      if (node && node.length) {
        node.data('lobbySelected', true);
        node.data('lobbySelectedColor', sel.playerId === selfPlayerId ? selfColor : otherColor);
      }
    });
  }, [lobbySelections, selfPlayerId]);
  
  // Highlight allowed spawn nodes if provided
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach(n => {
      const id = n.id();
      if (Array.isArray(allowedNodeIds) && allowedNodeIds.includes(id)) {
        n.data('spawnAvailable', true);
      } else if (n.data('spawnAvailable')) {
        n.removeData('spawnAvailable');
      }
    });
  }, [allowedNodeIds]);

  // Sync player markers to Cytoscape based on players' currentNode positions
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const palette = ['#ff3b30', '#007aff', '#34c759', '#ffcc00', '#af52de', '#ff9f0a', '#32ade6', '#ff453a'];

    // Build desired marker set and upsert markers
    const desired = new Set();
    const entries = Object.entries(players || {});

    entries.forEach(([playerId, pdata], idx) => {
      if (!pdata || pdata.isAlive === false) return;
      const nodeId = pdata.currentNode;
      if (!nodeId) return;
      const pos = nodeCoordsRef.current[nodeId];
      if (!pos) return;

      const markerId = `PLAYER_${playerId}`;
      desired.add(markerId);

      const color = pdata.color || palette[idx % palette.length];
      const labelSource = pdata.alias || pdata.name || playerId;
      const label = labelSource && typeof labelSource === 'string'
        ? (labelSource.length > 6 ? labelSource.slice(-4).toUpperCase() : labelSource)
        : String(playerId).slice(-4).toUpperCase();

      const existing = cy.$(`#${markerId}`);
      if (existing && existing.length) {
        existing.position(pos);
        existing.data('playerMarker', true);
        existing.data('label', label);
        existing.data('color', color);
      } else {
        cy.add({ group: 'nodes', data: { id: markerId, playerMarker: true, label, color }, position: pos });
      }
    });

    // Remove stale markers
    cy.$('node[playerMarker]').forEach(n => {
      if (!desired.has(n.id())) n.remove();
    });
  }, [players, isMinimized]);

  // Recenter minimap whenever the self player moves or minimap toggles
  useEffect(() => {
    if (!isMinimized) return;
    const cy = cyRef.current;
    if (!cy) return;
    if (!selfPlayerId || !players || !players[selfPlayerId]) return;

    const markerNode = cy.$(`#PLAYER_${selfPlayerId}`);
    const focus = (markerNode && markerNode.length) ? markerNode : cy.$(`#${players[selfPlayerId].currentNode}`);
    if (!focus || !focus.length) return;

    const viewSet = focus.closedNeighborhood();
    cy.fit(viewSet, 40);
    cy.zoom(Math.min(cy.maxZoom(), cy.zoom() * 1.2));
    cy.center(focus);
  }, [players, selfPlayerId, isMinimized]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      background: '#fff8dc',
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
          padding: '8px',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '11px',
          border: '1px solid #444'
        }}>
          <div style={{ marginBottom: '8px', color: '#00ff88', fontWeight: 'bold', fontSize: '10px' }}>🎯 BATTLE ROYALE</div>
          {/* Compact match timer (pill) */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid #333', borderRadius: '999px', padding: '2px 8px', lineHeight: 1 }}>
            <span style={{ opacity: 0.9 }}>⏱️</span>
            <span style={{ display: 'inline-block', animation: 'timerPulse 2s ease-in-out infinite', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px', fontWeight: 700 }}>
              {Math.floor(gameTimer / 60)}:{Math.floor(gameTimer % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div style={{ color: phase === 'moving' ? '#4444ff' : '#ff4444' }}>
            🔵 Zone: {phase === 'moving' ? 'SHRINKING' : 'SAFE'}
          </div>
          {/* Phase countdown with progress bar */}
          <div style={{ width: '120px' }}>
            <div style={{ fontSize: '10px' }}>⚠️ Phase: {Math.floor(Math.max(0, phaseTotal - phaseTimer))}s</div>
            <div style={{ width: '100%', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
              <div style={{ width: `${(1 - Math.min(phaseTimer / phaseTotal, 1)) * 100}%`, height: '100%', background: phase === 'moving' ? '#4444ff' : '#ff4444', transition: 'width 1s linear' }} />
            </div>
          </div>
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
      
      {/* Marker controls */}
      {!isMinimized && (
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 1000, display: 'flex', gap: '6px' }}>
          {!markerMode ? (
            <button onClick={() => setMarkerMode(true)} style={{ padding: '4px 8px', fontSize: '10px' }}>MARK</button>
          ) : (
            <span style={{ background: '#fff', padding: '2px 4px', fontSize: '10px' }}>Tap map…</span>
          )}
          {markers.length > 0 && (
            <button onClick={() => {
              markers.forEach(id => cyRef.current.$(`#${id}`).remove());
              setMarkers([]);
            }} style={{ padding: '4px 8px', fontSize: '10px' }}>CLEAR</button>
          )}
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
