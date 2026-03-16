import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, Phone, PhoneOff, Radio, Users, Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function App() {
  const [channelId, setChannelId] = useState("");
  const [joined, setJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const socketUrl = (import.meta as any)?.env?.VITE_SOCKET_URL || undefined;
    socketRef.current = io(socketUrl);

    socketRef.current.on("connect", () => setIsConnected(true));
    socketRef.current.on("disconnect", () => setIsConnected(false));

    socketRef.current.on("user-joined", async (userId: string) => {
      console.log("User joined:", userId);
      setPeers(prev => [...prev, userId]);
      await createOffer(userId);
    });

    socketRef.current.on("offer", async ({ from, offer }: { from: string, offer: RTCSessionDescriptionInit }) => {
      await handleOffer(from, offer);
    });

    socketRef.current.on("answer", async ({ from, answer }: { from: string, answer: RTCSessionDescriptionInit }) => {
      await handleAnswer(from, answer);
    });

    socketRef.current.on("ice-candidate", async ({ from, candidate }: { from: string, candidate: RTCIceCandidateInit }) => {
      await handleIceCandidate(from, candidate);
    });

    return () => {
      socketRef.current?.disconnect();
      stopIntercom();
    };
  }, []);

  const startIntercom = async () => {
    if (!channelId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setJoined(true);
      socketRef.current?.emit("join-channel", channelId);
      // Offer to share the channel with other devices after joining
      try { await shareChannel(channelId); } catch (e) { /* ignore share errors */ }
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Se requiere permiso de micrófono para usar el intercomunicador.");
    }
  };

  const stopIntercom = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    Object.values(peerConnections.current).forEach((pc) => {
      if (pc instanceof RTCPeerConnection) pc.close();
    });
    peerConnections.current = {};
    setJoined(false);
    setRemoteStream(null);
    setPeers([]);
  };

  const buildShareUrl = (channel: string) =>
    `${window.location.origin}${window.location.pathname}?channel=${encodeURIComponent(channel)}`;

  const shareChannel = async (channel: string) => {
    const url = buildShareUrl(channel);
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: 'Únete a mi canal', text: `Canal: ${channel}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Enlace copiado al portapapeles. Pégalo en el otro dispositivo.');
      }
    } catch (err) {
      try { await navigator.clipboard.writeText(url); alert('Enlace copiado al portapapeles.'); } catch { alert('No se pudo compartir ni copiar el enlace.'); }
    }
  };

  const createPeerConnection = (userId: string) => {
    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", { to: userId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log("Received remote track");
      setRemoteStream(event.streams[0]);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnections.current[userId] = pc;
    return pc;
  };

  const createOffer = async (userId: string) => {
    const pc = createPeerConnection(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit("offer", { to: userId, offer });
  };

  const handleOffer = async (from: string, offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit("answer", { to: from, answer });
  };

  const handleAnswer = async (from: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnections.current[from];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleIceCandidate = async (from: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnections.current[from];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  return (
    <div className="min-h-screen bg-[url('https://aprilia-colombia.com/wp-content/uploads/2022/08/viajar-por-colombia.webp')] bg-cover bg-center text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="p-6 flex justify-between items-center border-b border-zinc-800/50 bg-zinc-900/30 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Radio className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">VOICE-CHANEL</h1>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-full border border-zinc-700/50">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-500 uppercase tracking-widest">En línea</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-medium text-rose-500 uppercase tracking-widest">Desconectado</span>
            </>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto p-6 flex flex-col gap-8">
        <AnimatePresence mode="wait">
          {!joined ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8 py-12"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Emulador de Icomunicador</h2>
                <p className="text-zinc-400">Cree un canal para conectar con otro dispositivo.</p>
              </div>

              <div className="space-y-4">
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="Nombre del canal (ej: casa-1)"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-zinc-600"
                  />
                </div>
                <button
                  onClick={startIntercom}
                  disabled={!channelId || !isConnected}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Phone className="w-5 h-5" />
                  Conectar Canal
                </button>
                <button
                  onClick={() => shareChannel(channelId)}
                  disabled={!channelId}
                  className="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 font-medium py-3 rounded-2xl transition-all flex items-center justify-center gap-2"
                >
                  Compartir enlace
                </button>
              </div>

              <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl space-y-3">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Cómo funciona</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  1. Abre esta app en dos celulares.<br/>
                  2. Escribe el mismo nombre de canal en ambos.<br/>
                  3. ¡Empieza a hablar! Funciona como un intercomunicador real.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 py-8"
            >
              <div className="relative aspect-square rounded-full bg-zinc-900 border-4 border-zinc-800 flex items-center justify-center overflow-hidden shadow-2xl">
                {/* Pulse Animation */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-1/2 h-1/2 rounded-full bg-emerald-500/20"
                  />
                </div>
                
                <div className="relative z-10 flex flex-col items-center gap-4">
                  <div className={`p-8 rounded-full ${isMuted ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'} transition-colors`}>
                    {isMuted ? <MicOff className="w-16 h-16" /> : <Mic className="w-16 h-16" />}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Canal Activo</p>
                    <p className="text-2xl font-bold text-emerald-500">{channelId}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-2xl border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-zinc-500" />
                    <span className="text-sm font-medium">Usuarios conectados</span>
                  </div>
                  <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-xs font-bold">
                    {peers.length + 1}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={toggleMute}
                    className={`flex flex-col items-center gap-2 p-6 rounded-3xl border transition-all ${
                      isMuted 
                        ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-100 hover:border-zinc-700'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    <span className="text-xs font-bold uppercase tracking-widest">{isMuted ? 'Silenciado' : 'Mic Activo'}</span>
                  </button>

                  <button
                    onClick={stopIntercom}
                    className="flex flex-col items-center gap-2 p-6 rounded-3xl bg-rose-500 text-rose-950 border border-rose-400 hover:bg-rose-400 transition-all"
                  >
                    <PhoneOff className="w-6 h-6" />
                    <span className="text-xs font-bold uppercase tracking-widest">Salir</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 p-6 text-center">
        <p className="text-[10px] text-zinc-600 uppercase tracking-[0.3em] font-medium">
          Beta version
        </p>
      </footer>
    </div>
  );
}
