import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

// Global map state key to persist across component unmounts
const CITY_MAP_STATE_KEY = '__CITY_BR_MAP_STATE__';
if (typeof window !== 'undefined') {
  window[CITY_MAP_STATE_KEY] = window[CITY_MAP_STATE_KEY] || {};
}

// Inject global animation styles once
if (typeof document !== 'undefined' && !document.getElementById('city-br-map-anim-style')) {
  const style = document.createElement('style');
  style.id = 'city-br-map-anim-style';
  style.innerHTML = `
    @keyframes cityTimerPulse {
      0%   { transform: scale(1); color: #ffffff; }
      50%  { transform: scale(1.08); color: #00ff88; }
      100% { transform: scale(1); color: #ffffff; }
    }
    @keyframes cityNameGlow {
      0%   { text-shadow: 0 0 5px rgba(255, 255, 255, 0.8); }
      50%  { text-shadow: 0 0 15px rgba(255, 255, 255, 1), 0 0 25px rgba(0, 255, 136, 0.5); }
      100% { text-shadow: 0 0 5px rgba(255, 255, 255, 0.8); }
    }
  `;
  document.head.appendChild(style);
}

// City map constants - larger scale for city layout
const CITY_MAP_WIDTH = 800;
const CITY_MAP_HEIGHT = 600;
const CITY_BOUNDARY = 400;

// Timing constants
const SHRINK_SECONDS = 30;
const WAIT_SECONDS = 30;

// City names and their approximate positions
const CITY_NAMES = [
  { name: "Los Angeles", x: -250, y: 150, style: { color: '#FFD700', fontSize: '14px', fontWeight: 'bold' } },
  { name: "Sundown Valley", x: 200, y: -180, style: { color: '#FF6B6B', fontSize: '12px' } },
  { name: "Vegas Strip", x: -150, y: -200, style: { color: '#4ECDC4', fontSize: '13px', fontWeight: 'bold' } },
  { name: "Miami Beach", x: 250, y: 180, style: { color: '#45B7D1', fontSize: '12px' } },
  { name: "Chicago Downtown", x: -50, y: 50, style: { color: '#96CEB4', fontSize: '11px' } },
  { name: "New York Central", x: 100, y: -50, style: { color: '#FFEAA7', fontSize: '13px', fontWeight: 'bold' } },
  { name: "Phoenix Desert", x: -300, y: -100, style: { color: '#DDA0DD', fontSize: '10px' } },
  { name: "Seattle Harbor", x: 150, y: 100, style: { color: '#98D8C8', fontSize: '11px' } }
];

export default function CityBattleRoyaleMap({ 
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
  allowedNodeIds = null
}) {
  const cyRef = useRef(null);
  const nodeCoordsRef = useRef({});
  const canvasRef = useRef(null);
  const allowedNodeIdsRef = useRef(null);
  useEffect(() => { allowedNodeIdsRef.current = allowedNodeIds; }, [allowedNodeIds]);
  
  // Game state persistence
  const persisted = typeof window !== 'undefined' ? window[CITY_MAP_STATE_KEY] : {};
  
  const [gameTimer, setGameTimer] = useState(persisted.gameTimer || 0);
  const [safeCircle, setSafeCircle] = useState(persisted.safeCircle || null);
  const [nextSafeCircle, setNextSafeCircle] = useState(persisted.nextSafeCircle || null);
  const [blueRadius, setBlueRadius] = useState(persisted.blueRadius || CITY_BOUNDARY);
  const [phase, setPhase] = useState(persisted.phase || 'moving');
  const [phaseTimer, setPhaseTimer] = useState(persisted.phaseTimer || 0);
  const [markers, setMarkers] = useState([]);
  const [markerMode, setMarkerMode] = useState(false);

  const phaseTotal = phase === 'moving' ? SHRINK_SECONDS : WAIT_SECONDS;
  const markerModeRef = useRef(false);
  useEffect(() => { markerModeRef.current = markerMode; }, [markerMode]);

  // Initialize safe zones
  useEffect(() => {
    if (!safeCircle) {
      const firstSafe = { x: 0, y: 0, r: 300 };
      const randomInner = (parent) => {
        const scale = 0.75 + Math.random() * 0.15;
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

  // Game loop for zone mechanics
  const serverControlled = zoneState !== null;
  useEffect(() => {
    if (serverControlled) return;
    
    const interval = setInterval(() => {
      setGameTimer(prev => {
        const newTimer = prev + 1;
        if (typeof window !== 'undefined') {
          window[CITY_MAP_STATE_KEY].gameTimer = newTimer;
        }
        return newTimer;
      });
      
      setPhaseTimer(prev => {
        const newPhaseTimer = prev + 1;
        if (typeof window !== 'undefined') {
          window[CITY_MAP_STATE_KEY].phaseTimer = newPhaseTimer;
        }
        return newPhaseTimer;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [serverControlled]);

  // Phase transitions
  useEffect(() => {
    if (serverControlled) return;
    
    if (phaseTimer >= phaseTotal) {
      if (phase === 'waiting') {
        setPhase('moving');
        setSafeCircle(nextSafeCircle);
        const newNext = nextSafeCircle ? {
          x: nextSafeCircle.x + (Math.random() - 0.5) * 50,
          y: nextSafeCircle.y + (Math.random() - 0.5) * 50,
          r: Math.max(50, nextSafeCircle.r * (0.7 + Math.random() * 0.2))
        } : null;
        setNextSafeCircle(newNext);
      } else {
        setPhase('waiting');
      }
      setPhaseTimer(0);
      
      if (typeof window !== 'undefined') {
        window[CITY_MAP_STATE_KEY].phase = phase === 'waiting' ? 'moving' : 'waiting';
        window[CITY_MAP_STATE_KEY].phaseTimer = 0;
      }
    }
  }, [phaseTimer, phaseTotal, phase, nextSafeCircle, serverControlled]);

  // Blue zone shrinking
  useEffect(() => {
    if (serverControlled || phase !== 'moving' || !safeCircle) return;
    
    const interval = setInterval(() => {
      setBlueRadius(prev => {
        const target = safeCircle.r;
        const diff = prev - target;
        if (Math.abs(diff) < 1) return target;
        const newRadius = prev - diff * 0.03;
        
        if (typeof window !== 'undefined') {
          window[CITY_MAP_STATE_KEY].blueRadius = newRadius;
        }
        return newRadius;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [phase, safeCircle, serverControlled]);

  // Create city layout
  const createCityLayout = () => {
    const nodes = [];
    const edges = [];
    
    // Create a grid-like city structure with main roads and intersections
    const gridSize = 7; // 7x7 grid for a bigger city
    const spacing = 80;
    const centerOffset = { x: 0, y: 0 };
    
    // Generate intersection nodes (junctions)
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = centerOffset.x + (i - Math.floor(gridSize / 2)) * spacing;
        const y = centerOffset.y + (j - Math.floor(gridSize / 2)) * spacing;
        const nodeId = `JUNCTION_${i}_${j}`;
        
        // Add some randomness to make it more organic
        const randomX = x + (Math.random() - 0.5) * 20;
        const randomY = y + (Math.random() - 0.5) * 20;
        
        nodes.push({
          data: { 
            id: nodeId,
            label: `Junction ${i}-${j}`,
            type: 'junction'
          },
          position: { x: randomX, y: randomY }
        });
      }
    }
    
    // Add spawn points around the perimeter
    const spawnPoints = [
      { id: 'SPAWN_1', x: -280, y: -200, label: 'North Gate' },
      { id: 'SPAWN_2', x: 280, y: -200, label: 'Northeast Gate' },
      { id: 'SPAWN_3', x: 280, y: 0, label: 'East Gate' },
      { id: 'SPAWN_4', x: 280, y: 200, label: 'Southeast Gate' },
      { id: 'SPAWN_5', x: 0, y: 280, label: 'South Gate' },
      { id: 'SPAWN_6', x: -280, y: 200, label: 'Southwest Gate' },
      { id: 'SPAWN_7', x: -280, y: 0, label: 'West Gate' },
      { id: 'SPAWN_8', x: 0, y: -280, label: 'Northwest Gate' }
    ];
    
    spawnPoints.forEach(spawn => {
      nodes.push({
        data: { 
          id: spawn.id,
          label: spawn.label,
          type: 'spawn'
        },
        position: { x: spawn.x, y: spawn.y }
      });
    });
    
    // Create road connections (edges)
    // Horizontal roads
    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize - 1; i++) {
        const source = `JUNCTION_${i}_${j}`;
        const target = `JUNCTION_${i + 1}_${j}`;
        edges.push({
          data: { 
            id: `ROAD_H_${i}_${j}`,
            source,
            target,
            type: 'road',
            difficulty: getRandomDifficulty()
          }
        });
      }
    }
    
    // Vertical roads
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize - 1; j++) {
        const source = `JUNCTION_${i}_${j}`;
        const target = `JUNCTION_${i}_${j + 1}`;
        edges.push({
          data: { 
            id: `ROAD_V_${i}_${j}`,
            source,
            target,
            type: 'road',
            difficulty: getRandomDifficulty()
          }
        });
      }
    }
    
    // Connect spawn points to nearest junctions
    const spawnConnections = [
      { spawn: 'SPAWN_1', junction: 'JUNCTION_1_0' },
      { spawn: 'SPAWN_2', junction: 'JUNCTION_5_0' },
      { spawn: 'SPAWN_3', junction: 'JUNCTION_6_3' },
      { spawn: 'SPAWN_4', junction: 'JUNCTION_5_6' },
      { spawn: 'SPAWN_5', junction: 'JUNCTION_3_6' },
      { spawn: 'SPAWN_6', junction: 'JUNCTION_1_6' },
      { spawn: 'SPAWN_7', junction: 'JUNCTION_0_3' },
      { spawn: 'SPAWN_8', junction: 'JUNCTION_3_0' }
    ];
    
    spawnConnections.forEach((conn, idx) => {
      edges.push({
        data: {
          id: `SPAWN_ROAD_${idx}`,
          source: conn.spawn,
          target: conn.junction,
          type: 'spawn_road',
          difficulty: 'easy'
        }
      });
    });
    
    // Add some diagonal roads for more interesting pathways
    const diagonalConnections = [
      { from: 'JUNCTION_1_1', to: 'JUNCTION_2_2' },
      { from: 'JUNCTION_2_2', to: 'JUNCTION_3_3' },
      { from: 'JUNCTION_3_3', to: 'JUNCTION_4_4' },
      { from: 'JUNCTION_4_4', to: 'JUNCTION_5_5' },
      { from: 'JUNCTION_5_1', to: 'JUNCTION_4_2' },
      { from: 'JUNCTION_4_2', to: 'JUNCTION_3_3' },
      { from: 'JUNCTION_1_5', to: 'JUNCTION_2_4' },
      { from: 'JUNCTION_2_4', to: 'JUNCTION_3_3' }
    ];
    
    diagonalConnections.forEach((conn, idx) => {
      edges.push({
        data: {
          id: `DIAGONAL_${idx}`,
          source: conn.from,
          target: conn.to,
          type: 'diagonal_road',
          difficulty: getRandomDifficulty()
        }
      });
    });
    
    return { nodes, edges };
  };
  
  const getRandomDifficulty = () => {
    const difficulties = ['easy', 'medium', 'hard'];
    return difficulties[Math.floor(Math.random() * difficulties.length)];
  };

  // Initialize Cytoscape
  useEffect(() => {
    if (!cyRef.current) {
      const { nodes, edges } = createCityLayout();
      
      const cy = cytoscape({
        container: document.getElementById('city-battle-royale-map'),
        elements: [...nodes, ...edges],
        style: [
          // Junction nodes (intersections)
          {
            selector: 'node[type="junction"]',
            style: {
              'width': 25,
              'height': 25,
              'background-color': '#666666',
              'border-width': 2,
              'border-color': '#333333',
              'label': 'data(label)',
              'font-size': '8px',
              'text-valign': 'bottom',
              'text-margin-y': 5,
              'color': '#ffffff',
              'text-outline-width': 1,
              'text-outline-color': '#000000'
            }
          },
          // Spawn nodes
          {
            selector: 'node[type="spawn"]',
            style: {
              'width': 35,
              'height': 35,
              'background-color': '#4CAF50',
              'border-width': 3,
              'border-color': '#2E7D32',
              'label': 'data(label)',
              'font-size': '10px',
              'font-weight': 'bold',
              'text-valign': 'bottom',
              'text-margin-y': 8,
              'color': '#ffffff',
              'text-outline-width': 2,
              'text-outline-color': '#000000'
            }
          },
          // Road edges
          {
            selector: 'edge[type="road"]',
            style: {
              'width': 4,
              'line-color': '#888888',
              'curve-style': 'straight',
              'opacity': 0.8
            }
          },
          {
            selector: 'edge[type="spawn_road"]',
            style: {
              'width': 3,
              'line-color': '#4CAF50',
              'curve-style': 'straight',
              'opacity': 0.7
            }
          },
          {
            selector: 'edge[type="diagonal_road"]',
            style: {
              'width': 3,
              'line-color': '#FFA726',
              'curve-style': 'straight',
              'opacity': 0.6
            }
          },
          // Difficulty-based edge colors
          {
            selector: 'edge[difficulty="easy"]',
            style: {
              'line-color': '#4CAF50'
            }
          },
          {
            selector: 'edge[difficulty="medium"]',
            style: {
              'line-color': '#FF9800'
            }
          },
          {
            selector: 'edge[difficulty="hard"]',
            style: {
              'line-color': '#F44336'
            }
          },
          // Hover effects
          {
            selector: 'node:active',
            style: {
              'overlay-color': '#00ff88',
              'overlay-padding': 8,
              'overlay-opacity': 0.3
            }
          },
          {
            selector: 'edge:active',
            style: {
              'overlay-color': '#00ff88',
              'overlay-padding': 4,
              'overlay-opacity': 0.3
            }
          },
          // Allowed nodes highlighting
          {
            selector: '.allowed-node',
            style: {
              'border-color': '#00ff88',
              'border-width': 4,
              'background-color': '#00ff88'
            }
          }
        ],
        layout: {
          name: 'preset'
        },
        zoomingEnabled: enableZoom,
        panningEnabled: enablePan,
        userZoomingEnabled: enableZoom,
        userPanningEnabled: enablePan,
        boxSelectionEnabled: false,
        selectionType: 'single',
        minZoom: 0.3,
        maxZoom: 2.5
      });

      // Store node coordinates
      cy.nodes().forEach(node => {
        const pos = node.position();
        nodeCoordsRef.current[node.id()] = { x: pos.x, y: pos.y };
      });

      // Event handlers
      cy.on('tap', 'node', (evt) => {
        if (markerModeRef.current) {
          const pos = evt.target.position();
          const markerId = `marker_${Date.now()}`;
          cy.add({
            data: { id: markerId, label: '📍' },
            position: { x: pos.x, y: pos.y },
            style: { 'font-size': '20px', 'text-valign': 'center', 'text-halign': 'center' }
          });
          setMarkers(prev => [...prev, markerId]);
          setMarkerMode(false);
          return;
        }

        const nodeId = evt.target.id();
        const allowed = allowedNodeIdsRef.current;
        if (allowed && !allowed.includes(nodeId)) {
          console.log('🚫 Node not allowed:', nodeId);
          return;
        }
        
        onNodeClick({ id: nodeId, data: evt.target.data() });
      });

      cy.on('tap', 'edge', (evt) => {
        const edgeData = evt.target.data();
        onEdgeClick({
          id: edgeData.id,
          source: edgeData.source,
          target: edgeData.target,
          difficulty: edgeData.difficulty,
          type: edgeData.type
        });
      });

      cyRef.current = cy;
      
      // Initial fit
      setTimeout(() => {
        cy.fit(cy.elements(), 50);
        cy.center();
      }, 100);
    }
  }, [enableZoom, enablePan, onNodeClick, onEdgeClick]);

  // Update allowed nodes highlighting
  useEffect(() => {
    if (!cyRef.current) return;
    
    cyRef.current.nodes().removeClass('allowed-node');
    if (allowedNodeIds && allowedNodeIds.length > 0) {
      allowedNodeIds.forEach(nodeId => {
        cyRef.current.$(`#${nodeId}`).addClass('allowed-node');
      });
    }
  }, [allowedNodeIds]);

  // Draw zone overlay
  useEffect(() => {
    if (!canvasRef.current || !cyRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (safeCircle && blueRadius > safeCircle.r + 5) {
      const extent = cyRef.current.extent();
      const zoom = cyRef.current.zoom();
      const pan = cyRef.current.pan();
      
      const centerX = canvas.width / 2 + (safeCircle.x - extent.x1) * zoom + pan.x;
      const centerY = canvas.height / 2 + (safeCircle.y - extent.y1) * zoom + pan.y;
      
      // Draw blue zone (danger area)
      ctx.fillStyle = 'rgba(0, 100, 255, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Cut out safe zone
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(centerX, centerY, safeCircle.r * zoom, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      
      // Draw safe zone border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, safeCircle.r * zoom, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [safeCircle, blueRadius, gameTimer]);

  // Focus on player
  useEffect(() => {
    if (!cyRef.current || !players[selfPlayerId] || isMinimized) return;
    
    const playerNode = players[selfPlayerId].currentNode;
    if (!playerNode) return;
    
    const focus = cyRef.current.$(`#${playerNode}`);
    if (!focus || !focus.length) return;

    const viewSet = focus.closedNeighborhood();
    cyRef.current.fit(viewSet, 40);
    cyRef.current.zoom(Math.min(cyRef.current.maxZoom(), cyRef.current.zoom() * 1.2));
    cyRef.current.center(focus);
  }, [players, selfPlayerId, isMinimized]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 50%, #2c3e50 100%)',
      border: '2px solid #333',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* City names floating on the map */}
      {!isMinimized && CITY_NAMES.map((city, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: `${50 + (city.x / CITY_MAP_WIDTH) * 40}%`,
            top: `${50 + (city.y / CITY_MAP_HEIGHT) * 40}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 100,
            pointerEvents: 'none',
            fontFamily: 'Arial, sans-serif',
            fontWeight: city.style.fontWeight || 'normal',
            fontSize: city.style.fontSize || '12px',
            color: city.style.color || '#ffffff',
            textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
            animation: 'cityNameGlow 3s ease-in-out infinite',
            userSelect: 'none'
          }}
        >
          {city.name}
        </div>
      ))}

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
          <div style={{ marginBottom: '8px', color: '#00ff88', fontWeight: 'bold' }}>🏙️ CITY BATTLE ROYALE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            ⏱️{' '}
            <span style={{ animation: 'cityTimerPulse 1s ease-in-out infinite alternate', display: 'inline-block' }}>
              {Math.floor(gameTimer / 60)}:{(gameTimer % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div style={{ color: phase === 'moving' ? '#4444ff' : '#ff4444' }}>
            🔵 Zone: {phase === 'moving' ? 'SHRINKING' : 'SAFE'}
          </div>
          <div style={{ width: '140px' }}>
            <div style={{ fontSize: '11px' }}>⚠️ Phase: {Math.max(0, phaseTotal - phaseTimer)}s</div>
            <div style={{ width: '100%', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
              <div style={{ width: `${(1 - Math.min(phaseTimer / phaseTotal, 1)) * 100}%`, height: '100%', background: phase === 'moving' ? '#4444ff' : '#ff4444', transition: 'width 1s linear' }} />
            </div>
          </div>
          {safeCircle && (
            <div>🎯 Safe: R{Math.round(safeCircle.r)}</div>
          )}
          <div style={{ color: '#ff4444' }}>💀 Blue: R{Math.round(blueRadius)}</div>
          
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #444', fontSize: '10px' }}>
            <div>🟢 Easy Road</div>
            <div>🟡 Medium Road</div>
            <div>🔴 Hard Road</div>
            <div style={{ marginTop: '4px', color: '#ff4444' }}>⚠️ Navigate the city streets!</div>
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
        id="city-battle-royale-map" 
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
