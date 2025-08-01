import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';

export default function RadialNetwork() {
  const cyRef = useRef(null);

  useEffect(() => {
    if (cyRef.current) return; // prevent re-init

    // Canvas size
    const W = 1000;
    const H = 1000;
    const center = { x: W / 2, y: H / 2 };
    const R1 = 200; // radius for octagon
    const R2 = 300; // radius for child ring
    const R3 = 380; // radius for players

    // helper to convert polar to cartesian
    const polar = (r, angleDeg) => {
      const rad = (angleDeg * Math.PI) / 180;
      return { x: center.x + r * Math.cos(rad), y: center.y + r * Math.sin(rad) };
    };

    // Nodes array
    const nodes = [];

    // Core node
    nodes.push({ data: { id: 'O', label: 'O', level: 0, class: 'core' }, position: center });

    // Octagon nodes O1..O8
    for (let i = 0; i < 8; i++) {
      const id = `O${i + 1}`;
      const angle = -90 + i * 45; // start at 12 o'clock (-90 degrees)
      const pos = polar(R1, angle);
      nodes.push({ data: { id, label: id, level: 1, class: 'octagon' }, position: pos });
    }

    // Child ring nodes A1..D2
    const childIds = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
    for (let i = 0; i < 8; i++) {
      const id = childIds[i];
      const angle = -90 + i * 45 + 22.5; // halfway between octagon nodes
      const pos = polar(R2, angle);
      nodes.push({ data: { id, label: id, level: 2, class: 'child' }, position: pos });
    }

    // Player nodes A B C D
    const playerIds = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < 4; i++) {
      const id = playerIds[i];
      const angle = -90 + i * 90; // 12,3,6,9 o'clock
      const pos = polar(R3, angle);
      nodes.push({ data: { id, label: id, level: 3, class: 'player' }, position: pos });
    }

    // Edges array
    const edges = [];

    // Core to octagon
    for (let i = 1; i <= 8; i++) {
      edges.push({ data: { id: `O-O${i}`, source: 'O', target: `O${i}` } });
    }

    // Octagon sibling edges & child edges
    for (let i = 1; i <= 8; i++) {
      const curr = `O${i}`;
      const next = `O${i % 8 + 1}`; // wrap
      const child = childIds[i - 1];
      edges.push({ data: { id: `${curr}-${next}`, source: curr, target: next } });
      edges.push({ data: { id: `${curr}-${child}`, source: curr, target: child } });
    }

    // Child ring edges (adjacent) + to player
    for (let i = 0; i < 8; i++) {
      const curr = childIds[i];
      const next = childIds[(i + 1) % 8];
      edges.push({ data: { id: `${curr}-${next}`, source: curr, target: next } });

      // Map child to player
      const player = playerIds[Math.floor(i / 2)]; // each pair maps to same player
      edges.push({ data: { id: `${curr}-${player}`, source: curr, target: player } });
    }

    // Initialize cytoscape
    cyRef.current = cytoscape({
      container: document.getElementById('radial-net'),
      elements: { nodes, edges },
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#999',
            label: 'data(label)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            width: 30,
            height: 30,
            'font-size': 10,
          },
        },
        { selector: '.core', style: { 'background-color': 'red', width: 40, height: 40 } },
        { selector: '.octagon', style: { 'background-color': 'orange' } },
        { selector: '.child', style: { 'background-color': 'green' } },
        { selector: '.player', style: { 'background-color': 'blue', width: 36, height: 36 } },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#777',
          },
        },
        {
          selector: 'node:hover',
          style: {
            'border-color': '#fff',
            'border-width': 3,
          },
        },
      ],
      userZoomingEnabled: true,
      userPanningEnabled: true,
      wheelSensitivity: 0.2,
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h2>Radial Multi-Level Network</h2>
      <div id="radial-net" style={{ width: '1000px', height: '1000px', border: '1px solid #ccc' }} />
    </div>
  );
}
