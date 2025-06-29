import React, { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";

/*
  VoiceChat Component
  -------------------
  Props:
    - socket: socket.io client (already connected)
    - roomKey: unique string for your team (e.g., `${roomId}_${teamId}`)
    - userId: logged-in user's ID
    - teammates: array<{ userId, name }>

  How it works
  • Each browser gets mic permission (audio only).
  • For every teammate we spin up a SimplePeer.
  • Signalling is done over socket.io using events: "voice-signal".
  • Remote audio streams are attached to <audio> tags (hidden) for playback.
*/
export default function VoiceChat({ socket, roomKey, userId, teammates = [] }) {
  const [enabled, setEnabled] = useState(false);
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // userId => SimplePeer

  /* ---------------- Microphone Permission & Stream ---------------- */
  useEffect(() => {
    if (!enabled) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        localStreamRef.current = stream;
        // When we already have peers setup (if enabled toggled mid-session)
        Object.values(peersRef.current).forEach((p) => p.addStream(stream));
      })
      .catch((err) => {
        console.error("Mic permission denied", err);
        setEnabled(false);
      });
    return () => {
      // Cleanup on unmount / disable
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [enabled]);

  /* ------------------ Handle signalling via socket ---------------- */
  useEffect(() => {
    if (!socket) return;
    const sigHandler = ({ from, signal, room }) => {
      if (room !== roomKey || from === userId) return;
      let peer = peersRef.current[from];
      if (!peer) {
        peer = createPeer(false, from);
      }
      peer.signal(signal);
    };
    socket.on("voice-signal", sigHandler);
    return () => socket.off("voice-signal", sigHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomKey, userId]);

  /* ---------------- Make sure peers exist for each teammate -------- */
  useEffect(() => {
    if (!socket || !enabled) return;
    teammates
      .filter((t) => t.userId !== userId)
      .forEach((mate) => {
        if (!peersRef.current[mate.userId]) {
          createPeer(true, mate.userId);
        }
      });
  }, [teammates, userId, enabled, socket]);

  /* ---------------- Helper to create SimplePeer -------------------- */
  const createPeer = (initiator, targetId) => {
    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStreamRef.current || undefined,
    });
    peer.on("signal", (signal) => {
      socket.emit("voice-signal", { to: targetId, from: userId, signal, room: roomKey });
    });
    peer.on("stream", (remoteStream) => {
      // Create hidden audio element for playback
      const audio = document.createElement("audio");
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = "none";
      document.body.appendChild(audio);
    });
    peer.on("close", () => {
      delete peersRef.current[targetId];
    });
    peer.on("error", (err) => console.error("Voice peer error", err));
    peersRef.current[targetId] = peer;
    return peer;
  };

  return (
    <div style={{ marginTop: 20, textAlign: "center" }}>
      <button
        onClick={() => setEnabled((prev) => !prev)}
        style={{
          padding: "8px 18px",
          borderRadius: 6,
          background: enabled ? "#dc2626" : "#7c3aed",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        {enabled ? "Mute" : "Enable Mic"}
      </button>
    </div>
  );
}
