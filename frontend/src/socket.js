import { io } from "socket.io-client";

// Centralised socket instance and guarded helpers
const SOCKET_URL = "https://final-code-game-team.onrender.com";

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket"]
});

let inRoom = false;
let joinedLobby = false;
let queued = false;

socket.on("disconnect", () => {
  inRoom = false;
  joinedLobby = false;
  queued = false;
});

socket.on("team_assignment", () => {
  inRoom = true;
  joinedLobby = false;
  queued = false;
});

socket.on("join_room", () => {
  inRoom = true;
  joinedLobby = false;
  queued = false;
});

export function safeJoinLobby(user) {
  if (inRoom || joinedLobby || !user?.id) return;
  socket.emit("join_lobby", { userId: user.id, name: user.name || user.email });
  joinedLobby = true;
}

export function queueMatch(team, desiredSize = 2) {
  if (inRoom || queued) return;
  socket.emit("create_game_team", { team, desiredSize });
  queued = true;
}

export function leaveMatch() {
  inRoom = false;
}
