import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

export default function RadialNetwork() {
  const cyRef = useRef(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  useEffect(() => {
    if (cyRef.current) return; // prevent re-init

    // Canvas size - optimized for geometric shape
    const W = 1200;
    const H = 1200;
    const center = { x: W / 2, y: H / 2 };
    
    // Diamond/Pyramid structure with clear geometric positioning
    const R1 = 100; // inner diamond - very close to center
    const R2 = 200; // middle diamond
    const R3 = 300; // outer diamond
    const R4 = 450; // player positions - cardinal points

    // helper to convert polar to cartesian
    const polar = (r, angleDeg) => {
      const rad = (angleDeg * Math.PI) / 180;
      return { x: center.x + r * Math.cos(rad), y: center.y + r * Math.sin(rad) };
    };

    // Nodes array
    const nodes = [];

    // Core node - centered
    nodes.push({ 
      data: { id: 'CORE', label: 'CORE', level: 0, class: 'core' }, 
      position: center 
    });

    // Layer 1: Inner diamond (4 nodes at 45° angles for clean diamond)
    const layer1Angles = [45, 135, 225, 315]; // NE, NW, SW, SE
    for (let i = 0; i < 4; i++) {
      const id = `L1_${i + 1}`;
      const angle = layer1Angles[i];
      const pos = polar(R1, angle);
      nodes.push({ 
        data: { id, label: `L1-${i + 1}`, level: 1, class: 'layer1' }, 
        position: pos 
      });
    }

    // Layer 2: Middle diamond (4 nodes at cardinal directions)
    const layer2Angles = [0, 90, 180, 270]; // N, E, S, W
    for (let i = 0; i < 4; i++) {
      const id = `L2_${i + 1}`;
      const angle = layer2Angles[i];
      const pos = polar(R2, angle);
      nodes.push({ 
        data: { id, label: `L2-${i + 1}`, level: 2, class: 'layer2' }, 
        position: pos 
      });
    }

    // Layer 3: Outer diamond (4 nodes at 45° angles, aligned with L1)
    for (let i = 0; i < 4; i++) {
      const id = `L3_${i + 1}`;
      const angle = layer1Angles[i]; // same angles as L1 for perfect alignment
      const pos = polar(R3, angle);
      nodes.push({ 
        data: { id, label: `L3-${i + 1}`, level: 3, class: 'layer3' }, 
        position: pos 
      });
    }

    // Layer 4: Player nodes (4 nodes at cardinal directions)
    const playerIds = ['PLAYER_A', 'PLAYER_B', 'PLAYER_C', 'PLAYER_D'];
    const playerLabels = ['Player A', 'Player B', 'Player C', 'Player D'];
    for (let i = 0; i < 4; i++) {
      const id = playerIds[i];
      const angle = layer2Angles[i]; // same as L2 for alignment
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

    // Core to Layer 1 connections (4 clean diagonal spokes)
    for (let i = 0; i < 4; i++) {
      pushEdge('CORE', `L1_${i + 1}`, 'core-to-layer1');
    }

    // Layer 1 diamond connections (form perfect diamond shape)
    const l1Connections = [
      ['L1_1', 'L1_2'], // NE to NW
      ['L1_2', 'L1_3'], // NW to SW  
      ['L1_3', 'L1_4'], // SW to SE
      ['L1_4', 'L1_1']  // SE to NE
    ];
    l1Connections.forEach(([from, to]) => {
      pushEdge(from, to, 'layer1-ring');
    });

    // Layer 1 to Layer 2 connections (diagonal to cardinal mapping)
    const l1ToL2Mapping = {
      'L1_1': 'L2_1', // NE to N
      'L1_2': 'L2_2', // NW to E  
      'L1_3': 'L2_3', // SW to S
      'L1_4': 'L2_4'  // SE to W
    };
    Object.entries(l1ToL2Mapping).forEach(([l1, l2]) => {
      pushEdge(l1, l2, 'layer1-to-layer2');
    });

    // Layer 2 square connections (form perfect square)
    const l2Connections = [
      ['L2_1', 'L2_2'], // N to E
      ['L2_2', 'L2_3'], // E to S
      ['L2_3', 'L2_4'], // S to W
      ['L2_4', 'L2_1']  // W to N
    ];
    l2Connections.forEach(([from, to]) => {
      pushEdge(from, to, 'layer2-ring');
    });

    // Layer 2 to Layer 3 connections (cardinal to diagonal mapping)
    const l2ToL3Mapping = {
      'L2_1': 'L3_1', // N to NE
      'L2_2': 'L3_2', // E to NW
      'L2_3': 'L3_3', // S to SW
      'L2_4': 'L3_4'  // W to SE
    };
    Object.entries(l2ToL3Mapping).forEach(([l2, l3]) => {
      pushEdge(l2, l3, 'layer2-to-layer3');
    });

    // Layer 3 diamond connections (outer diamond)
    const l3Connections = [
      ['L3_1', 'L3_2'], // NE to NW
      ['L3_2', 'L3_3'], // NW to SW
      ['L3_3', 'L3_4'], // SW to SE
      ['L3_4', 'L3_1']  // SE to NE
    ];
    l3Connections.forEach(([from, to]) => {
      pushEdge(from, to, 'layer3-ring');
    });

    // Layer 3 to Player connections (direct cardinal paths)
    const playerToL3Mapping = {
      'PLAYER_A': 'L3_1', // North player to NE
      'PLAYER_B': 'L3_2', // East player to NW
      'PLAYER_C': 'L3_3', // South player to SW
      'PLAYER_D': 'L3_4'  // West player to SE
    };
    
    Object.entries(playerToL3Mapping).forEach(([player, l3Node]) => {
      pushEdge(l3Node, player, 'layer3-to-player');
    });

    // Initialize cytoscape
    cyRef.current = cytoscape({
      container: document.getElementById('radial-net'),
      elements: { nodes, edges },
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#6c757d',
            label: 'data(label)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            width: 35,
            height: 35,
            'font-size': 9,
            'font-weight': 'bold',
            'border-width': 3,
            'border-color': '#fff',
            'text-outline-width': 2,
            'text-outline-color': '#000',
            'box-shadow': '0 8px 16px rgba(0,0,0,0.3)',
            'background-gradient-stop-colors': 'data(gradientColors)',
            'background-gradient-stop-positions': '0% 100%',
            'background-gradient-direction': 'to-bottom',
          },
        },
        // Core node styling - 3D effect
        { 
          selector: '.core', 
          style: { 
            'background-color': '#ff1744', 
            width: 60, 
            height: 60,
            'font-size': 14,
            'border-width': 5,
            'border-color': '#fff',
            'box-shadow': '0 12px 24px rgba(255,23,68,0.4), inset 0 -8px 16px rgba(0,0,0,0.2)',
            'background-gradient-stop-colors': '#ff1744 #d32f2f',
            'z-index': 100
          } 
        },
        // Layer 1 nodes - elevated 3D
        { 
          selector: '.layer1', 
          style: { 
            'background-color': '#ff9800', 
            width: 45, 
            height: 45,
            'font-size': 9,
            'box-shadow': '0 10px 20px rgba(255,152,0,0.3), inset 0 -6px 12px rgba(0,0,0,0.15)',
            'background-gradient-stop-colors': '#ff9800 #f57c00',
            'z-index': 80
          } 
        },
        // Layer 2 nodes - mid-level 3D
        { 
          selector: '.layer2', 
          style: { 
            'background-color': '#26a69a', 
            width: 42, 
            height: 42,
            'font-size': 8,
            'box-shadow': '0 8px 16px rgba(38,166,154,0.25), inset 0 -5px 10px rgba(0,0,0,0.1)',
            'background-gradient-stop-colors': '#26a69a #00695c',
            'z-index': 60
          } 
        },
        // Layer 3 nodes - outer 3D
        { 
          selector: '.layer3', 
          style: { 
            'background-color': '#29b6f6', 
            width: 40, 
            height: 40,
            'font-size': 8,
            'box-shadow': '0 6px 12px rgba(41,182,246,0.2), inset 0 -4px 8px rgba(0,0,0,0.08)',
            'background-gradient-stop-colors': '#29b6f6 #0277bd',
            'z-index': 40
          } 
        },
        // Player nodes - prominent 3D
        { 
          selector: '.player', 
          style: { 
            'background-color': '#7c4dff', 
            width: 65, 
            height: 65,
            'font-size': 11,
            'border-width': 4,
            'border-color': '#fff',
            'box-shadow': '0 15px 30px rgba(124,77,255,0.4), inset 0 -10px 20px rgba(0,0,0,0.25)',
            'background-gradient-stop-colors': '#7c4dff #512da8',
            'z-index': 20
          } 
        },
        // Base edge styling - 3D pathways
        {
          selector: 'edge',
          style: {
            width: 3,
            'line-color': '#90a4ae',
            'curve-style': 'straight',
            opacity: 0.6,
            'line-cap': 'round',
            'source-arrow-shape': 'none',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#90a4ae',
          },
        },
        // Core to Layer 1 edges - main pathways
        { 
          selector: "edge[group='core-to-layer1']", 
          style: { 
            'line-color': '#ff1744', 
            width: 5,
            opacity: 0.9,
            'target-arrow-color': '#ff1744',
            'line-style': 'solid'
          } 
        },
        // Layer 1 ring edges
        { 
          selector: "edge[group='layer1-ring']", 
          style: { 
            'line-color': '#fd7e14', 
            width: 2.5
          } 
        },
        // Layer 1 to Layer 2 edges - connection paths
        { 
          selector: "edge[group='layer1-to-layer2']", 
          style: { 
            'line-color': '#ffb300', 
            width: 4,
            opacity: 0.7,
            'target-arrow-color': '#ffb300'
          } 
        },
        // Layer 2 ring edges
        { 
          selector: "edge[group='layer2-ring']", 
          style: { 
            'line-color': '#20c997', 
            width: 2.5
          } 
        },
        // Layer 2 to Layer 3 edges
        { 
          selector: "edge[group='layer2-to-layer3']", 
          style: { 
            'line-color': '#00acc1', 
            width: 4,
            opacity: 0.7,
            'target-arrow-color': '#00acc1'
          } 
        },
        // Layer 3 ring edges
        { 
          selector: "edge[group='layer3-ring']", 
          style: { 
            'line-color': '#0dcaf0', 
            width: 2.5
          } 
        },
        // Layer 3 to Player edges - entry points
        { 
          selector: "edge[group='layer3-to-player']", 
          style: { 
            'line-color': '#7c4dff', 
            width: 6,
            opacity: 0.9,
            'target-arrow-color': '#7c4dff',
            'source-arrow-shape': 'circle',
            'source-arrow-color': '#7c4dff'
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
            width: 8,
            opacity: 1,
            'target-arrow-color': '#ffeb3b',
            'source-arrow-color': '#ffeb3b',
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
      userZoomingEnabled: true,
      userPanningEnabled: true,
      wheelSensitivity: 0.1,
      minZoom: 0.3,
      maxZoom: 2,
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
    
    // Helper function to find path from player to core (updated for diamond structure)
    const findPathToCore = (playerId) => {
      const nodes = [];
      const edges = [];
      
      // Get player's connected L3 node
      const l3Node = playerToL3Mapping[playerId];
      nodes.push(playerId, l3Node);
      edges.push(`${l3Node}-${playerId}`);
      
      // Find L2 node connected to this L3 node
      const l2Node = Object.entries(l2ToL3Mapping).find(([l2, l3]) => l3 === l3Node)[0];
      nodes.push(l2Node);
      edges.push(`${l2Node}-${l3Node}`);
      
      // Find L1 node connected to this L2 node
      const l1Node = Object.entries(l1ToL2Mapping).find(([l1, l2]) => l2 === l2Node)[0];
      nodes.push(l1Node);
      edges.push(`${l1Node}-${l2Node}`);
      
      // Layer 1 to Core
      nodes.push('CORE');
      edges.push(`CORE-${l1Node}`);
      
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
