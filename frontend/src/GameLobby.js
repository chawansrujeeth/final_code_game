import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import { socket, safeJoinLobby, queueMatch } from "./socket";
import useDarkMode from "./useDarkMode";
import { supabase } from "./supabaseClient";
import VoiceChat from "./VoiceChat";

// Backend socket endpoint (re-use existing one)

const MAX_TEAM_SIZE = 5; // maximum allowed by system

/**
 * GameLobby – lightweight lobby UI inspired by FPS/MOBA pre-match rooms.
 *
 * Features
 * 1. Shows friend list in a sidebar.
 * 2. Allows inviting up to 4 friends (max 5-stack) by clicking the ➕ button.
 * 3. “Start” sends the chosen roster to the server, then waits for an opponent team.
 * 4. Uses the same Supabase `friends` table & presence logic already used in TeamCFDuel.
 *
 * NOTE: At the moment backend events such as `team_created` are placeholders.
 *       Hook them to real matchmaking once your server is ready.
 */
export default function GameLobby({ user }) {
  const navigate = useNavigate();
  const [isDark, toggleDark] = useDarkMode();
  // shared socket from socket.js is used
  const [friends, setFriends] = useState([]);       // all accepted friends
  const [lobby, setLobby] = useState([]);           // online users in lobby (from socket)
  const [invited, setInvited] = useState([]);       // array<userId> invited to team
  const [desiredSize, setDesiredSize] = useState(1);
  const [accepted, setAccepted] = useState([]);      // accepted teammates
  const [status, setStatus] = useState("");
  const [invites, setInvites] = useState([]); // pending incoming invites
  const [leaderId, setLeaderId] = useState(user?.id); // only leader can start match
  const restoredPending = useRef(false);

  // -------------------- Stable name cache --------------------
  const [nameCache, setNameCache] = useState({});
  const rememberName = useCallback((id, nm) => {
    if (!id || !nm) return;
    setNameCache(prev => (prev[id] ? prev : { ...prev, [id]: nm }));
  }, []);
  const displayName = useCallback((id) => {
    return nameCache[id] || friends.find(f => f.userId === id)?.name || id;
  }, [nameCache, friends]);

  const isLeader = user?.id === leaderId;

  // Derived helper: current full roster
  const teamIds = [user.id, ...accepted];

  /* -------------------------- Fetch friend list -------------------------- */
  const fetchFriends = useCallback(async () => {
    if (!user?.id) return;

    const { data: rows, error } = await supabase
      .from("friends")
      .select("user_id,friend_id,status")
      .eq("status", "accepted")
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (error) {
      console.error("Error fetching friends", error);
      return;
    }

    const ids = rows.map((r) => (r.user_id === user.id ? r.friend_id : r.user_id));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,name")
        .in("user_id", ids);

      const mapped = ids.map((id) => ({
        userId: id,
        name: profs?.find((p) => p.user_id === id)?.name || id,
      }));
      mapped.forEach(p => rememberName(p.userId, p.name));
      setFriends(mapped);
    } else {
      setFriends([]);
    }
  }, [user]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  /* --------------------------- Socket handling --------------------------- */
  useEffect(() => {
    const sock = socket;
    

    sock.on("connect", () => {
      // Attempt resume queuedTeam
      const saved = localStorage.getItem('queuedTeam');
      if (saved) {
        try {
          const { desiredSize: ds, teamIds } = JSON.parse(saved);
          if (teamIds && teamIds.includes(user.id)) {
            setDesiredSize(ds);
            setAccepted(teamIds.filter(id => id !== user.id));
            // Rebuild team object
            const team = [
              { userId: user.id, name: user.name || user.email },
              ...teamIds.filter(id => id !== user.id).map((id) => {
                const fr = friends.find((f) => f.userId === id) || {};
                return { userId: id, name: fr.name || id };
              }),
            ];
            queueMatch(team, ds);
            setStatus("Rejoined queue…");
          }
        } catch {}
      }

      

      // Restore pending team if exists and no queuedTeam
      if (!saved) {
        const pending = localStorage.getItem('pendingTeam');
        if (pending) {
          try {
            const { desiredSize: pdSize, accepted: acc } = JSON.parse(pending);
            if (acc && acc.length) {
              setDesiredSize(pdSize);
              setAccepted(acc);
              // Inform server for presence sync
              sock.emit('sync_team', { teamIds: [user.id, ...acc] });
            }
          } catch {}
        }
      }
      restoredPending.current = true;
      safeJoinLobby(user);
      sock.emit("get_lobby");
      setStatus("Connected. Waiting in lobby…");
    });

    sock.on("lobby_update", (list) => {
      list.forEach(p => rememberName(p.userId, p.name));
      setLobby(list);
    });

    // You were kicked
    sock.on("kicked", ({ by }) => {
      setAccepted([]);
      setInvited([]);
      setLeaderId(user.id);
      setDesiredSize(MAX_TEAM_SIZE);
      setStatus(`You were kicked by ${displayName(by)}`);
    });

    // Invitations
    sock.on("team_invite", ({ from, teamIds = [], leaderId: lId }) => {
      rememberName(from.userId, from.name);

      setInvites(prev => prev.some(i=>i.from.userId===from.userId) ? prev : [...prev, { from, teamIds, leaderId: lId }]);
    });

    sock.on("invite_response", ({ from, accepted }) => {
      rememberName(from.userId, from.name);

      setAccepted(prev => {
        let next;
        if (accepted) {
          next = prev.includes(from.userId) ? prev : [...prev, from.userId];
        } else {
          next = prev.filter(id => id !== from.userId);
        }
        // Broadcast updated roster so all peers refresh
        if (accepted && socket) {
          socket.emit('sync_team', { teamIds: [user.id, ...next] });
        }
        return next;
      });
      // Remove from invited list once responded
      setInvited(prev => prev.filter(id => id !== from.userId));
    });

    // Team sync event – server sends the full roster after any change
    sock.on("team_sync", ({ teamIds }) => {
      setAccepted(teamIds.filter(id => id !== user.id));
      setDesiredSize(teamIds.length);
      // keep existing leader if still present, else default to first id
      setLeaderId(prev => teamIds.includes(prev) ? prev : teamIds[0]);
      setInvited([]);
    });

    sock.on("kicked", () => {
      localStorage.removeItem('queuedTeam');
      alert('You were kicked from the team');
      setAccepted([]);
      setInvited([]);
    });

    // Matchmaking complete – leaders receive match_found first
    sock.on("match_found", ({ roomId, yourTeam, oppTeam }) => {
      localStorage.removeItem('queuedTeam');
      setStatus('Match found! Joining room…');
      if (user.id === leaderId) {
        sock.emit('summon_team', { roomId, teamIds: yourTeam });
      }
    });

    sock.on("join_room", ({ roomId, yourTeam = [], oppTeam = [] }) => {
      setStatus('Joined match room ' + roomId);
      // persist data for next page
      localStorage.setItem('roomId', roomId);
      localStorage.setItem('yourTeam', JSON.stringify(yourTeam));
      localStorage.setItem('oppTeam', JSON.stringify(oppTeam));
      navigate(`/team_duel_cf?roomId=${roomId}`);
    });

    // Placeholder for when backend pairs two teams
    // When server pairs two teams it sends team_assignment just like TeamCFDuel
    sock.on("team_assignment", ({ roomId, teamId, opponents, teamMembers }) => {
      localStorage.removeItem('queuedTeam');
      // Redirect to TeamCFDuel component (re-use existing route)
      window.location.href = "/team_duel_cf"; // simplistic: reloads; better with router navigate
    });

    // Waiting message
    sock.on("waiting_opponent", ({ message }) => {
      setStatus(message || "Waiting for opponent team…");
    });

    return () => {
      
    };
  }, [user]);

  // Persist pendingTeam locally and keep peers in sync whenever roster or size changes
  useEffect(() => {
    if (accepted.length) {
      localStorage.setItem('pendingTeam', JSON.stringify({ desiredSize, accepted }));
      socket?.emit('sync_team', { teamIds: [user.id, ...accepted] });
    } else {
      localStorage.removeItem('pendingTeam');
    }
  }, [accepted, desiredSize, socket, user.id]);

  /* ----------------------------- UI helpers ------------------------------ */
  const toggleInvite = (friendId) => {
    if (accepted.includes(friendId)) return; // already in team

    setInvited((prev) => {
      let next;
      if (prev.includes(friendId)) {
        next = prev.filter((id) => id !== friendId);
        // Optionally notify cancellation
      } else {
        if (prev.length >= desiredSize - 1) return prev;
        next = [...prev, friendId];
        if (socket) socket.emit("invite_player", { to: friendId, from: { userId: user.id, name: user.name || user.email }, teamIds: [user.id, ...accepted], leaderId });
      }
      return next;
    });
  };

  const handleRespondInvite = (invite, acceptedFlag) => {
    const combined = Array.from(new Set([user.id, ...accepted, ...(invite.teamIds || [])]));
    socket.emit("invite_response", { to: invite.from.userId, from: { userId: user.id, name: user.name || user.email }, accepted: acceptedFlag, teamIds: combined });
    setInvites(invites.filter(i => i !== invite));
    if (acceptedFlag) {
      if (invite.leaderId) {
    setLeaderId(invite.leaderId);
    setDesiredSize(combined.length);
    // We wait for team_sync to update accepted list
  }  }
  };

  const handleStart = () => {
    if (user.id !== leaderId) return; // only leader can start
    localStorage.removeItem('pendingTeam');
    const teamIds = [user.id, ...accepted];
    if (!socket) return;

    const team = [
      { userId: user.id, name: user.name || user.email },
      ...accepted.map((id) => ({ userId: id, name: displayName(id) })),
    ];

    const actualDesiredSize = team.length;
    localStorage.setItem('queuedTeam', JSON.stringify({ desiredSize: actualDesiredSize, teamIds }));

    queueMatch(team, actualDesiredSize);
    setStatus("Queued for matchmaking… waiting for opponent team");
};

  const handleKick = (targetId) => {
  if (!isLeader) return;
  if (socket) socket.emit("kick_player", { leader: user.id, target: targetId });
  setAccepted((prev) => prev.filter((id) => id !== targetId));
  setInvited((prev) => prev.filter((id) => id !== targetId));
};

const handleLeave = () => {
  // Form new roster without current user
  const newTeamIds = [leaderId, ...accepted].filter(id => id !== user.id);
  if (socket) socket.emit("leave_team", { userId: user.id, teamIds: newTeamIds });
  // Reset local state to lobby solo mode
  setAccepted([]);
  setInvited([]);
  setLeaderId(user.id);
  setDesiredSize(MAX_TEAM_SIZE);
};

  /* ------------------------------- Render -------------------------------- */
  return (
    <div style={{ display: "flex", minHeight: "80vh", fontFamily: "Segoe UI, sans-serif" }}>
      {/* Sidebar – Friend list */}
      <div style={{ width: 260, borderRight: "1px solid #eee", padding: "24px 16px" }}>
        <h3 style={{ marginTop: 0, color: "#7c3aed" }}>Friends</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {friends.map((fr) => {
            const alreadyInvited = invited.includes(fr.userId) || accepted.includes(fr.userId);
            const disabled = alreadyInvited || invited.length >= desiredSize - 1;
            return (
              <li
                key={fr.userId}
                style={{ display: "flex", alignItems: "center", marginBottom: 12 }}
              >
                <span style={{ flexGrow: 1 }}>{fr.name}</span>
                <button
                  onClick={() => toggleInvite(fr.userId)}
                  disabled={disabled && !alreadyInvited}
                  style={{
                    background: alreadyInvited ? "#16a34a" : "#7c3aed",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: disabled && !alreadyInvited ? "not-allowed" : "pointer",
                  }}
                >
                  {alreadyInvited ? "Invited" : "+"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Main */}
      <div style={{ flexGrow: 1, padding: 32 }}>
        <h2 style={{ color: "#7c3aed", textAlign: "center", marginBottom: 12 }}>
          Lobby
        </h2>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <label htmlFor="team-size-select" style={{ marginRight: 8, fontWeight: 600 }}>Desired Team Size:</label>
          <select id="team-size-select" value={desiredSize} onChange={e => {
            const val = Number(e.target.value);
            setDesiredSize(val);
            // Trim invites if exceeds new size limit
            setInvited(prev => prev.slice(0, Math.max(0, val-1)));
          }} style={{ padding: '6px 12px', borderRadius: 6 }}>
            {[1,2,3,4,5].map(sz => (
              <option key={sz} value={sz}>{sz}</option>
            ))}
          </select>
        </div>

        {/* Team avatars */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {[...teamIds, ...Array(MAX_TEAM_SIZE - teamIds.length).fill(null)].map(
            (id, idx) => (
              <div
                key={idx}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: id ? "#7c3aed" : "#eee",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: 18,
                }}
              >
                {id
                  ? id === user.id
                    ? "You"
                    : (displayName(id)?.[0]?.toUpperCase() || "F")
                  : ""}
              </div>
            )
          )}
        </div>

        {user.id === teamIds[0] && (<>
          <ul style={{ listStyle: 'none', padding: 0, textAlign: 'center', marginBottom: 16 }}>
            {accepted.filter(id => id !== user.id).map(id => (
              <li key={id} style={{ margin: '4px 0' }}>
                {displayName(id)}
                <button onClick={() => handleKick(id)} style={{ marginLeft: 8, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', cursor:'pointer' }}>Kick</button>
              </li>
            ))}
          </ul>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h1 style={{ textAlign: 'center' }}>Game Lobby</h1>
          <button onClick={toggleDark} style={{padding:'6px 12px',border:'1px solid var(--primary)',borderRadius:4,background:'transparent',color:'var(--text)',cursor:'pointer'}}>
            {isDark? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            {accepted.length}/{desiredSize - 1} teammates selected
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <button
              onClick={handleStart}
              disabled={!isLeader}
              style={{
                padding: '12px 32px',
                fontSize: 18,
                borderRadius: 8,
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                cursor: isLeader ? 'pointer' : 'not-allowed',
                marginRight: 16
              }}
            >
              Start
            </button>
            {teamIds.length > 1 && (
              <button
                onClick={handleLeave}
                style={{
                  padding: '12px 24px',
                  fontSize: 16,
                  borderRadius: 8,
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Leave Team
              </button>
            )}
          </div>

          </>
        )}
        <div style={{ marginTop: 24, textAlign: "center", color: "#888" }}>{status}</div>

        {/* Voice chat for current selection */}
        <VoiceChat
          socket={socket}
          roomKey={`lobby_${[user.id, ...accepted].sort().join("_")}`}
          userId={user?.id}
          teammates={[{ userId: user.id, name: user.name || user.email }, ...accepted.map(id => ({ userId: id, name: friends.find(f => f.userId===id)?.name || id }))]}
        />

        {/* Incoming invites popup */}
        {invites.length > 0 && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              width: 280,
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 1000,
            }}
          >
            <h4 style={{ margin: '12px 16px 8px', color: '#7c3aed' }}>Invitations</h4>
            <div style={{ maxHeight: 300, overflowY: 'auto', padding: '0 16px 16px' }}>
              {invites.map((inv, idx) => (
                <div key={idx} style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>{inv.from.name || inv.from.userId}</strong> invited you
                  </div>
                  <div>
                    <button
                      onClick={() => handleRespondInvite(inv, true)}
                      style={{
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        marginRight: 8,
                        cursor: 'pointer',
                      }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRespondInvite(inv, false)}
                      style={{
                        background: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
