import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const configuration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
  ]
};

const AudioChat: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
  const localStream = useRef<MediaStream | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);

  // -----------------------------
  // SOCKET CONNECTION
  // -----------------------------
  useEffect(() => {

    const socketUrl =
      (import.meta as any)?.env?.VITE_SOCKET_URL || undefined;

    socketRef.current = io(socketUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    const socket = socketRef.current;

    socket.on("connect", () => {
      console.log("🟢 Conectado al servidor:", socket.id);
    });

    socket.on("users", (users: string[]) => {
      console.log("Usuarios conectados:", users);
      setConnectedUsers(users.filter((u) => u !== socket.id));
    });

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.disconnect();
    };

  }, []);

  // -----------------------------
  // GET MICROPHONE
  // -----------------------------
  useEffect(() => {
    const getMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });

        localStream.current = stream;

        console.log("🎤 Micrófono listo");

      } catch (err) {
        console.error("Error accediendo al micrófono", err);
      }
    };

    getMic();
  }, []);

  // -----------------------------
  // CREATE PEER CONNECTION
  // -----------------------------
  const createPeerConnection = (userId: string) => {

    const pc = new RTCPeerConnection(configuration);

    peerConnections.current[userId] = pc;

    console.log("Creando PeerConnection con:", userId);

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", {
          to: userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {

      console.log("📡 Recibiendo audio remoto");

      const stream = event.streams[0];

      if (remoteAudioRef.current) {

        remoteAudioRef.current.srcObject = stream;

        remoteAudioRef.current
          .play()
          .catch((err) =>
            console.log("Autoplay bloqueado:", err)
          );
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", pc.iceConnectionState);
    };

    return pc;
  };

  // -----------------------------
  // CALL USER
  // -----------------------------
  const callUser = async (userId: string) => {

    const pc = createPeerConnection(userId);

    const offer = await pc.createOffer();

    await pc.setLocalDescription(offer);

    socketRef.current?.emit("offer", {
      to: userId,
      offer
    });
  };

  // -----------------------------
  // HANDLE OFFER
  // -----------------------------
  const handleOffer = async (data: any) => {

    const { from, offer } = data;

    const pc = createPeerConnection(from);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer);

    socketRef.current?.emit("answer", {
      to: from,
      answer
    });
  };

  // -----------------------------
  // HANDLE ANSWER
  // -----------------------------
  const handleAnswer = async (data: any) => {

    const { from, answer } = data;

    const pc = peerConnections.current[from];

    if (!pc) return;

    await pc.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  };

  // -----------------------------
  // HANDLE ICE
  // -----------------------------
  const handleIceCandidate = async (data: any) => {

    const { from, candidate } = data;

    const pc = peerConnections.current[from];

    if (!pc) {
      console.warn("PeerConnection no existe aún:", from);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Error agregando ICE:", err);
    }
  };

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div style={{ padding: 20 }}>

      <h2>Intercomunicador WebRTC</h2>

      <h3>Usuarios conectados</h3>

      {connectedUsers.length === 0 && (
        <p>No hay otros usuarios</p>
      )}

      {connectedUsers.map((user) => (
        <div key={user}>
          <button onClick={() => callUser(user)}>
            Llamar a {user}
          </button>
        </div>
      ))}

      <audio ref={remoteAudioRef} autoPlay />

    </div>
  );
};

export default AudioChat;