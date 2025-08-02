import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

export default function RadialNetwork() {
  const cyRef = useRef(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  useEffect(() => {
    if (cyRef.current) return; // prevent re-init

    // Canvas size - optimized for concentric target structure
    const W = 1200;
    const H = 1200;
    const center = { x: W / 2, y: H / 2 };
    
    // Concentric rings - target/bullseye structure
    const R1 = 80;  // inner ring - close to target
    const R2 = 160; // middle ring
    const R3 = 240; // outer ring
    const R4 = 380; // player ring - outermost

    // helper to convert polar to cartesian
    const polar = (r, angleDeg) => {
      const rad = (angleDeg * Math.PI) / 180;
      return { x: center.x + r * Math.cos(rad), y: center.y + r * Math.sin(rad) };
    };

    // Nodes array
    const nodes = [];

    // TARGET - Core node at center
    nodes.push({ 
      data: { id: 'TARGET', label: 'TARGET', level: 0, class: 'core' }, 
      position: center 
    });

    // RING 1: Inner ring (6 nodes evenly distributed)
    const ring1Count = 6;
    for (let i = 0; i < ring1Count; i++) {
      const id = `R1_${i + 1}`;
      const angle = (i * 360) / ring1Count; // evenly distributed
      const pos = polar(R1, angle);
      nodes.push({ 
        data: { id, label: `R1-${i + 1}`, level: 1, class: 'layer1' }, 
        position: pos 
      });
    }

    // RING 2: Middle ring (8 nodes for more density)
    const ring2Count = 8;
    for (let i = 0; i < ring2Count; i++) {
      const id = `R2_${i + 1}`;
      const angle = (i * 360) / ring2Count; // evenly distributed
      const pos = polar(R2, angle);
      nodes.push({ 
        data: { id, label: `R2-${i + 1}`, level: 2, class: 'layer2' }, 
        position: pos 
      });
    }

    // RING 3: Outer ring (12 nodes for highest density)
    const ring3Count = 12;
    for (let i = 0; i < ring3Count; i++) {
      const id = `R3_${i + 1}`;
      const angle = (i * 360) / ring3Count; // evenly distributed
      const pos = polar(R3, angle);
      nodes.push({ 
        data: { id, label: `R3-${i + 1}`, level: 3, class: 'layer3' }, 
        position: pos 
      });
    }

    // PLAYERS: Outermost ring (4 players at cardinal directions)
    const playerIds = ['PLAYER_A', 'PLAYER_B', 'PLAYER_C', 'PLAYER_D'];
    const playerLabels = ['Player A', 'Player B', 'Player C', 'Player D'];
    const playerAngles = [0, 90, 180, 270]; // N, E, S, W
    for (let i = 0; i < 4; i++) {
      const id = playerIds[i];
      const angle = playerAngles[i];
      const pos = polar(R4, angle);
      nodes.push({ 
        data: { id, label: playerLabels[i], level: 4, class: 'player' }, 
        position: pos 
      });
    }

    // Edges array
    const edges = [];

    // Edge helper to push with group and style
    const pushEdge = (source, target, group, opts = {}) => {
      if (source === target) return; // avoid self loops
      edges.push({ data: { id: `${source}-${target}`, source, target, group, ...opts } });
    };

    // TARGET to Ring 1 connections (radial spokes to all inner nodes)
    for (let i = 1; i <= ring1Count; i++) {
      pushEdge('TARGET', `R1_${i}`, 'target-to-ring1');
    }

    // Ring 1 circular connections (form complete circle)
    for (let i = 1; i <= ring1Count; i++) {
      const curr = `R1_${i}`;
      const next = `R1_${(i % ring1Count) + 1}`;
      pushEdge(curr, next, 'ring1-circle');
    }

    // Ring 1 to Ring 2 connections (each R1 connects to nearest R2 nodes)
    for (let i = 1; i <= ring1Count; i++) {
      const r1Node = `R1_${i}`;
      // Connect to 2 nearest R2 nodes for smooth transition
      const r2Index1 = Math.floor(((i - 1) * ring2Count) / ring1Count) + 1;
      const r2Index2 = (r2Index1 % ring2Count) + 1;
      pushEdge(r1Node, `R2_${r2Index1}`, 'ring1-to-ring2');
      pushEdge(r1Node, `R2_${r2Index2}`, 'ring1-to-ring2');
    }

    // Ring 2 circular connections (form complete circle)
    for (let i = 1; i <= ring2Count; i++) {
      const curr = `R2_${i}`;
      const next = `R2_${(i % ring2Count) + 1}`;
      pushEdge(curr, next, 'ring2-circle');
    }

    // Ring 2 to Ring 3 connections (each R2 connects to nearest R3 nodes)
    for (let i = 1; i <= ring2Count; i++) {
      const r2Node = `R2_${i}`;
      // Connect to nearest R3 nodes
      const r3Index1 = Math.floor(((i - 1) * ring3Count) / ring2Count) + 1;
      const r3Index2 = (r3Index1 % ring3Count) + 1;
      pushEdge(r2Node, `R3_${r3Index1}`, 'ring2-to-ring3');
      pushEdge(r2Node, `R3_${r3Index2}`, 'ring2-to-ring3');
    }

    // Ring 3 circular connections (form complete circle)
    for (let i = 1; i <= ring3Count; i++) {
      const curr = `R3_${i}`;
      const next = `R3_${(i % ring3Count) + 1}`;
      pushEdge(curr, next, 'ring3-circle');
    }

    // Ring 3 to Player connections (strategic connections to cardinal players)
    const playerToR3Mapping = {
      'PLAYER_A': ['R3_1', 'R3_12', 'R3_2'], // North player (top)
      'PLAYER_B': ['R3_3', 'R3_4', 'R3_5'],  // East player (right)
      'PLAYER_C': ['R3_6', 'R3_7', 'R3_8'],  // South player (bottom)
      'PLAYER_D': ['R3_9', 'R3_10', 'R3_11'] // West player (left)
    };
    
    Object.entries(playerToR3Mapping).forEach(([player, r3Nodes]) => {
      r3Nodes.forEach(r3Node => {
        pushEdge(r3Node, player, 'ring3-to-player');
      });
    });

    // Initialize cytoscape with fixed layout
    cyRef.current = cytoscape({
      container: document.getElementById('radial-net'),
      elements: { nodes, edges },
      layout: {
        name: 'preset', // Use preset positions
        fit: true,
        padding: 50
      },
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#6c757d',
            label: 'data(label)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            width: 40,
            height: 40,
            'font-size': 10,
            'font-weight': 'bold',
            'border-width': 3,
            'border-color': '#fff',
            'text-outline-width': 2,
            'text-outline-color': '#000',
            'overlay-opacity': 0,
          },
        },
        // Target node styling - clean center
        { 
          selector: '.core', 
          style: { 
            'background-color': '#e53e3e', 
            width: 65, 
            height: 65,
            'font-size': 14,
            'border-width': 4,
            'border-color': '#fff',
            'font-weight': 'bold'
          } 
        },
        // Ring 1 nodes - inner ring
        { 
          selector: '.layer1', 
          style: { 
            'background-color': '#fd7e14', 
            width: 50, 
            height: 50,
            'font-size': 10
          } 
        },
        // Ring 2 nodes - middle ring
        { 
          selector: '.layer2', 
          style: { 
            'background-color': '#20c997', 
            width: 45, 
            height: 45,
            'font-size': 9
          } 
        },
        // Ring 3 nodes - outer ring
        { 
          selector: '.layer3', 
          style: { 
            'background-color': '#0dcaf0', 
            width: 42, 
            height: 42,
            'font-size': 9
          } 
        },
        // Player nodes - prominent
        { 
          selector: '.player', 
          style: { 
            'background-color': '#6f42c1', 
            width: 70, 
            height: 70,
            'font-size': 12,
            'border-width': 4,
            'border-color': '#fff',
            'font-weight': 'bold'
          } 
        },
        // Base edge styling - undirected clean lines
        {
          selector: 'edge',
          style: {
            width: 3,
            'line-color': '#495057',
            'curve-style': 'straight',
            opacity: 0.8,
            'target-arrow-shape': 'none', // Remove arrows for undirected graph
            'source-arrow-shape': 'none'
          },
        },
        // Target to Ring 1 edges - radial spokes
        { 
          selector: "edge[group='target-to-ring1']", 
          style: { 
            'line-color': '#e53e3e', 
            width: 4,
            opacity: 0.9
          } 
        },
        // Ring 1 circular edges
        { 
          selector: "edge[group='ring1-circle']", 
          style: { 
            'line-color': '#fd7e14', 
            width: 3,
            opacity: 0.8
          } 
        },
        // Ring 1 to Ring 2 edges
        { 
          selector: "edge[group='ring1-to-ring2']", 
          style: { 
            'line-color': '#ffc107', 
            width: 3,
            opacity: 0.7
          } 
        },
        // Ring 2 circular edges
        { 
          selector: "edge[group='ring2-circle']", 
          style: { 
            'line-color': '#20c997', 
            width: 3,
            opacity: 0.8
          } 
        },
        // Ring 2 to Ring 3 edges
        { 
          selector: "edge[group='ring2-to-ring3']", 
          style: { 
            'line-color': '#17a2b8', 
            width: 3,
            opacity: 0.7
          } 
        },
        // Ring 3 circular edges
        { 
          selector: "edge[group='ring3-circle']", 
          style: { 
            'line-color': '#0dcaf0', 
            width: 3,
            opacity: 0.8
          } 
        },
        // Ring 3 to Player edges - final connections
        { 
          selector: "edge[group='ring3-to-player']", 
          style: { 
            'line-color': '#6f42c1', 
            width: 4,
            opacity: 0.9
          } 
        },
        // Highlighted path elements
        {
          selector: '.highlighted',
          style: {
            'border-color': '#ffeb3b',
            'border-width': 6,
            'box-shadow': '0 0 20px #ffeb3b, 0 0 40px #ffeb3b',
            opacity: 1,
            'z-index': 999
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#ffeb3b',
            width: 6,
            opacity: 1,
            'box-shadow': '0 0 15px #ffeb3b'
          },
        },
        // Dimmed non-path elements
        {
          selector: '.dimmed',
          style: {
            opacity: 0.2,
            'z-index': 1
          },
        },
        // Hover effects
        {
          selector: 'node:hover',
          style: {
            'border-color': '#ffc107',
            'border-width': 4,
          },
        },
        {
          selector: 'edge:hover',
          style: {
            width: 4,
            opacity: 1,
          },
        },
      ],
      // Disable all user interactions to keep nodes fixed
      userZoomingEnabled: false,
      userPanningEnabled: false,
      zoomingEnabled: false,
      panningEnabled: false,
      boxSelectionEnabled: false,
      selectionType: 'single',
      autoungrabify: true, // Make nodes ungrabbable
      autounselectify: false,
    });

    // Player click handler - highlight path to core
    cyRef.current.on('tap', '.player', (evt) => {
      const player = evt.target;
      const playerId = player.id();
      
      // Reset all styles first
      cyRef.current.elements().removeClass('highlighted dimmed');
      
      // Find path from player to core
      const pathToCore = findPathToCore(playerId);
      
      // Highlight the path
      pathToCore.nodes.forEach(nodeId => {
        cyRef.current.getElementById(nodeId).addClass('highlighted');
      });
      pathToCore.edges.forEach(edgeId => {
        cyRef.current.getElementById(edgeId).addClass('highlighted');
      });
      
      // Dim non-path elements
      cyRef.current.elements().not('.highlighted').addClass('dimmed');
      
      setSelectedPlayer(playerId);
    });
    
    // Click on background to reset
    cyRef.current.on('tap', (evt) => {
      if (evt.target === cyRef.current) {
        cyRef.current.elements().removeClass('highlighted dimmed');
        setSelectedPlayer(null);
      }
    });
    
    // Helper function to find path from player to target (updated for ring structure)
    const findPathToCore = (playerId) => {
      const nodes = [];
      const edges = [];
      
      // Get player's connected R3 nodes (use first one as primary path)
      const r3Nodes = playerToR3Mapping[playerId];
      const primaryR3 = r3Nodes[0];
      nodes.push(playerId, primaryR3);
      edges.push(`${primaryR3}-${playerId}`);
      
      // Find R2 node connected to this R3 node (trace back the connection)
      const r3Index = parseInt(primaryR3.split('_')[1]);
      const r2Index = Math.ceil((r3Index * ring2Count) / ring3Count);
      const r2Node = `R2_${r2Index}`;
      nodes.push(r2Node);
      edges.push(`${r2Node}-${primaryR3}`);
      
      // Find R1 node connected to this R2 node
      const r1Index = Math.ceil((r2Index * ring1Count) / ring2Count);
      const r1Node = `R1_${r1Index}`;
      nodes.push(r1Node);
      edges.push(`${r1Node}-${r2Node}`);
      
      // Ring 1 to Target
      nodes.push('TARGET');
      edges.push(`TARGET-${r1Node}`);
      
      return { nodes, edges };
    };
    
    // Tooltip on hover
    cyRef.current.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const ele = document.createElement('div');
      ele.className = 'cy-tooltip';
      ele.innerText = `${node.data('label')} (Level ${node.data('level')})`;
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
      
      .network-container {
        background: radial-gradient(circle at center, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        position: relative;
        overflow: hidden;
      }
      
      .network-container::before {
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
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      padding: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh'
    }}>
      <h2 style={{
        color: '#495057',
        marginBottom: '20px',
        fontSize: '28px',
        fontWeight: 'bold'
      }}>Radial Multi-Level Network</h2>
      
      <div style={{
        marginBottom: '15px',
        textAlign: 'center'
      }}>
        <p style={{ 
          fontSize: '16px', 
          color: '#6c757d', 
          marginBottom: '10px',
          fontWeight: '500'
        }}>
          {selectedPlayer 
            ? `Showing path from ${selectedPlayer.replace('PLAYER_', 'Player ')} to Core` 
            : 'Click on any player to see their path to the core'}
        </p>
      </div>
      
      <div style={{
        marginBottom: '15px',
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#dc3545', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '14px', color: '#495057' }}>Core</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#fd7e14', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '14px', color: '#495057' }}>Layer 1</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#20c997', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '14px', color: '#495057' }}>Layer 2</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#0dcaf0', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '14px', color: '#495057' }}>Layer 3</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#6f42c1', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '14px', color: '#495057' }}>Players</span>
        </div>
      </div>
      
      <div 
        id="radial-net" 
        className="network-container"
        style={{ 
          width: '1200px', 
          height: '1200px', 
          border: '3px solid rgba(255,255,255,0.2)',
          borderRadius: '20px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3), inset 0 0 50px rgba(255,255,255,0.1)',
          position: 'relative'
        }} 
      />
    </div>
  );
}
