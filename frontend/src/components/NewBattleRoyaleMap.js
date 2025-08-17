import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

// New map design constants - hexagonal grid pattern
const HEX_SIZE = 60;
const HEX_SPACING = 100;
const MAP_LAYERS = 4;

export default function NewBattleRoyaleMap({ 
  onNodeClick = () => {},
  onEdgeClick = () => {},
  isMinimized = false,
  showHUD = true,
  enableZoom = true,
  enablePan = true
}) {
  const cyRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Game state for testing
  const [gameTimer, setGameTimer] = useState(0);
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [mapStats, setMapStats] = useState({ nodes: 0, edges: 0 });

  // Timer for testing
  useEffect(() => {
    const interval = setInterval(() => {
      setGameTimer(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
    
    // Create all edges with uniform properties
    connections.forEach(([source, target]) => {
      edges.push({
        data: { id: `${source}-${target}`, source, target, type: 'path' }
      });
    });
    
    return { nodes, edges };
  };

  // Initialize Cytoscape network
  useEffect(() => {
    if (cyRef.current) cyRef.current.destroy();
    
    const { nodes, edges } = createErangelNetwork();
    setMapStats({ nodes: nodes.length, edges: edges.length });
    
    const containerEl = document.getElementById('new-battle-royale-map');
    if (!containerEl) return;
    
    cyRef.current = cytoscape({
      container: containerEl,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#34495e',
            'width': 30,
            'height': 30,
            'label': 'data(id)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#ffffff',
            'font-size': '8px',
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
        {
          selector: 'node:selected',
          style: {
            'border-width': 6,
            'border-color': '#00ff88',
            'box-shadow': '0 0 15px #00ff88'
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'width': 6,
            'line-color': '#00ff88',
            'opacity': 1
          }
        }
      ],
      layout: { name: 'preset' },
      userZoomingEnabled: enableZoom,
      userPanningEnabled: enablePan,
      minZoom: 0.3,
      maxZoom: 3
    });

    // Center and fit the map
    cyRef.current.center();
    cyRef.current.fit(null, 50);

    // Add interaction handlers
    cyRef.current.on('tap', 'node', (e) => {
      const nodeId = e.target.id();
      const nodeData = e.target.data();
      
      setSelectedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return newSet;
      });
      
      onNodeClick({ id: nodeId, ...nodeData });
    });
    
    cyRef.current.on('tap', 'edge', (e) => {
      const edgeData = e.target.data();
      onEdgeClick(edgeData);
    });

    return () => {
      if (cyRef.current) cyRef.current.destroy();
    };
  }, [enableZoom, enablePan, onNodeClick, onEdgeClick]);

  // Update node selection styles
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    cy.nodes().forEach(node => {
      if (selectedNodes.has(node.id())) {
        node.select();
      } else {
        node.unselect();
      }
    });
  }, [selectedNodes]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: '3px solid #333',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
    }}>
      {/* Testing HUD */}
      {showHUD && (
        <div style={{
          position: 'absolute',
          top: '15px',
          left: '15px',
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '15px',
          borderRadius: '10px',
          fontFamily: 'monospace',
          fontSize: '13px',
          border: '2px solid #00ff88',
          minWidth: '200px'
        }}>
          <div style={{ marginBottom: '10px', color: '#00ff88', fontWeight: 'bold', fontSize: '14px' }}>
            🗺️ NEW MAP TESTING
          </div>
          <div style={{ marginBottom: '5px' }}>
            ⏱️ Test Timer: {Math.floor(gameTimer / 60)}:{(gameTimer % 60).toString().padStart(2, '0')}
          </div>
          <div style={{ marginBottom: '5px' }}>
            🎯 Nodes: {mapStats.nodes}
          </div>
          <div style={{ marginBottom: '5px' }}>
            🔗 Edges: {mapStats.edges}
          </div>
          <div style={{ marginBottom: '5px' }}>
            ✅ Selected: {selectedNodes.size}
          </div>
          
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #444', fontSize: '11px' }}>
            <div style={{ color: '#34495e' }}>⚪ All Locations - Uniform Design</div>
            <div style={{ color: '#7f8c8d' }}>🔗 All Paths - Equal Difficulty</div>
            <div style={{ color: '#00ff88' }}>✨ BGMI Erangel Style Network</div>
          </div>
        </div>
      )}
      
      {/* Map Controls */}
      <div style={{ 
        position: 'absolute', 
        bottom: '15px', 
        right: '15px', 
        zIndex: 1000, 
        display: 'flex', 
        gap: '8px',
        flexDirection: 'column'
      }}>
        <button 
          onClick={() => {
            if (cyRef.current) {
              cyRef.current.center();
              cyRef.current.fit(null, 50);
            }
          }}
          style={{ 
            padding: '8px 12px', 
            fontSize: '11px', 
            background: '#00ff88', 
            color: '#000', 
            border: 'none', 
            borderRadius: '5px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          CENTER MAP
        </button>
        <button 
          onClick={() => setSelectedNodes(new Set())}
          style={{ 
            padding: '8px 12px', 
            fontSize: '11px', 
            background: '#ff6b6b', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '5px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          CLEAR SELECTION
        </button>
      </div>

      {/* Cytoscape map container */}
      <div 
        id="new-battle-royale-map" 
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
