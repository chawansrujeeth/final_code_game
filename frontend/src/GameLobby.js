import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { socket } from "./socket";
import useDarkMode from "./useDarkMode";
import VoiceChat from "./VoiceChat";

export default function GameLobby({ user }) {
  const navigate = useNavigate();
  const [isDark, toggleDark] = useDarkMode();
  
  const [lobby, setLobby] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [status, setStatus] = useState("Connecting...");
  const [isLeader, setIsLeader] = useState(false);

  // --- Restore team from localStorage on first mount ---
  useEffect(() => {
    try {
      const storedTeam = localStorage.getItem('currentTeam');
      const storedLeader = localStorage.getItem('isLeader');
      if (storedTeam) {
        setCurrentTeam(JSON.parse(storedTeam));
      }
      if (storedLeader !== null) {
        setIsLeader(storedLeader === 'true');
      }
    } catch (err) {
      console.warn('[lobby] Failed to restore team from storage', err);
    }

  }, []);

  // Notify server if user closes / refreshes while in a team
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentTeam) {
        socket.emit('leave_team', { teamId: currentTeam.teamId, userId: user.id });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentTeam, user.id]);

  useEffect(() => {
    const sock = socket;

    sock.on("connect", () => {
      setStatus("Connected");
      sock.emit("join_lobby", { userId: user.id, name: user.name || user.email });
    });

    sock.on("lobby_update", (lobbyUsers) => {
      console.log("[lobby] Lobby updated:", lobbyUsers);
      // Remove self and deduplicate by userId
      const unique = [];
      const seen = new Set();
      lobbyUsers.forEach(u => {
        if (u.userId === user.id) return; // skip self
        if (!seen.has(u.userId)) {
          seen.add(u.userId);
          unique.push(u);
        }
      });
      setLobby(unique);
    });

    // Team events
    sock.on("team_created", ({ teamId, leader, members, isLeader: userIsLeader }) => {
      console.log("[team] Team created:", { teamId, leader, members, isLeader: userIsLeader });
      const teamState = { teamId, leader, members };
      setCurrentTeam(teamState);
      // Persist team across refreshes
      localStorage.setItem('currentTeam', JSON.stringify(teamState));
      localStorage.setItem('isLeader', String(userIsLeader));
      setIsLeader(userIsLeader);
      setSelectedMembers([]);
      setStatus(userIsLeader ? "Team created! You are the leader." : "You joined a team!");
    });

    // When members join/leave, server emits updated team state
    sock.on("team_updated", ({ teamId, leader, members }) => {
      if (currentTeam && currentTeam.teamId === teamId) {
        const teamState = { teamId, leader, members };
        setCurrentTeam(teamState);
        localStorage.setItem('currentTeam', JSON.stringify(teamState));
        setStatus("Team updated (member joined/left)");
      }
    });

    // If team is disbanded (e.g., leader leaves)
    sock.on("team_disbanded", ({ teamId }) => {
      if (currentTeam && currentTeam.teamId === teamId) {
        setCurrentTeam(null);
        localStorage.removeItem('currentTeam');
        localStorage.removeItem('isLeader');
        setStatus("Team was disbanded. Back in lobby.");
      }
    });

    sock.on("waiting_match", ({ message }) => {
      setStatus(message);
    });

    sock.on("match_found", ({ roomId, teamId, teammates, opponents, problem, leaderId }) => {
      console.log("[match] Match found:", { roomId, teamId, teammates, opponents });
      setStatus("Match found! Joining room...");
      
      // Store match data and navigate
      localStorage.setItem('matchData', JSON.stringify({
        roomId,
        teamId,
        teammates,
        opponents,
        problem,
        leaderId
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
    if (currentTeam) {
      socket.emit('leave_team', { teamId: currentTeam.teamId, userId: user.id });
    }
    setCurrentTeam(null);
    setIsLeader(false);
    // Clear persisted state
    localStorage.removeItem('currentTeam');
    localStorage.removeItem('isLeader');
    setStatus("Left team. Back in lobby.");
    socket.emit("join_lobby", { userId: user.id, name: user.name || user.email });
  };

  return (
    <div className="max-w-3xl mx-auto p-8 font-sans min-h-[80vh]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-primary m-0 text-2xl font-semibold">⚡ Team Duel Lobby</h2>
        <button
          onClick={toggleDark}
          className="px-4 py-2 border border-primary rounded-md bg-transparent text-black dark:text-white hover:bg-primary hover:text-white transition-colors"
        >
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <div className="bg-gray-100 dark:bg-gray-800 p-5 rounded-lg mb-6">
        <h3 className="text-primary mb-4">Status</h3>
        <p className="text-base m-0">{status}</p>
      </div>

      {!currentTeam ? (
        // Lobby view - create team
        <div>
          <h3 className="text-primary mb-4">Create Team</h3>
          <p className="mb-4 text-gray-600">
            Select players from the lobby to form your team:
          </p>
          
          <div className="mb-6">
            <h4 className="mb-3 font-semibold">Available Players ({lobby.length})</h4>
            {lobby.length === 0 ? (
              <p className="text-gray-500 italic">No other players in lobby</p>
            ) : (
              <div className="grid gap-2">
                {lobby.map(player => (
                  <div 
                    key={player.userId}
                    className={`flex items-center p-3 rounded-md cursor-pointer border ${
                      selectedMembers.includes(player.userId)
                        ? 'bg-primary/10 border-primary'
                        : 'bg-white border-gray-300'
                    }`}
                    onClick={() => toggleMemberSelection(player.userId)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(player.userId)}
                      readOnly
                      className="mr-3"
                    />
                    <Link to={`/player/${player.userId}`} className="font-medium hover:underline">{player.name}</Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={createTeam}
            disabled={selectedMembers.length === 0}
            className={`px-6 py-3 text-base rounded-md text-white transition-colors ${
              selectedMembers.length > 0 ? 'bg-primary hover:bg-primary/90 cursor-pointer' : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Create Team ({selectedMembers.length + 1} players)
          </button>
        </div>
      ) : (
        // Team view - show team and start match
        <div>
          <h3 className="text-primary mb-4">Your Team</h3>
          
          <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-5 mb-6">
            <h4 className="mb-3 font-semibold">Team Members ({currentTeam.members.length})</h4>
            <div className="grid gap-2">
              {currentTeam.members.map(member => (
                <div
                  key={member.userId}
                  className={`flex items-center p-2 rounded ${member.userId === currentTeam.leader ? 'bg-primary/10' : 'bg-gray-100 dark:bg-gray-800'}`}
                >
                  <span className={member.userId === currentTeam.leader ? 'font-semibold' : 'font-normal'}>
                    {member.name}
                    {member.userId === currentTeam.leader && ' (Leader)'}
                    {member.userId === user.id && ' (You)'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            {isLeader && (
              <button
                onClick={startMatchmaking}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md"
              >
                Start Matchmaking
              </button>
            )}
            
            <button
              onClick={leaveTeam}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md"
            >
              Leave Team
            </button>
          </div>
        </div>
      )}
    {currentTeam && (
      <VoiceChat 
        socket={socket}
        roomKey={`team_${currentTeam.teamId}`}
        userId={user.id}
        teammates={currentTeam.members}
      />
    )}
    </div>
  );
}
