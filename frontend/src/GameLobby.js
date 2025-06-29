import React, { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { supabase } from "./supabaseClient";
import VoiceChat from "./VoiceChat";

// Backend socket endpoint (re-use existing one)
const SOCKET_URL = "https://final-code-game-team.onrender.com";
const MAX_TEAM_SIZE = 5; // self + 4 invited players

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
  const [socket, setSocket] = useState(null);
  const [friends, setFriends] = useState([]);       // all accepted friends
  const [lobby, setLobby] = useState([]);           // online users in lobby (from socket)
  const [invited, setInvited] = useState([]);       // array<userId> invited to team
  const [status, setStatus] = useState("");

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
    const sock = io(SOCKET_URL);
    setSocket(sock);

    sock.on("connect", () => {
      sock.emit("join_lobby", {
        userId: user?.id || Math.random().toString(36).slice(2),
        name: user?.name || user?.email,
      });
      sock.emit("get_lobby");
      setStatus("Connected. Waiting in lobby…");
    });

    sock.on("lobby_update", (list) => setLobby(list));

    // Placeholder for when backend pairs two teams
    sock.on("team_created", ({ roomId }) => {
      setStatus(`Team created! Waiting for opponent in room ${roomId}…`);
    });

    return () => {
      sock.disconnect();
    };
  }, [user]);

  /* ----------------------------- UI helpers ------------------------------ */
  const toggleInvite = (friendId) => {
    setInvited((prev) => {
      const next = prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId];
      // ensure we never exceed MAX_TEAM_SIZE – 1 (excluding self)
      return next.slice(0, MAX_TEAM_SIZE - 1);
    });
  };

  const handleStart = () => {
    if (!socket) return;

    const team = [
      { userId: user.id, name: user.name || user.email },
      ...invited.map((id) => {
        const fr = friends.find((f) => f.userId === id) || {};
        return { userId: id, name: fr.name || id };
      }),
    ];

    socket.emit("create_game_team", { team });
    setStatus("Creating team, waiting for opponent…");
  };

  /* ------------------------------- Render -------------------------------- */
  return (
    <div style={{ display: "flex", minHeight: "80vh", fontFamily: "Segoe UI, sans-serif" }}>
      {/* Sidebar – Friend list */}
      <div style={{ width: 260, borderRight: "1px solid #eee", padding: "24px 16px" }}>
        <h3 style={{ marginTop: 0, color: "#7c3aed" }}>Friends</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {friends.map((fr) => {
            const alreadyInvited = invited.includes(fr.userId);
            const disabled = alreadyInvited || invited.length >= MAX_TEAM_SIZE - 1;
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
        <h2 style={{ color: "#7c3aed", textAlign: "center", marginBottom: 24 }}>
          Lobby
        </h2>

        {/* Team avatars */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {[user.id, ...invited, ...Array(MAX_TEAM_SIZE - 1 - invited.length).fill(null)].map(
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
                    : (friends.find((f) => f.userId === id)?.name?.[0]?.toUpperCase() || "F")
                  : ""}
              </div>
            )
          )}
        </div>

        <div style={{ textAlign: "center", marginBottom: 18 }}>
          {invited.length}/{MAX_TEAM_SIZE - 1} teammates selected
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={handleStart}
            disabled={invited.length === 0}
            style={{
              padding: "12px 32px",
              fontSize: 18,
              borderRadius: 8,
              background: invited.length === 0 ? "#aaa" : "#7c3aed",
              color: "#fff",
              border: "none",
              cursor: invited.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Start
          </button>
        </div>

        <div style={{ marginTop: 24, textAlign: "center", color: "#888" }}>{status}</div>

        {/* Voice chat for current selection */}
        <VoiceChat
          socket={socket}
          roomKey={`lobby_${[user.id, ...invited].sort().join("_")}`}
          userId={user?.id}
          teammates={[{ userId: user.id, name: user.name || user.email }, ...invited.map(id => ({ userId: id, name: friends.find(f => f.userId===id)?.name || id }))]}
        />
      </div>
    </div>
  );
}
