'use client';

import { io, type Socket } from 'socket.io-client';

type Peer = { socketId: string; userId: string; userName: string };
type Signal = RTCSessionDescriptionInit | RTCIceCandidateInit;
export type VoiceCallKind = 'direct' | 'group';
export type VoiceInvitation = { roomId: string; callerName: string; callerEmail: string; kind: VoiceCallKind };

export type VoiceChatEvents = {
  onParticipantsChanged?: (participants: Peer[]) => void;
  onRemoteStream?: (socketId: string, stream: MediaStream) => void;
  onRemoteScreenStream?: (socketId: string, stream: MediaStream) => void;
  onPeerLeft?: (socketId: string) => void;
  onCallEnded?: () => void;
  onCallDeclined?: () => void;
  onConnectionQuality?: (quality: 'excellent' | 'good' | 'poor' | 'reconnecting') => void;
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
  private screenStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private participants = new Map<string, Peer>();
  private statsTimer: number | null = null;

  constructor(private events: VoiceChatEvents = {}) {}

  async join(roomId: string, userId: string, userName: string, email?: string) {
    const url = signalingUrl();
    if (!url) throw new Error('Servidor de voz ainda não foi configurado.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    this.socket = io(url, { transports: ['websocket'], autoConnect: false, timeout: 10_000 });
    this.registerHandlers();
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket!;
      const timer = window.setTimeout(() => reject(new Error('Servidor de voz não respondeu.')), 10_000);
      socket.once('connect', () => { window.clearTimeout(timer); if (email) socket.emit('voice:register', { email }); socket.emit('voice:join', { roomId, userId, userName }); resolve(); });
      socket.once('connect_error', (error) => { window.clearTimeout(timer); reject(error); });
      socket.connect();
    });
    this.statsTimer = window.setInterval(() => void this.measureQuality(), 5_000);
  }

  invite(recipients: string[], kind: VoiceCallKind) {
    this.socket?.emit('voice:call', { recipients, kind });
  }

  setMuted(muted: boolean) { this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); }

  async startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Compartilhamento de tela não é suportado neste dispositivo.');
    this.stopScreenShare();
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false });
    this.screenStream = stream;
    const track = stream.getVideoTracks()[0];
    track.onended = () => this.stopScreenShare();
    for (const peer of this.peers.values()) peer.addTrack(track, stream);
    await this.renegotiate();
    return stream;
  }

  stopScreenShare() {
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;
    for (const peer of this.peers.values()) {
      for (const sender of peer.getSenders()) if (sender.track?.kind === 'video') peer.removeTrack(sender);
    }
    void this.renegotiate();
  }

  leave() {
    this.socket?.emit('voice:leave');
    this.dispose();
  }

  endCall() {
    this.socket?.emit('voice:end-call');
    // Give Socket.IO one event-loop turn to flush the bilateral hangup before
    // closing the websocket and media tracks locally.
    window.setTimeout(() => this.dispose(), 60);
  }

  private dispose() {
    if (this.statsTimer !== null) window.clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.socket?.disconnect();
    this.socket = null;
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.participants.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;
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
    socket.on('voice:call-ended', () => { this.events.onCallEnded?.(); this.dispose(); });
    socket.on('voice:call-declined', () => this.events.onCallDeclined?.());
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
    this.screenStream?.getTracks().forEach((track) => peer.addTrack(track, this.screenStream!));
    peer.ontrack = (event) => {
      // Mobile WebViews sometimes omit RTCTrackEvent.streams even when the
      // track is valid. Build a stream from the track so remote screen video
      // does not render as a black/empty element.
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      if (event.track.kind === 'video') this.events.onRemoteScreenStream?.(remoteId, stream);
      else this.events.onRemoteStream?.(remoteId, stream);
    };
    peer.onicecandidate = (event) => { if (event.candidate) this.socket?.emit('voice:signal', { to: remoteId, data: event.candidate.toJSON() }); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'disconnected') { this.events.onConnectionQuality?.('reconnecting'); window.setTimeout(() => { if (peer.connectionState === 'disconnected') peer.restartIce(); }, 1_500); }
      if (peer.connectionState === 'failed') { this.events.onConnectionQuality?.('poor'); peer.restartIce(); }
    };
    if (initiator) {
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      this.socket?.emit('voice:signal', { to: remoteId, data: peer.localDescription });
    }
    return peer;
  }

  private emitParticipants() { this.events.onParticipantsChanged?.([...this.participants.values()]); }

  private async renegotiate() {
    for (const [remoteId, peer] of this.peers) {
      try { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); this.socket?.emit('voice:signal', { to: remoteId, data: peer.localDescription }); }
      catch (error) { this.events.onError?.(error instanceof Error ? error : new Error('Falha ao compartilhar tela.')); }
    }
  }

  private async measureQuality() {
    if (!this.peers.size) return;
    let worst: 'excellent' | 'good' | 'poor' = 'excellent';
    for (const peer of this.peers.values()) {
      try {
        const stats = await peer.getStats();
        stats.forEach((report) => {
          if (report.type !== 'candidate-pair' || report.state !== 'succeeded' || !report.nominated) return;
          const rtt = Number(report.currentRoundTripTime || 0); const loss = Number(report.packetsLost || 0);
          if (rtt > 0.45 || loss > 12) worst = 'poor'; else if ((rtt > 0.18 || loss > 4) && worst !== 'poor') worst = 'good';
        });
      } catch { worst = 'poor'; }
    }
    this.events.onConnectionQuality?.(worst);
  }
}

export class VoiceCallReceiver {
  private socket: Socket | null = null;
  constructor(private email: string, private onIncoming: (invitation: VoiceInvitation) => void) {}

  connect() {
    this.socket = io(signalingUrl(), { transports: ['websocket'], autoConnect: false, timeout: 10_000 });
    this.socket.on('connect', () => this.socket?.emit('voice:register', { email: this.email }));
    this.socket.on('voice:incoming-call', (invitation: VoiceInvitation) => this.onIncoming(invitation));
    this.socket.connect();
  }

  decline(invitation: VoiceInvitation) { this.socket?.emit('voice:call-declined', { roomId: invitation.roomId, callerEmail: invitation.callerEmail }); }
  dispose() { this.socket?.disconnect(); this.socket = null; }
}

export function directVoiceRoom(firstEmail: string, secondEmail: string) {
  return `direct:${[firstEmail.toLowerCase(), secondEmail.toLowerCase()].sort().join(':')}`;
}
