import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { socket } from "./socket";
import useDarkMode from "./useDarkMode";

export default function GameLobby({ user }) {
  const navigate = useNavigate();
  const [isDark, toggleDark] = useDarkMode();
  
  const [lobby, setLobby] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [status, setStatus] = useState("Connecting...");
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    const sock = socket;

    sock.on("connect", () => {
      setStatus("Connected");
      sock.emit("join_lobby", { userId: user.id, name: user.name || user.email });
    });

    sock.on("lobby_update", (lobbyUsers) => {
      console.log("[lobby] Lobby updated:", lobbyUsers);
      setLobby(lobbyUsers.filter(u => u.userId !== user.id)); // Don't show self in lobby
    });

    sock.on("team_created", ({ teamId, leader, members, isLeader: userIsLeader }) => {
      console.log("[team] Team created:", { teamId, leader, members, isLeader: userIsLeader });
      setCurrentTeam({ teamId, leader, members });
      setIsLeader(userIsLeader);
      setSelectedMembers([]);
      setStatus(userIsLeader ? "Team created! You are the leader." : "You joined a team!");
    });

    sock.on("waiting_match", ({ message }) => {
      setStatus(message);
    });

    sock.on("match_found", ({ roomId, teamId, teammates, opponents, problem }) => {
      console.log("[match] Match found:", { roomId, teamId, teammates, opponents });
      setStatus("Match found! Joining room...");
      
      // Store match data and navigate
      localStorage.setItem('matchData', JSON.stringify({
        roomId,
        teamId,
        teammates,
        opponents,
        problem
      }));
      
      navigate('/team_duel_cf');
    });

    return () => {
      // Don't disconnect socket as it's shared
    };
  }, [user, navigate]);

  const toggleMemberSelection = (userId) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const createTeam = () => {
    if (selectedMembers.length === 0) {
      setStatus("Please select at least one team member");
      return;
    }
    
    console.log("[team] Creating team with members:", selectedMembers);
    socket.emit("create_team", {
      leaderId: user.id,
      memberIds: selectedMembers
    });
  };

  const startMatchmaking = () => {
    if (!currentTeam || !isLeader) return;
    
    console.log("[matchmaking] Starting matchmaking for team:", currentTeam.teamId);
    setStatus("Looking for opponent team...");
    socket.emit("start_matchmaking", { teamId: currentTeam.teamId });
  };

  const leaveTeam = () => {
    setCurrentTeam(null);
    setIsLeader(false);
    setStatus("Left team. Back in lobby.");
    socket.emit("join_lobby", { userId: user.id, name: user.name || user.email });
  };

  return (
    <div style={{ 
      padding: 32, 
      maxWidth: 800, 
      margin: '0 auto', 
      fontFamily: 'Segoe UI, sans-serif',
      minHeight: '80vh'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#7c3aed', margin: 0 }}>⚡ Team Duel Lobby</h2>
        <button 
          onClick={toggleDark}
          style={{
            padding: '8px 16px',
            border: '1px solid #7c3aed',
            borderRadius: 6,
            background: 'transparent',
            color: isDark ? '#fff' : '#000',
            cursor: 'pointer'
          }}
        >
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <div style={{ 
        background: isDark ? '#2a2a2a' : '#f8f9fa',
        padding: 20,
        borderRadius: 8,
        marginBottom: 24
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#7c3aed' }}>Status</h3>
        <p style={{ margin: 0, fontSize: 16 }}>{status}</p>
      </div>

      {!currentTeam ? (
        // Lobby view - create team
        <div>
          <h3 style={{ color: '#7c3aed', marginBottom: 16 }}>Create Team</h3>
          <p style={{ marginBottom: 16, color: '#666' }}>
            Select players from the lobby to form your team:
          </p>
          
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12 }}>Available Players ({lobby.length})</h4>
            {lobby.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic' }}>No other players in lobby</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {lobby.map(player => (
                  <div 
                    key={player.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: 12,
                      background: selectedMembers.includes(player.userId) ? '#7c3aed20' : '#fff',
                      border: selectedMembers.includes(player.userId) ? '2px solid #7c3aed' : '1px solid #ddd',
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}
                    onClick={() => toggleMemberSelection(player.userId)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(player.userId)}
                      onChange={() => {}}
                      style={{ marginRight: 12 }}
                    />
                    <span style={{ fontWeight: 500 }}>{player.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={createTeam}
            disabled={selectedMembers.length === 0}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              borderRadius: 6,
              background: selectedMembers.length > 0 ? '#7c3aed' : '#ccc',
              color: '#fff',
              border: 'none',
              cursor: selectedMembers.length > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            Create Team ({selectedMembers.length + 1} players)
          </button>
        </div>
      ) : (
        // Team view - show team and start match
        <div>
          <h3 style={{ color: '#7c3aed', marginBottom: 16 }}>Your Team</h3>
          
          <div style={{ 
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 20,
            marginBottom: 24
          }}>
            <h4 style={{ marginBottom: 12 }}>Team Members ({currentTeam.members.length})</h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {currentTeam.members.map(member => (
                <div 
                  key={member.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: 8,
                    background: member.userId === currentTeam.leader ? '#7c3aed10' : '#f8f9fa',
                    borderRadius: 4
                  }}
                >
                  <span style={{ fontWeight: member.userId === currentTeam.leader ? 600 : 400 }}>
                    {member.name}
                    {member.userId === currentTeam.leader && ' (Leader)'}
                    {member.userId === user.id && ' (You)'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            {isLeader && (
              <button
                onClick={startMatchmaking}
                style={{
                  padding: '12px 24px',
                  fontSize: 16,
                  borderRadius: 6,
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Start Matchmaking
              </button>
            )}
            
            <button
              onClick={leaveTeam}
              style={{
                padding: '12px 24px',
                fontSize: 16,
                borderRadius: 6,
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Leave Team
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
