import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

// Map radius constants (match node placement)
const MAP_R1 = 60;   // inner ring radius
const MAP_R2 = 120;  // middle ring radius
const MAP_R3 = 160;  // outer ring radius
const MAP_BOUNDARY = 360; // square boundary (±180) that neatly encloses graph with margin

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
  // Stores Cartesian coordinates of every node for future zone tracking
  const nodeCoordsRef = useRef({});
  // High-level game timer
  const [gameTimer, setGameTimer] = useState(0);
  // Legacy ring-based blue zone level (0-3) for node styling
  const [blueZoneLevel, setBlueZoneLevel] = useState(0);
  
  // Dynamic shrinking-zone state
  const [safeCircle, setSafeCircle] = useState(null);        // {x,y,r}
  const [nextSafeCircle, setNextSafeCircle] = useState(null); // upcoming safe zone
  const [blueRadius, setBlueRadius] = useState(MAP_BOUNDARY);  // starts from map boundary
  const [phase, setPhase] = useState('moving');               // 'moving' | 'waiting'
  const [phaseTimer, setPhaseTimer] = useState(0);            // seconds within current phase

  // ===== Shrinking Zone Logic =====
  // Initialize first safe circles on first render
  useEffect(() => {
    if (!safeCircle) {
      // First safe circle is centered, radius big enough to cover extreme boundary first (then shrink)
      const firstSafe = { x: 0, y: 0, r: MAP_R3 };
      // Helper to generate a random inner safe zone
      const randomSafeInner = (parent) => {
        const radius = Math.random() * (parent.r * 0.5) + parent.r * 0.25;
        const angle = Math.random() * 2 * Math.PI;
        const dist = Math.random() * (parent.r - radius);
        return {
          x: parent.x + Math.cos(angle) * dist,
          y: parent.y + Math.sin(angle) * dist,
          r: radius
        };
      };
      const secondSafe = randomSafeInner(firstSafe);
      setSafeCircle(firstSafe);
      setNextSafeCircle(secondSafe);
    }
  }, [safeCircle]);

  // Central loop every second handling timers & shrink
  useEffect(() => {
    const interval = setInterval(() => {
      setGameTimer(prev => prev + 1);
      setPhaseTimer(t => t + 1);

      if (!safeCircle) return; // not ready yet

      if (phase === 'moving') {
        // Shrink blue zone towards current safe circle at constant rate so it meets in 60s
        const distanceToShrink = blueRadius - safeCircle.r;
        if (distanceToShrink <= 0.5) {
          // Reached safe circle
          setBlueRadius(safeCircle.r);
          setPhase('waiting');
          setPhaseTimer(0);
        } else {
          const shrinkPerSec = distanceToShrink / 60; // reach in 60s
          setBlueRadius(r => Math.max(safeCircle.r, r - shrinkPerSec));
        }
      } else if (phase === 'waiting') {
        if (phaseTimer >= 60) {
          // Prepare next shrink
          if (!nextSafeCircle) {
            // final zone – collapse to current safeCircle center node size
            setNextSafeCircle({ x: safeCircle.x, y: safeCircle.y, r: 10 });
          }
          setSafeCircle(nextSafeCircle);
          // Pick subsequent safe circle inside it (unless already final)
          if (nextSafeCircle.r > 20) {
            const randomInner = () => {
              const radius = Math.random() * (nextSafeCircle.r * 0.5) + nextSafeCircle.r * 0.25;
              const angle = Math.random() * 2 * Math.PI;
              const dist = Math.random() * (nextSafeCircle.r - radius);
              return {
                x: nextSafeCircle.x + Math.cos(angle) * dist,
                y: nextSafeCircle.y + Math.sin(angle) * dist,
                r: radius
              };
            };
            setNextSafeCircle(randomInner());
          } else {
            setNextSafeCircle({ x: nextSafeCircle.x, y: nextSafeCircle.y, r: 0 });
          }
          setPhase('moving');
          setPhaseTimer(0);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, phaseTimer, blueRadius, safeCircle, nextSafeCircle]);
  
  // Update blue zone styling when zone level changes
  useEffect(() => {
    if (!cyRef.current) return;
    
    // Remove all blue zone classes first
    cyRef.current.nodes().removeClass('blue-zone');
    
    // Apply blue zone based on current level
    if (blueZoneLevel >= 1) {
      cyRef.current.nodes('.layer3').addClass('blue-zone');
    }
    if (blueZoneLevel >= 2) {
      cyRef.current.nodes('.layer2').addClass('blue-zone');
    }
    if (blueZoneLevel >= 3) {
      cyRef.current.nodes('.layer1').addClass('blue-zone');
    }
    
    // Update zone type in node data
    cyRef.current.nodes().forEach(node => {
      const nodeData = node.data();
      if (nodeData.level >= 4 - blueZoneLevel && nodeData.level > 0) {
        node.data('zoneType', 'danger');
      }
    });
    // Expose node coordinates via Cytoscape instance for external queries
    cyRef.current.nodeCoords = nodeCoordsRef.current;
  }, [blueZoneLevel]);
  
  // ===== Overlay Canvas for circles =====
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Get current cytoscape zoom and pan to match canvas overlay
      const cy = cyRef.current;
      if (!cy) return;
      
      const zoom = cy.zoom();
      const pan = cy.pan();
      
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(pan.x / zoom, pan.y / zoom);

      // draw map boundary square
      ctx.beginPath();
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 2 / zoom;
      ctx.rect(-MAP_BOUNDARY/2, -MAP_BOUNDARY/2, MAP_BOUNDARY, MAP_BOUNDARY);
      ctx.stroke();

      // draw safe circle (white line)
      if (safeCircle) {
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 / zoom;
        ctx.arc(safeCircle.x, safeCircle.y, safeCircle.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // draw blue zone (semi-transparent blue fill outside safe area)
      if (safeCircle) {
        // Create a path that fills the entire boundary but excludes the safe circle
        ctx.beginPath();
        ctx.rect(-MAP_BOUNDARY/2, -MAP_BOUNDARY/2, MAP_BOUNDARY, MAP_BOUNDARY);
        ctx.arc(safeCircle.x, safeCircle.y, safeCircle.r, 0, Math.PI * 2, true); // counter-clockwise for hole
        ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
        ctx.fill();
      } else {
        // No safe circle yet, fill from boundary to current blue radius
        ctx.beginPath();
        ctx.rect(-MAP_BOUNDARY/2, -MAP_BOUNDARY/2, MAP_BOUNDARY, MAP_BOUNDARY);
        ctx.arc(0, 0, blueRadius, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
        ctx.fill();
      }

      ctx.restore();
      requestAnimationFrame(draw);
    };

    // ensure canvas matches container size
    const resize = () => {
      const parent = canvas.parentNode;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    draw();
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [safeCircle, blueRadius]);

  // Handle minimap fit and styling when isMinimized changes
  useEffect(() => {
    if (cyRef.current) {
      if (isMinimized) {
        // Minimap mode - smaller elements for overview
        cyRef.current.style()
          .selector('node')
          .style({
            'font-size': '6px',
            'border-width': '1px',
            width: '20px',
            height: '20px'
          })
          .selector('.core')
          .style({
            width: '25px',
            height: '25px',
            'font-size': '7px'
          })
          .selector('edge')
          .style({
            'font-size': '8px',
            width: '1px',
            opacity: '0.8'
          })
          .update();
          
        setTimeout(() => {
          cyRef.current.fit();
          cyRef.current.zoom({
            level: cyRef.current.zoom() * 0.6, // Zoom out more for better overview
            renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 }
          });
        }, 200);
      } else {
        // Full screen mode - restore normal styling
        cyRef.current.style()
          .selector('node')
          .style({
            'font-size': '8px',
            'border-width': '2px',
            width: '30px',
            height: '30px'
          })
          .selector('.core')
          .style({
            width: '40px',
            height: '40px',
            'font-size': '10px',
            'border-width': '3px'
          })
          .selector('edge')
          .style({
            'font-size': '10px',
            width: '2px',
            opacity: '0.8'
          })
          .update();
      }
    }
  }, [isMinimized]);

  // Initialize Cytoscape when component mounts
  useEffect(() => {
    // helper to convert polar to cartesian
    const polar = (r, angleDeg) => {
      const angleRad = (angleDeg * Math.PI) / 180;
      return { x: r * Math.cos(angleRad), y: r * Math.sin(angleRad) };
    };

    // Edge helper to push with group and style - now includes question info
    const pushEdge = (source, target, group, opts = {}) => {
      const edgeId = `${source}-${target}`;
      const { difficulty = 'easy', pathType = 'inward', questionId = null } = opts;
      
      // Determine edge color based on difficulty
      let edgeColor = '#00ff88'; // Green for easy
      if (difficulty === 'medium') edgeColor = '#ffaa00'; // Yellow for medium
      if (difficulty === 'hard') edgeColor = '#ff4444'; // Red for hard
      
      edges.push({
        data: {
          id: edgeId,
          source,
          target,
          group,
          difficulty,
          pathType,
          questionId,
          edgeColor,
          label: pathType.toUpperCase()
        }
      });
    };

    const nodes = [];
    const edges = [];
    
    // Define radii for concentric circles (no player ring) - fit inside boundary
    const R1 = MAP_R1;  // Ring 1 (innermost)
    const R2 = MAP_R2;  // Ring 2 (middle)
    const R3 = MAP_R3;  // Ring 3 (outermost)
    
    // TARGET: Center node (safe zone)
    nodes.push({ 
      data: { 
        id: 'TARGET', 
        label: '', 
        level: 0, 
        class: 'core',
        nodeType: 'target',
        zoneType: 'safe',
        description: 'Victory Point - Reach here to win!'
      }, 
      position: { x: 0, y: 0 }
    });

    // RING 1: Inner ring (6 nodes)
    const ring1Count = 8;
    for (let i = 0; i < ring1Count; i++) {
      const id = `R1_${i + 1}`;
      const angle = (i * 360) / ring1Count;
      const pos = polar(R1, angle);
      nodes.push({ 
        data: { 
          id, 
          label: `Zone 1-${i + 1}`, 
          level: 1, 
          class: 'layer1',
          nodeType: 'zone',
          zoneType: 'safe',
          description: `Inner Zone ${i + 1}\nHigh-value strategic position`
        }, 
        position: pos 
      });
    }

    // RING 2: Middle ring (8 nodes)
    const ring2Count = 10;
    for (let i = 0; i < ring2Count; i++) {
      const id = `R2_${i + 1}`;
      const angle = (i * 360) / ring2Count;
      const pos = polar(R2, angle);
      nodes.push({ 
        data: { 
          id, 
          label: `Zone 2-${i + 1}`, 
          level: 2, 
          class: 'layer2',
          nodeType: 'zone',
          zoneType: 'safe',
          description: `Middle Zone ${i + 1}\nModerate risk area`
        }, 
        position: pos 
      });
    }

    // RING 3: Outer ring (8 nodes) - Starting positions
    const ring3Count = 12;
    for (let i = 0; i < ring3Count; i++) {
      const id = `R3_${i + 1}`;
      const angle = (i * 360) / ring3Count;
      const pos = polar(R3, angle);
      nodes.push({ 
        data: { 
          id, 
          label: `Zone 3-${i + 1}`, 
          level: 3, 
          class: 'layer3',
          nodeType: 'zone',
          zoneType: 'safe',
          description: `Outer Zone ${i + 1}\nStarting area - move inward quickly!`
        }, 
        position: pos 
      });
    }

    // EDGES: Connect rings with questions (UNDIRECTED GRAPH)
    
    // Ring 1 to Target (Hard questions - Final approach) - BIDIRECTIONAL
    for (let i = 0; i < ring1Count; i++) {
      const sourceId = `R1_${i + 1}`;
      pushEdge(sourceId, 'TARGET', 'final', { 
        difficulty: 'hard', 
        pathType: 'final'
      });
      pushEdge('TARGET', sourceId, 'final', { 
        difficulty: 'hard', 
        pathType: 'final'
      });
    }

    // Ring 2 to Ring 1 (Medium questions - Inward movement) - BIDIRECTIONAL
    for (let i = 0; i < ring2Count; i++) {
      const r2Index = i + 1;
      const r1Index = Math.ceil((r2Index * ring1Count) / ring2Count);
      pushEdge(`R2_${r2Index}`, `R1_${r1Index}`, 'inward', {
        difficulty: 'medium',
        pathType: 'inward'
      });
      pushEdge(`R1_${r1Index}`, `R2_${r2Index}`, 'inward', {
        difficulty: 'medium',
        pathType: 'inward'
      });
    }

    // Ring 3 to Ring 2 (Easy questions - Inward movement) - BIDIRECTIONAL
    for (let i = 0; i < ring3Count; i++) {
      const r3Index = i + 1;
      const r2Index = Math.ceil((r3Index * ring2Count) / ring3Count);
      pushEdge(`R3_${r3Index}`, `R2_${r2Index}`, 'inward', {
        difficulty: 'easy',
        pathType: 'inward'
      });
      pushEdge(`R2_${r2Index}`, `R3_${r3Index}`, 'inward', {
        difficulty: 'easy',
        pathType: 'inward'
      });
    }

    // Circular edges within each ring (Lateral movement) - BIDIRECTIONAL
    // Ring 3 circular
    for (let i = 0; i < ring3Count; i++) {
      const current = `R3_${i + 1}`;
      const next = `R3_${((i + 1) % ring3Count) + 1}`;
      pushEdge(current, next, 'lateral', { 
        difficulty: 'easy', 
        pathType: 'lateral'
      });
      pushEdge(next, current, 'lateral', { 
        difficulty: 'easy', 
        pathType: 'lateral'
      });
    }

    // Ring 2 circular
    for (let i = 0; i < ring2Count; i++) {
      const current = `R2_${i + 1}`;
      const next = `R2_${((i + 1) % ring2Count) + 1}`;
      pushEdge(current, next, 'lateral', { 
        difficulty: 'medium', 
        pathType: 'lateral'
      });
      pushEdge(next, current, 'lateral', { 
        difficulty: 'medium', 
        pathType: 'lateral'
      });
    }

    // Ring 1 circular
    for (let i = 0; i < ring1Count; i++) {
      const current = `R1_${i + 1}`;
      const next = `R1_${((i + 1) % ring1Count) + 1}`;
      pushEdge(current, next, 'lateral', { 
        difficulty: 'hard', 
        pathType: 'lateral'
      });
      pushEdge(next, current, 'lateral', { 
        difficulty: 'hard', 
        pathType: 'lateral'
      });
    }

    // Store coordinates for future zone tracking
    nodes.forEach(n => { nodeCoordsRef.current[n.data.id] = n.position; });
    // Initialize Cytoscape
    cyRef.current = cytoscape({
      container: document.getElementById('battle-royale-map'),
      elements: [...nodes, ...edges],
      style: [
        // Base node styles
        {
          selector: 'node',
          style: {
            'background-color': '#2c3e50',
            'border-color': '#34495e',
            'border-width': '2px',
            'color': '#ecf0f1',
            'label': '',
            'text-opacity': 0,
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '8px',
            'font-weight': 'bold',
            'text-outline-color': '#2c3e50',
            'text-outline-width': '1px',
            width: '30px',
            height: '30px'
          }
        },
        
        // Core/Target node
        {
          selector: '.core',
          style: {
            'background-color': '#e74c3c',
            'border-color': '#c0392b',
            'border-width': '3px',
            width: '40px',
            height: '40px',
            'font-size': '10px',
            'box-shadow': '0 0 20px #e74c3c'
          }
        },
        
        // Ring layers
        {
          selector: '.layer1',
          style: {
            'background-color': '#f39c12',
            'border-color': '#e67e22'
          }
        },
        {
          selector: '.layer2',
          style: {
            'background-color': '#3498db',
            'border-color': '#2980b9'
          }
        },
        {
          selector: '.layer3',
          style: {
            'background-color': '#27ae60',
            'border-color': '#229954'
          }
        },
        
        // Blue zone (danger zone) styling
        {
          selector: '.blue-zone',
          style: {
            'background-color': '#8e44ad',
            'border-color': '#9b59b6',
            'border-width': '3px',
            'box-shadow': '0 0 15px #8e44ad'
          }
        },
        
        // Base edge styles (UNDIRECTED - NO ARROWS)
        {
          selector: 'edge',
          style: {
            'width': '3px',
            'line-color': 'data(edgeColor)',
            'curve-style': 'straight',
            'font-size': '10px',
            'color': '#ecf0f1',
            'text-outline-color': '#2c3e50',
            'text-outline-width': '1px',
            'label': 'data(label)',
            'opacity': 0.8
          }
        },
        
        // Highlighted edges (accessible paths) - UNDIRECTED
        {
          selector: '.accessible-edge',
          style: {
            'width': '5px',
            'opacity': 1,
            'line-color': '#00ff88',
            'box-shadow': '0 0 15px #00ff88'
          }
        }
      ],
      layout: {
        name: 'preset'
      },
      userZoomingEnabled: enableZoom,
      userPanningEnabled: enablePan,
      boxSelectionEnabled: false,
      selectionType: 'single'
    });

    // Enforce zoom and pan boundaries - prevent zooming out of square
    if (enableZoom) {
      const { width, height } = cyRef.current.container().getBoundingClientRect();
      
      // Calculate minimum zoom to ensure square boundary fills the viewport
      const MIN_ZOOM = Math.max(
        width / (MAP_BOUNDARY * 1.1),   // 1.2 for small margin
        height / (MAP_BOUNDARY * 1.1)
      );
      const MAX_ZOOM = 4.0;
      
      cyRef.current.minZoom(MIN_ZOOM);
      cyRef.current.maxZoom(MAX_ZOOM);
      
      cyRef.current.on('zoom pan', () => {
        const zoom = cyRef.current.zoom();
        const pan = cyRef.current.pan();
        const containerRect = cyRef.current.container().getBoundingClientRect();
        
        // Calculate how much of the boundary is visible at current zoom
        const boundaryPixelSize = MAP_BOUNDARY * zoom;
        const halfBoundary = boundaryPixelSize / 2;
        
        // Constrain pan so boundary square never goes outside viewport
        const maxPanX = Math.max(0, halfBoundary - containerRect.width / 2);
        const maxPanY = Math.max(0, halfBoundary - containerRect.height / 2);
        
        const constrainedPan = {
          x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)),
          y: Math.max(-maxPanY, Math.min(maxPanY, pan.y))
        };
        
        // Apply constraints if needed
        if (Math.abs(pan.x - constrainedPan.x) > 0.1 || Math.abs(pan.y - constrainedPan.y) > 0.1) {
          cyRef.current.pan(constrainedPan);
        }
      });
    }

    // Event handlers
    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();
      onNodeClick(nodeData);
    });

    cyRef.current.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const edgeData = edge.data();
      onEdgeClick(edgeData);
    });

    // Tooltip functionality
    cyRef.current.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const data = node.data();
      const ele = document.createElement('div');
      ele.className = 'cy-tooltip';
      ele.innerHTML = `
        <strong>${data.label}</strong><br/>
        Type: ${data.nodeType}<br/>
        Zone: ${data.zoneType}<br/>
        ${data.description || ''}
      `;
      document.body.appendChild(ele);
      const rect = node.renderedBoundingBox();
      ele.style.left = rect.x2 + 4 + 'px';
      ele.style.top = rect.y1 + 'px';
      node.data('tooltipEl', ele);
    });

    cyRef.current.on('mouseout', 'node', (evt) => {
      const node = evt.target;
      const el = node.data('tooltipEl');
      if (el) el.remove();
    });

    // Ensure proper fit and centering
    setTimeout(() => {
      if (cyRef.current) {
        // Always center the graph at (0,0)
        cyRef.current.pan({ x: 0, y: 0 });
        
        if (isMinimized) {
          // For minimap, zoom to fit boundary with margin
          const { width, height } = cyRef.current.container().getBoundingClientRect();
          const fitZoom = Math.min(
            width / (MAP_BOUNDARY * 1.2),
            height / (MAP_BOUNDARY * 1.2)
          );
          cyRef.current.zoom(fitZoom);
          cyRef.current.center();
        } else {
          // For full screen, set zoom to show boundary comfortably
          // For full screen, fit graph nodes with small padding
          cyRef.current.fit(cyRef.current.nodes(), 20);
          cyRef.current.center();
        }
      }
    }, 100);

    return () => {
      cyRef.current?.destroy();
    };
  }, []);

  // Add CSS for tooltips and 3D effects
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .cy-tooltip {
        position: absolute;
        background: linear-gradient(145deg, #2c3e50, #34495e);
        color: white;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: bold;
        pointer-events: none;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        border: 1px solid #fff;
        backdrop-filter: blur(10px);
      }
      
      .battle-royale-map-container {
        background: radial-gradient(circle at center, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        position: relative;
        overflow: hidden;
      }
      
      .battle-royale-map-container::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: 
          radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(255,255,255,0.05) 0%, transparent 50%);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div className="battle-royale-map-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Game HUD - only show if not minimized and HUD enabled */}
      {showHUD && !isMinimized && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: isMinimized ? '10px' : '14px'
        }}>
          <div>⏱️ Game Time: {Math.floor(gameTimer / 60)}:{(gameTimer % 60).toString().padStart(2, '0')}</div>
          <div>🔵 Zone Phase: {phase === 'moving' ? 'SHRINKING' : 'WAITING'}</div>
          <div>⚠️ Phase Timer: {phase === 'moving' ? `${Math.max(0, 60 - phaseTimer)}s` : `${Math.max(0, 60 - phaseTimer)}s`}</div>
          {safeCircle && (
            <div>🎯 Safe Zone: R{Math.round(safeCircle.r)} at ({Math.round(safeCircle.x)}, {Math.round(safeCircle.y)})</div>
          )}
          <div>💀 Blue Zone: R{Math.round(blueRadius)}</div>
          <div style={{ marginTop: '10px', borderTop: '1px solid #666', paddingTop: '10px' }}>
            <div>🎯 Stay inside white circle</div>
            <div>🏃 Blue zone = death</div>
            <div>🔴 Move before shrink!</div>
          </div>
        </div>
      )}
      
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }} />
      <div 
        id="battle-royale-map" 
        style={{ 
          width: '100%', 
          height: '100%',
          border: isMinimized ? '1px solid #666' : '2px solid #333',
          borderRadius: '8px',
          background: '#1a1a2e'
        }}
      />
      
      {/* Tooltip styling */}
      <style jsx>{`
        .cy-tooltip {
          position: absolute;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          white-space: pre-line;
          z-index: 1000;
          pointer-events: none;
          max-width: 200px;
          border: 1px solid #666;
        }
      `}</style>
    </div>
  );
}
