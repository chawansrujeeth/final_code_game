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
    const R2 = 300; // radius for outer octagon
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

    // Outer octagon nodes X1..X8
    const outerIds = ['X1','X2','X3','X4','X5','X6','X7','X8'];
    for (let i = 0; i < 8; i++) {
      const id = outerIds[i];
      const angle = -90 + i * 45 + 22.5; // halfway offset for symmetry
      const pos = polar(R2, angle);
      nodes.push({ data: { id, label: id, level: 2, class: 'outer' }, position: pos });
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

    // Edge helper to push with group and style
    const pushEdge = (source, target, group, opts = {}) => {
      edges.push({ data: { id: `${source}-${target}`, source, target, group, ...opts } });
    };

    // Core to octagon
    for (let i = 1; i <= 8; i++) {
      pushEdge('O', `O${i}`, 'core', { dashed: true });
    }

    // Inner octagon sibling edges & links to outer
    for (let i = 1; i <= 8; i++) {
      const curr = `O${i}`;
      const next = `O${i % 8 + 1}`;
      const outer = outerIds[i - 1];
      pushEdge(curr, next, 'inner');
      pushEdge(curr, outer, 'radial');
    }

    // Outer octagon sibling edges + to player
    for (let i = 0; i < 8; i++) {
      const curr = outerIds[i];
      const next = outerIds[(i + 1) % 8];
      pushEdge(curr, next, 'outer');

      // map outer to player (each 2 share player)
      const player = playerIds[Math.floor(i / 2)];
      pushEdge(curr, player, 'player');
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
        { selector: '.outer', style: { 'background-color': 'green' } },
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
