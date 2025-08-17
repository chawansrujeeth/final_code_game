import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NewBattleRoyaleMap from './components/NewBattleRoyaleMap';

export default function BattleRoyaleMapTest() {
  const navigate = useNavigate();
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [testLog, setTestLog] = useState([]);
  const [showControls, setShowControls] = useState(true);

  const addToLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTestLog(prev => [...prev.slice(-9), { timestamp, message, type }]);
  }, []);

  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData);
    addToLog(`Node clicked: ${nodeData.id} (${nodeData.type}, Level ${nodeData.level})`, 'node');
  }, [addToLog]);

  const handleEdgeClick = useCallback((edgeData) => {
    setSelectedEdge(edgeData);
    addToLog(`Edge clicked: ${edgeData.source} → ${edgeData.target} (${edgeData.difficulty})`, 'edge');
  }, [addToLog]);

  const clearLog = () => {
    setTestLog([]);
    addToLog('Test log cleared', 'system');
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'node': return '#3498db';
      case 'edge': return '#f39c12';
      case 'system': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
      padding: '20px',
      fontFamily: "'Segoe UI', 'Roboto', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        background: 'rgba(255,255,255,0.1)',
        padding: '15px 20px',
        borderRadius: '10px',
        backdropFilter: 'blur(10px)'
      }}>
        <div>
          <h1 style={{ color: '#fff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            🗺️ Battle Royale Map Testing
          </h1>
          <p style={{ color: '#bdc3c7', margin: '5px 0 0 0', fontSize: '14px' }}>
            Experimental hexagonal map design with layered zones
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowControls(!showControls)}
            style={{
              padding: '8px 16px',
              background: showControls ? '#e74c3c' : '#27ae60',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {showControls ? 'Hide Controls' : 'Show Controls'}
          </button>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '8px 16px',
              background: '#95a5a6',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ← Back to Home
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 140px)' }}>
        {/* Map Container */}
        <div style={{ 
          flex: showControls ? '2' : '1', 
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '10px',
          padding: '10px'
        }}>
          <NewBattleRoyaleMap
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            showHUD={true}
            enableZoom={true}
            enablePan={true}
          />
        </div>

        {/* Control Panel */}
        {showControls && (
          <div style={{ 
            flex: '1', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '15px',
            minWidth: '300px'
          }}>
            {/* Selection Info */}
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '15px',
              borderRadius: '10px',
              backdropFilter: 'blur(10px)'
            }}>
              <h3 style={{ color: '#fff', margin: '0 0 10px 0', fontSize: '16px' }}>
                📍 Current Selection
              </h3>
              
              {selectedNode && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ color: '#3498db', fontWeight: 'bold', fontSize: '14px' }}>
                    Node: {selectedNode.id}
                  </div>
                  <div style={{ color: '#bdc3c7', fontSize: '12px' }}>
                    Type: {selectedNode.type} | Level: {selectedNode.level}
                  </div>
                </div>
              )}
              
              {selectedEdge && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ color: '#f39c12', fontWeight: 'bold', fontSize: '14px' }}>
                    Edge: {selectedEdge.source} → {selectedEdge.target}
                  </div>
                  <div style={{ color: '#bdc3c7', fontSize: '12px' }}>
                    Difficulty: {selectedEdge.difficulty}
                  </div>
                </div>
              )}
              
              {!selectedNode && !selectedEdge && (
                <div style={{ color: '#95a5a6', fontSize: '12px', fontStyle: 'italic' }}>
                  Click on nodes or edges to see details
                </div>
              )}
            </div>

            {/* Test Log */}
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '15px',
              borderRadius: '10px',
              backdropFilter: 'blur(10px)',
              flex: '1',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '10px' 
              }}>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>
                  📋 Test Log
                </h3>
                <button
                  onClick={clearLog}
                  style={{
                    padding: '4px 8px',
                    background: '#e74c3c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '10px'
                  }}
                >
                  Clear
                </button>
              </div>
              
              <div style={{
                flex: '1',
                overflowY: 'auto',
                background: 'rgba(0,0,0,0.3)',
                padding: '10px',
                borderRadius: '5px',
                fontSize: '11px',
                fontFamily: 'monospace'
              }}>
                {testLog.length === 0 ? (
                  <div style={{ color: '#95a5a6', fontStyle: 'italic' }}>
                    No interactions yet. Click on the map to start testing.
                  </div>
                ) : (
                  testLog.map((entry, index) => (
                    <div key={index} style={{ 
                      marginBottom: '5px',
                      color: getLogColor(entry.type),
                      display: 'flex',
                      gap: '8px'
                    }}>
                      <span style={{ color: '#7f8c8d', minWidth: '60px' }}>
                        {entry.timestamp}
                      </span>
                      <span>{entry.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Map Legend */}
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '15px',
              borderRadius: '10px',
              backdropFilter: 'blur(10px)'
            }}>
              <h3 style={{ color: '#fff', margin: '0 0 10px 0', fontSize: '16px' }}>
                🎨 Map Legend
              </h3>
              <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                <div style={{ color: '#34495e' }}>⚪ Uniform Locations - All same size & color</div>
                <div style={{ color: '#7f8c8d' }}>🔗 Uniform Paths - All same difficulty</div>
                <div style={{ color: '#00ff88' }}>✨ BGMI Erangel Style - Irregular network</div>
                <div style={{ color: '#bdc3c7' }}>🎮 Click nodes/edges to interact</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
