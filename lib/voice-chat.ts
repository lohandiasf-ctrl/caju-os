'use client';

import { io, type Socket } from 'socket.io-client';

type Peer = { socketId: string; userId: string; userName: string };
type Signal = RTCSessionDescriptionInit | RTCIceCandidateInit;

export type VoiceChatEvents = {
  onParticipantsChanged?: (participants: Peer[]) => void;
  onRemoteStream?: (socketId: string, stream: MediaStream) => void;
  onPeerLeft?: (socketId: string) => void;
  onError?: (error: Error) => void;
};

function signalingUrl() {
  return process.env.NEXT_PUBLIC_SIGNALING_URL?.trim() || 'https://caju-os-signaling-production.up.railway.app';
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const urls = process.env.NEXT_PUBLIC_TURN_URLS?.split(',').map((value) => value.trim()).filter(Boolean);
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (urls?.length && username && credential) servers.push({ urls, username, credential });
  return servers;
}

export class VoiceChatClient {
  private socket: Socket | null = null;
  private stream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private participants = new Map<string, Peer>();

  constructor(private events: VoiceChatEvents = {}) {}

  async join(roomId: string, userId: string, userName: string) {
    const url = signalingUrl();
    if (!url) throw new Error('Servidor de voz ainda não foi configurado.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    this.socket = io(url, { transports: ['websocket'], autoConnect: false, timeout: 10_000 });
    this.registerHandlers();
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket!;
      const timer = window.setTimeout(() => reject(new Error('Servidor de voz não respondeu.')), 10_000);
      socket.once('connect', () => { window.clearTimeout(timer); socket.emit('voice:join', { roomId, userId, userName }); resolve(); });
      socket.once('connect_error', (error) => { window.clearTimeout(timer); reject(error); });
      socket.connect();
    });
  }

  setMuted(muted: boolean) { this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); }

  leave() {
    this.socket?.emit('voice:leave');
    this.socket?.disconnect();
    this.socket = null;
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.participants.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private registerHandlers() {
    const socket = this.socket!;
    socket.on('voice:existing-peers', (peers: Peer[]) => {
      peers.forEach((peer) => { this.participants.set(peer.socketId, peer); void this.createPeer(peer.socketId, true); });
      this.emitParticipants();
    });
    socket.on('voice:peer-joined', (peer: Peer) => {
      this.participants.set(peer.socketId, peer); void this.createPeer(peer.socketId, false); this.emitParticipants();
    });
    socket.on('voice:peer-left', ({ socketId }: { socketId: string }) => {
      this.peers.get(socketId)?.close(); this.peers.delete(socketId); this.participants.delete(socketId);
      this.events.onPeerLeft?.(socketId); this.emitParticipants();
    });
    socket.on('voice:signal', ({ from, data }: { from: string; data: Signal }) => void this.handleSignal(from, data));
    socket.on('voice:error', (message: string) => this.events.onError?.(new Error(message)));
  }

  private async handleSignal(from: string, data: Signal) {
    try {
      const peer = this.peers.get(from) ?? await this.createPeer(from, false);
      if ('type' in data && data.type === 'offer') {
        await peer.setRemoteDescription(data);
        const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
        this.socket?.emit('voice:signal', { to: from, data: peer.localDescription });
      } else if ('type' in data && data.type === 'answer') await peer.setRemoteDescription(data);
      else if ('candidate' in data && data.candidate) await peer.addIceCandidate(data);
    } catch (error) { this.events.onError?.(error instanceof Error ? error : new Error('Falha na conexão de voz.')); }
  }

  private async createPeer(remoteId: string, initiator: boolean) {
    const existing = this.peers.get(remoteId); if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: iceServers() }); this.peers.set(remoteId, peer);
    this.stream?.getTracks().forEach((track) => peer.addTrack(track, this.stream!));
    peer.ontrack = (event) => this.events.onRemoteStream?.(remoteId, event.streams[0]);
    peer.onicecandidate = (event) => { if (event.candidate) this.socket?.emit('voice:signal', { to: remoteId, data: event.candidate.toJSON() }); };
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'failed') this.events.onError?.(new Error('Conexão de voz falhou.')); };
    if (initiator) {
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      this.socket?.emit('voice:signal', { to: remoteId, data: peer.localDescription });
    }
    return peer;
  }

  private emitParticipants() { this.events.onParticipantsChanged?.([...this.participants.values()]); }
}

export function directVoiceRoom(firstEmail: string, secondEmail: string) {
  return `direct:${[firstEmail.toLowerCase(), secondEmail.toLowerCase()].sort().join(':')}`;
}
