import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

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
  const [blueZoneLevel, setBlueZoneLevel] = useState(0); // 0 = no blue zone, 1 = outer ring danger, etc.
  const [gameTimer, setGameTimer] = useState(0);

  // Blue zone timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setGameTimer(prev => {
        const newTimer = prev + 1;
        
        // Blue zone progression every 30 seconds
        if (newTimer % 30 === 0 && blueZoneLevel < 3) {
          setBlueZoneLevel(prev => prev + 1);
        }
        
        return newTimer;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [blueZoneLevel]);
  
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
  }, [blueZoneLevel]);
  
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
    
    // Define radii for concentric circles (no player ring)
    const R1 = 80;  // Ring 1 (innermost)
    const R2 = 160; // Ring 2 (middle)
    const R3 = 240; // Ring 3 (outermost)
    
    // TARGET: Center node (safe zone)
    nodes.push({ 
      data: { 
        id: 'TARGET', 
        label: 'Safe Zone', 
        level: 0, 
        class: 'core',
        nodeType: 'target',
        zoneType: 'safe',
        description: 'Victory Point - Reach here to win!'
      }, 
      position: { x: 0, y: 0 }
    });

    // RING 1: Inner ring (6 nodes)
    const ring1Count = 6;
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
    const ring2Count = 8;
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
    const ring3Count = 8;
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

    // EDGES: Connect rings with questions
    
    // Ring 1 to Target (Hard questions - Final approach)
    for (let i = 0; i < ring1Count; i++) {
      const sourceId = `R1_${i + 1}`;
      pushEdge(sourceId, 'TARGET', 'final', { 
        difficulty: 'hard', 
        pathType: 'final'
      });
    }

    // Ring 2 to Ring 1 (Medium questions - Inward movement)
    const r2ToR1Mapping = [
      [1, 1], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 6]
    ];
    r2ToR1Mapping.forEach(([r2Index, r1Index]) => {
      pushEdge(`R2_${r2Index}`, `R1_${r1Index}`, 'inward', { 
        difficulty: 'medium', 
        pathType: 'inward'
      });
    });

    // Ring 3 to Ring 2 (Easy questions - Inward movement)
    const r3ToR2Mapping = [
      [1, 1], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7]
    ];
    r3ToR2Mapping.forEach(([r3Index, r2Index]) => {
      pushEdge(`R3_${r3Index}`, `R2_${r2Index}`, 'inward', { 
        difficulty: 'easy', 
        pathType: 'inward'
      });
    });

    // Circular edges within each ring (Lateral movement)
    // Ring 3 circular
    for (let i = 0; i < ring3Count; i++) {
      const current = `R3_${i + 1}`;
      const next = `R3_${((i + 1) % ring3Count) + 1}`;
      pushEdge(current, next, 'lateral', { 
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
    }

    // Ring 1 circular
    for (let i = 0; i < ring1Count; i++) {
      const current = `R1_${i + 1}`;
      const next = `R1_${((i + 1) % ring1Count) + 1}`;
      pushEdge(current, next, 'lateral', { 
        difficulty: 'hard', 
        pathType: 'lateral'
      });
    }

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
            'label': 'data(label)',
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
        
        // Base edge styles
        {
          selector: 'edge',
          style: {
            'width': '2px',
            'line-color': 'data(edgeColor)',
            'target-arrow-color': 'data(edgeColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'straight',
            'font-size': '10px',
            'color': '#ecf0f1',
            'text-outline-color': '#2c3e50',
            'text-outline-width': '1px',
            'label': 'data(label)',
            'opacity': 0.8
          }
        },
        
        // Highlighted edges (accessible paths)
        {
          selector: '.accessible-edge',
          style: {
            'width': '4px',
            'opacity': 1,
            'line-color': '#00ff88',
            'target-arrow-color': '#00ff88',
            'box-shadow': '0 0 10px #00ff88'
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

    // Ensure proper fit for minimap overview
    setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.fit();
        if (isMinimized) {
          // For minimap, ensure we can see the entire network
          cyRef.current.zoom({
            level: cyRef.current.zoom() * 0.8, // Zoom out a bit more for better overview
            renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 }
          });
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
          <div>🔵 Blue Zone Level: {blueZoneLevel}/3</div>
          <div>⚠️ Next Zone: {blueZoneLevel < 3 ? `${30 - (gameTimer % 30)}s` : 'Final Zone'}</div>
          <div style={{ marginTop: '10px', borderTop: '1px solid #666', paddingTop: '10px' }}>
            <div>🎯 Click zones to move</div>
            <div>🏃 Move to inner zones to survive</div>
            <div>🔴 Avoid blue zones!</div>
          </div>
        </div>
      )}
      
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
