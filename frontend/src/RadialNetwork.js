import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';

export default function RadialNetwork() {
  const cyRef = useRef(null);

  useEffect(() => {
    if (cyRef.current) return; // prevent re-init

    // Canvas size - increased for better spacing
    const W = 1200;
    const H = 1200;
    const center = { x: W / 2, y: H / 2 };
    
    // Improved radii with better spacing to prevent overlaps
    const R1 = 150; // radius for inner octagon (closer to center)
    const R2 = 280; // radius for middle octagon (more spacing)
    const R3 = 420; // radius for outer octagon
    const R4 = 520; // radius for players (outermost layer)

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

    // Layer 1: Inner octagon nodes (8 nodes)
    for (let i = 0; i < 8; i++) {
      const id = `L1_${i + 1}`;
      const angle = i * 45; // evenly spaced at 45° intervals
      const pos = polar(R1, angle);
      nodes.push({ 
        data: { id, label: `L1-${i + 1}`, level: 1, class: 'layer1' }, 
        position: pos 
      });
    }

    // Layer 2: Middle octagon nodes (8 nodes, offset for better visual)
    for (let i = 0; i < 8; i++) {
      const id = `L2_${i + 1}`;
      const angle = i * 45 + 22.5; // offset by 22.5° for visual clarity
      const pos = polar(R2, angle);
      nodes.push({ 
        data: { id, label: `L2-${i + 1}`, level: 2, class: 'layer2' }, 
        position: pos 
      });
    }

    // Layer 3: Outer octagon nodes (8 nodes)
    for (let i = 0; i < 8; i++) {
      const id = `L3_${i + 1}`;
      const angle = i * 45; // aligned with layer 1
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
      const angle = i * 90; // 0°, 90°, 180°, 270° (N, E, S, W)
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

    // Core to Layer 1 connections (radial spokes)
    for (let i = 0; i < 8; i++) {
      pushEdge('CORE', `L1_${i + 1}`, 'core-to-layer1');
    }

    // Layer 1 ring connections (octagon)
    for (let i = 0; i < 8; i++) {
      const curr = `L1_${i + 1}`;
      const next = `L1_${(i + 1) % 8 + 1}`;
      pushEdge(curr, next, 'layer1-ring');
    }

    // Layer 1 to Layer 2 connections (every L1 node connects to 2 L2 nodes)
    for (let i = 0; i < 8; i++) {
      const l1Node = `L1_${i + 1}`;
      // Connect to the two nearest L2 nodes
      const l2Node1 = `L2_${i + 1}`;
      const l2Node2 = `L2_${(i + 1) % 8 + 1}`;
      pushEdge(l1Node, l2Node1, 'layer1-to-layer2');
      pushEdge(l1Node, l2Node2, 'layer1-to-layer2');
    }

    // Layer 2 ring connections (octagon)
    for (let i = 0; i < 8; i++) {
      const curr = `L2_${i + 1}`;
      const next = `L2_${(i + 1) % 8 + 1}`;
      pushEdge(curr, next, 'layer2-ring');
    }

    // Layer 2 to Layer 3 connections
    for (let i = 0; i < 8; i++) {
      const l2Node = `L2_${i + 1}`;
      // Connect to nearest L3 node
      const l3Node = `L3_${(i + 4) % 8 + 1}`; // offset mapping
      pushEdge(l2Node, l3Node, 'layer2-to-layer3');
    }

    // Layer 3 ring connections (octagon)
    for (let i = 0; i < 8; i++) {
      const curr = `L3_${i + 1}`;
      const next = `L3_${(i + 1) % 8 + 1}`;
      pushEdge(curr, next, 'layer3-ring');
    }

    // Layer 3 to Player connections (each player connects to 2 L3 nodes)
    for (let i = 0; i < 4; i++) {
      const player = playerIds[i];
      // Each player connects to 2 L3 nodes
      const l3Node1 = `L3_${i * 2 + 1}`;
      const l3Node2 = `L3_${i * 2 + 2}`;
      pushEdge(l3Node1, player, 'layer3-to-player');
      pushEdge(l3Node2, player, 'layer3-to-player');
    }

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
            'border-width': 2,
            'border-color': '#fff',
            'text-outline-width': 1,
            'text-outline-color': '#000',
          },
        },
        // Core node styling
        { 
          selector: '.core', 
          style: { 
            'background-color': '#dc3545', 
            width: 50, 
            height: 50,
            'font-size': 12,
            'border-width': 3,
            'border-color': '#fff'
          } 
        },
        // Layer 1 nodes
        { 
          selector: '.layer1', 
          style: { 
            'background-color': '#fd7e14', 
            width: 40, 
            height: 40,
            'font-size': 8
          } 
        },
        // Layer 2 nodes
        { 
          selector: '.layer2', 
          style: { 
            'background-color': '#20c997', 
            width: 38, 
            height: 38,
            'font-size': 8
          } 
        },
        // Layer 3 nodes
        { 
          selector: '.layer3', 
          style: { 
            'background-color': '#0dcaf0', 
            width: 36, 
            height: 36,
            'font-size': 8
          } 
        },
        // Player nodes
        { 
          selector: '.player', 
          style: { 
            'background-color': '#6f42c1', 
            width: 55, 
            height: 55,
            'font-size': 10,
            'border-width': 3,
            'border-color': '#fff'
          } 
        },
        // Base edge styling
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#dee2e6',
            'curve-style': 'straight',
            opacity: 0.7,
          },
        },
        // Core to Layer 1 edges
        { 
          selector: "edge[group='core-to-layer1']", 
          style: { 
            'line-color': '#dc3545', 
            width: 3,
            opacity: 0.8
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
        // Layer 1 to Layer 2 edges
        { 
          selector: "edge[group='layer1-to-layer2']", 
          style: { 
            'line-color': '#ffc107', 
            width: 2,
            opacity: 0.6
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
            'line-color': '#17a2b8', 
            width: 2,
            opacity: 0.6
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
        // Layer 3 to Player edges
        { 
          selector: "edge[group='layer3-to-player']", 
          style: { 
            'line-color': '#6f42c1', 
            width: 3,
            opacity: 0.8
          } 
        },
        // Hover effects
        {
          selector: 'node:hover',
          style: {
            'border-color': '#ffc107',
            'border-width': 4,
            'background-color': 'data(hoverColor)',
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

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      padding: '20px',
      backgroundColor: '#f8f9fa',
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
        style={{ 
          width: '1200px', 
          height: '1200px', 
          border: '2px solid #dee2e6',
          borderRadius: '10px',
          backgroundColor: '#fff',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }} 
      />
    </div>
  );
}
