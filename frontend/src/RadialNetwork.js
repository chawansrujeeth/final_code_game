import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

export default function RadialNetwork({ 
  playerCount = 4, 
  nodeData = {},
  gameState = {},
  onNodeClick = () => {},
  onEdgeClick = () => {},
  onPlayerMove = () => {},
  isMinimized = false,
  showHUD = true,
  enableZoom = false,
  enablePan = false
}) {
  const cyRef = useRef(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
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
          .selector('.player')
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
          .selector('.player')
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
  
  useEffect(() => {
    if (cyRef.current) return; // prevent re-init

    // Canvas size - optimized for concentric target structure
    const W = 1200;
    const H = 1200;
    const center = { x: W / 2, y: H / 2 };
    
    // Concentric rings - target/bullseye structure (scalable based on player count)
    const R1 = 80;  // inner ring - close to target
    const R2 = 160; // middle ring
    const R3 = 240; // outer ring
    const R4 = Math.max(380, 300 + (playerCount * 20)); // player ring - scales with player count

    // helper to convert polar to cartesian
    const polar = (r, angleDeg) => {
      const rad = (angleDeg * Math.PI) / 180;
      return { x: center.x + r * Math.cos(rad), y: center.y + r * Math.sin(rad) };
    };

    // Nodes array
    const nodes = [];

    // SAFE ZONE - Core node at center (final safe zone)
    nodes.push({ 
      data: { 
        id: 'TARGET', 
        label: 'VICTORY ZONE', 
        level: 0, 
        class: 'core',
        nodeType: 'target',
        isWinCondition: true,
        zoneType: 'safe',
        safePointInfo: 'Final destination - reach here to win!',
        ...nodeData.TARGET
      }, 
      position: center 
    });

    // RING 1: Inner ring (6 nodes evenly distributed)
    const ring1Count = 6;
    for (let i = 0; i < ring1Count; i++) {
      const id = `R1_${i + 1}`;
      const angle = (i * 360) / ring1Count; // evenly distributed
      const pos = polar(R1, angle);
      nodes.push({ 
        data: { 
          id, 
          label: `Safe Point 1-${i + 1}`, 
          level: 1, 
          class: 'layer1',
          nodeType: 'ring1',
          ringIndex: i,
          zoneType: 'safe',
          safePointInfo: `Inner ring safe point - high security zone`,
          maxHealth: 100,
          ...nodeData[id]
        }, 
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
        data: { 
          id, 
          label: `Safe Point 2-${i + 1}`, 
          level: 2, 
          class: 'layer2',
          nodeType: 'ring2',
          ringIndex: i,
          zoneType: 'safe',
          safePointInfo: `Middle ring safe point - moderate security`,
          maxHealth: 100,
          ...nodeData[id]
        }, 
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
        data: { 
          id, 
          label: `Safe Point 3-${i + 1}`, 
          level: 3, 
          class: 'layer3',
          nodeType: 'ring3',
          ringIndex: i,
          zoneType: 'safe',
          safePointInfo: `Outer ring safe point - basic security`,
          maxHealth: 100,
          ...nodeData[id]
        }, 
        position: pos 
      });
    }

    // PLAYERS: Outermost ring (variable player count)
    const playerIds = [];
    const playerLabels = [];
    const playerAngles = [];
    
    // Generate player data based on playerCount
    for (let i = 0; i < playerCount; i++) {
      playerIds.push(`PLAYER_${String.fromCharCode(65 + i)}`);
      playerLabels.push(`Player ${String.fromCharCode(65 + i)}`);
      playerAngles.push((i * 360) / playerCount); // Evenly distribute around circle
    }
    
    for (let i = 0; i < playerCount; i++) {
      const id = playerIds[i];
      const angle = playerAngles[i];
      const pos = polar(R4, angle);
      nodes.push({ 
        data: { 
          id, 
          label: playerLabels[i], 
          level: 4, 
          class: 'player',
          nodeType: 'player',
          playerIndex: i,
          health: 100,
          maxHealth: 100,
          currentZone: 4, // Start in outermost zone
          isAlive: true,
          questionsAnswered: 0,
          canMoveTo: [3], // Can only move to ring 3 initially
          ...nodeData[id]
        }, 
        position: pos 
      });
    }

    // Edges array
    const edges = [];

    // Edge helper to push with group and style - now includes question info
    const pushEdge = (source, target, group, opts = {}) => {
      if (source === target) return; // avoid self loops
      const edgeId = `${source}-${target}`;
      
      // Create simple edge label based on question info
      let edgeLabel = '';
      if (opts.hasQuestion) {
        // Simple text labels instead of emojis
        const difficultyText = opts.questionDifficulty === 'easy' ? 'E' : 
                              opts.questionDifficulty === 'medium' ? 'M' : 'H';
        edgeLabel = difficultyText;
      }
      
      edges.push({ 
        data: { 
          id: edgeId, 
          source, 
          target, 
          group, 
          label: edgeLabel,
          hasQuestion: opts.hasQuestion || false,
          questionDifficulty: opts.questionDifficulty || 'unknown',
          pathType: opts.pathType || 'unknown',
          ...opts 
        } 
      });
    };

    // Ring 1 to TARGET connections (final approach - hardest questions)
    for (let i = 1; i <= ring1Count; i++) {
      pushEdge(`R1_${i}`, 'TARGET', 'ring1-to-target', {
        hasQuestion: true,
        questionDifficulty: 'hard',
        pathType: 'final'
      });
    }

    // Ring 1 circular connections (lateral movement - hard questions)
    for (let i = 1; i <= ring1Count; i++) {
      const curr = `R1_${i}`;
      const next = `R1_${(i % ring1Count) + 1}`;
      pushEdge(curr, next, 'ring1-circle', {
        hasQuestion: true,
        questionDifficulty: 'hard',
        pathType: 'lateral'
      });
    }

    // Ring 2 to Ring 1 connections (inward movement - medium questions)
    for (let i = 1; i <= ring2Count; i++) {
      const r2Node = `R2_${i}`;
      // Connect to nearest R1 nodes for inward progression
      const r1Index1 = Math.floor(((i - 1) * ring1Count) / ring2Count) + 1;
      const r1Index2 = (r1Index1 % ring1Count) + 1;
      pushEdge(r2Node, `R1_${r1Index1}`, 'ring2-to-ring1', {
        hasQuestion: true,
        questionDifficulty: 'medium',
        pathType: 'inward'
      });
      pushEdge(r2Node, `R1_${r1Index2}`, 'ring2-to-ring1', {
        hasQuestion: true,
        questionDifficulty: 'medium',
        pathType: 'inward'
      });
    }

    // Ring 2 circular connections (lateral movement - medium questions)
    for (let i = 1; i <= ring2Count; i++) {
      const curr = `R2_${i}`;
      const next = `R2_${(i % ring2Count) + 1}`;
      pushEdge(curr, next, 'ring2-circle', {
        hasQuestion: true,
        questionDifficulty: 'medium',
        pathType: 'lateral'
      });
    }

    // Ring 3 to Ring 2 connections (inward movement - easy questions)
    for (let i = 1; i <= ring3Count; i++) {
      const r3Node = `R3_${i}`;
      // Connect to nearest R2 nodes for inward progression
      const r2Index1 = Math.floor(((i - 1) * ring2Count) / ring3Count) + 1;
      const r2Index2 = (r2Index1 % ring2Count) + 1;
      pushEdge(r3Node, `R2_${r2Index1}`, 'ring3-to-ring2', {
        hasQuestion: true,
        questionDifficulty: 'easy',
        pathType: 'inward'
      });
      pushEdge(r3Node, `R2_${r2Index2}`, 'ring3-to-ring2', {
        hasQuestion: true,
        questionDifficulty: 'easy',
        pathType: 'inward'
      });
    }

    // Ring 3 circular connections (lateral movement - easy questions)
    for (let i = 1; i <= ring3Count; i++) {
      const curr = `R3_${i}`;
      const next = `R3_${(i % ring3Count) + 1}`;
      pushEdge(curr, next, 'ring3-circle', {
        hasQuestion: true,
        questionDifficulty: 'easy',
        pathType: 'lateral'
      });
    }

    // Ring 3 to Player connections (dynamic based on player count)
    const playerToR3Mapping = {};
    const nodesPerPlayer = Math.floor(ring3Count / playerCount);
    const extraNodes = ring3Count % playerCount;
    
    let r3NodeIndex = 0;
    for (let i = 0; i < playerCount; i++) {
      const playerId = playerIds[i];
      const nodesToConnect = nodesPerPlayer + (i < extraNodes ? 1 : 0);
      const connectedNodes = [];
      
      for (let j = 0; j < nodesToConnect; j++) {
        const r3Id = `R3_${(r3NodeIndex % ring3Count) + 1}`;
        connectedNodes.push(r3Id);
        r3NodeIndex++;
      }
      
      playerToR3Mapping[playerId] = connectedNodes;
    }
    
    Object.entries(playerToR3Mapping).forEach(([player, r3Nodes]) => {
      r3Nodes.forEach(r3Node => {
        pushEdge(player, r3Node, 'player-to-ring3', {
          hasQuestion: false, // No question needed to move from player spawn to outer ring
          pathType: 'spawn'
        });
      });
    });

    // Initialize cytoscape with fixed layout
    cyRef.current = cytoscape({
      container: document.getElementById('cy'),
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
            'background-color': '#4a90e2',
            label: 'data(label)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            width: 30,
            height: 30,
            'font-size': 8,
            'font-weight': 'bold',
            'border-width': 2,
            'border-color': '#fff',
            'text-outline-width': 1,
            'text-outline-color': '#000'
          },
        },
        // Safe Zone styling - green center
        { 
          selector: '.core', 
          style: { 
            'background-color': '#28a745', 
            width: 40, 
            height: 40,
            'font-size': 10,
            'border-width': 3,
            'border-color': '#fff'
          } 
        },
        // Zone 1 nodes - inner safe zone
        { 
          selector: '.layer1', 
          style: { 
            'background-color': '#fd7e14', 
            width: 35, 
            height: 35,
            'font-size': 8
          } 
        },
        // Zone 1 - Blue zone (danger)
        { 
          selector: '.layer1.blue-zone', 
          style: { 
            'background-color': '#007bff',
            'border-color': '#0056b3',
            'border-width': 3
          } 
        },
        // Zone 2 nodes - middle zone
        { 
          selector: '.layer2', 
          style: { 
            'background-color': '#ffc107', 
            width: 32, 
            height: 32,
            'font-size': 8
          } 
        },
        // Zone 2 - Blue zone (danger)
        { 
          selector: '.layer2.blue-zone', 
          style: { 
            'background-color': '#007bff',
            'border-color': '#0056b3',
            'border-width': 3
          } 
        },
        // Zone 3 nodes - outer zone
        { 
          selector: '.layer3', 
          style: { 
            'background-color': '#17a2b8', 
            width: 30, 
            height: 30,
            'font-size': 8
          } 
        },
        // Zone 3 - Blue zone (danger)
        { 
          selector: '.layer3.blue-zone', 
          style: { 
            'background-color': '#007bff',
            'border-color': '#0056b3',
            'border-width': 3
          } 
        },
        // Player nodes - prominent
        { 
          selector: '.player', 
          style: { 
            'background-color': '#6f42c1', 
            width: 40, 
            height: 40,
            'font-size': 10,
            'border-width': 3,
            'border-color': '#fff',
            'font-weight': 'bold'
          } 
        },
        // Available move highlighting
        { 
          selector: '.available', 
          style: { 
            'border-color': '#28a745',
            'border-width': 4,
            'border-style': 'dashed'
          } 
        },
        // Blue zone overlay effect
        { 
          selector: '.blue-zone', 
          style: { 
            'overlay-color': '#007bff',
            'overlay-opacity': 0.3,
            'overlay-shape': 'round-rectangle'
          } 
        },
        // Dead player styling
        { 
          selector: '.player.dead', 
          style: { 
            'background-color': '#6c757d',
            opacity: 0.5,
            'border-color': '#dc3545'
          } 
        },
        // Low health player styling
        { 
          selector: '.player.low-health', 
          style: { 
            'border-color': '#dc3545',
            'border-width': 5
          } 
        },
        // Base edge styling - simple and clean
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#666',
            'curve-style': 'straight',
            opacity: 0.8,
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#666',
            label: 'data(label)',
            'font-size': 10,
            'font-weight': 'bold',
            'text-background-color': '#000',
            'text-background-opacity': 0.7,
            'text-background-padding': '2px',
            color: '#fff'
          },
        },
        // Ring 1 to Target edges - final approach (hardest questions)
        { 
          selector: "edge[group='ring1-to-target']", 
          style: { 
            'line-color': '#dc3545', 
            width: 3
          } 
        },
        // Ring 1 circular edges (lateral hard questions)
        { 
          selector: "edge[group='ring1-circle']", 
          style: { 
            'line-color': '#fd7e14', 
            width: 2
          } 
        },
        // Ring 2 to Ring 1 edges (inward medium questions)
        { 
          selector: "edge[group='ring2-to-ring1']", 
          style: { 
            'line-color': '#ffc107', 
            width: 3
          } 
        },
        // Ring 2 circular edges (lateral medium questions)
        { 
          selector: "edge[group='ring2-circle']", 
          style: { 
            'line-color': '#20c997', 
            width: 2
          } 
        },
        // Ring 3 to Ring 2 edges (inward easy questions)
        { 
          selector: "edge[group='ring3-to-ring2']", 
          style: { 
            'line-color': '#17a2b8', 
            width: 3
          } 
        },
        // Ring 3 circular edges (lateral easy questions)
        { 
          selector: "edge[group='ring3-circle']", 
          style: { 
            'line-color': '#0dcaf0', 
            width: 2
          } 
        },
        // Player to Ring 3 edges - spawn connections (no questions)
        { 
          selector: "edge[group='player-to-ring3']", 
          style: { 
            'line-color': '#6f42c1', 
            width: 2,
            'line-style': 'dashed'
          } 
        },
        // Question edges - simple styling
        {
          selector: "edge[hasQuestion='true']",
          style: {
            'target-arrow-shape': 'triangle'
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
      // Configure user interactions based on props
      userZoomingEnabled: enableZoom,
      userPanningEnabled: enablePan,
      zoomingEnabled: enableZoom,
      panningEnabled: enablePan,
      boxSelectionEnabled: false,
      selectionType: 'single',
      autoungrabify: true, // Make nodes ungrabbable
      autounselectify: false
    });

    // Node click handler - safe points (no questions)
    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();
      
      if (nodeData.nodeType === 'player') {
        // Player selection
        setSelectedPlayer(nodeData.id);
        highlightPlayerOptions(nodeData.id);
      } else {
        // Safe point clicked - show information
        onNodeClick(nodeData);
      }
    });
    
    // Edge click handler - attempt to traverse path (answer question)
    cyRef.current.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const edgeData = edge.data();
      
      if (edgeData.hasQuestion) {
        // Edge with question clicked - attempt traversal
        onEdgeClick(edgeData);
      }
    });
    
    // Function to highlight available moves for selected player
    const highlightPlayerOptions = (playerId) => {
      cyRef.current.elements().removeClass('highlighted dimmed available');
      
      const playerNode = cyRef.current.getElementById(playerId);
      const playerData = playerNode.data();
      
      if (!playerData.isAlive) return;
      
      // Highlight available zones player can move to
      playerData.canMoveTo?.forEach(level => {
        cyRef.current.nodes().forEach(node => {
          const nodeData = node.data();
          if (nodeData.level === level && nodeData.nodeType !== 'player') {
            node.addClass('available');
          }
        });
      });
      
      // Dim unavailable nodes
      cyRef.current.elements().not('.available').not(`#${playerId}`).addClass('dimmed');
    };
    
    // Game mechanics helper functions
    const updatePlayerHealth = (playerId, healthChange) => {
      const playerNode = cyRef.current.getElementById(playerId);
      const currentHealth = playerNode.data('health');
      const newHealth = Math.max(0, Math.min(100, currentHealth + healthChange));
      
      playerNode.data('health', newHealth);
      
      // Update visual styling based on health
      if (newHealth <= 0) {
        playerNode.data('isAlive', false);
        playerNode.addClass('dead');
      } else if (newHealth <= 30) {
        playerNode.addClass('low-health');
      } else {
        playerNode.removeClass('low-health');
      }
    };
    
    const movePlayerToZone = (playerId, targetZoneLevel) => {
      const playerNode = cyRef.current.getElementById(playerId);
      const playerData = playerNode.data();
      
      if (!playerData.isAlive) return false;
      if (!playerData.canMoveTo.includes(targetZoneLevel)) return false;
      
      // Update player's current zone
      playerNode.data('currentZone', targetZoneLevel);
      
      // Update available moves (can move to current zone or one level inward)
      const newCanMoveTo = [];
      if (targetZoneLevel > 0) newCanMoveTo.push(targetZoneLevel - 1);
      if (targetZoneLevel < 4) newCanMoveTo.push(targetZoneLevel);
      
      playerNode.data('canMoveTo', newCanMoveTo);
      
      // Trigger callback
      onPlayerMove(playerId, targetZoneLevel);
      
      return true;
    };
    
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
    
    // Enhanced game tooltip on hover
    cyRef.current.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();
      const ele = document.createElement('div');
      ele.className = 'cy-tooltip';
      
      // Build game-specific tooltip content
      let tooltipContent = `${nodeData.label}`;
      
      if (nodeData.nodeType === 'player') {
        tooltipContent += `\nHealth: ${nodeData.health}/${nodeData.maxHealth}`;
        tooltipContent += `\nZone: ${nodeData.currentZone}`;
        tooltipContent += `\nStatus: ${nodeData.isAlive ? 'Alive' : 'Dead'}`;
        tooltipContent += `\nQuestions: ${nodeData.questionsAnswered}`;
      } else if (nodeData.questionId) {
        tooltipContent += `\nQuestion: ${nodeData.questionId}`;
        tooltipContent += `\nZone Type: ${nodeData.zoneType}`;
        if (nodeData.zoneType === 'danger') {
          tooltipContent += `\n💀 Damage: -10 HP/turn`;
        }
        tooltipContent += `\n🎯 Click to attempt question`;
      } else if (nodeData.isWinCondition) {
        tooltipContent += `\n🏆 Win Condition: Reach here to win!`;
        tooltipContent += `\n✨ No questions required`;
      }
      
      ele.innerText = tooltipContent;
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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
          {selectedPlayer && (
            <div style={{ marginTop: '10px', borderTop: '1px solid #666', paddingTop: '10px' }}>
              <div>🎯 Selected: {selectedPlayer}</div>
              <div>💡 Click zones to answer questions</div>
              <div>🏃 Move to inner zones to survive</div>
            </div>
          )}
        </div>
      )}
      

      
      <div 
        id="cy" 
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
