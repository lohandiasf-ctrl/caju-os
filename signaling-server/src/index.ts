import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://operacoes.cajutech.net').split(',').map((value) => value.trim());
app.use(cors({ origin: allowedOrigins }));
app.get('/health', (_request, response) => response.json({ ok: true }));
const server = createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }, transports: ['websocket'] });
type Participant = { roomId: string; userId: string; userName: string };
const participants = new Map<string, Participant>();
const rooms = new Map<string, Set<string>>();

io.on('connection', (socket: Socket) => {
  socket.on('voice:join', (payload: Participant) => {
    if (!payload?.roomId || !payload.userId || !payload.userName || payload.roomId.length > 300) return socket.emit('voice:error', 'Sala inválida.');
    leave(socket);
    const members = rooms.get(payload.roomId) ?? new Set<string>();
    if (members.size >= 6) return socket.emit('voice:error', 'Sala cheia. Limite de 6 participantes.');
    participants.set(socket.id, payload); rooms.set(payload.roomId, members); socket.join(payload.roomId);
    socket.emit('voice:existing-peers', [...members].map((id) => ({ socketId: id, ...participants.get(id)! })));
    socket.to(payload.roomId).emit('voice:peer-joined', { socketId: socket.id, userId: payload.userId, userName: payload.userName });
    members.add(socket.id);
  });
  socket.on('voice:signal', ({ to, data }: { to?: string; data?: unknown }) => {
    const source = participants.get(socket.id); const target = to ? participants.get(to) : null;
    if (!source || !target || source.roomId !== target.roomId || JSON.stringify(data).length > 100_000) return;
    io.to(to!).emit('voice:signal', { from: socket.id, data });
  });
  socket.on('voice:leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket));
});

function leave(socket: Socket) {
  const participant = participants.get(socket.id); if (!participant) return;
  const members = rooms.get(participant.roomId); members?.delete(socket.id);
  if (!members?.size) rooms.delete(participant.roomId);
  socket.to(participant.roomId).emit('voice:peer-left', { socketId: socket.id });
  participants.delete(socket.id); socket.leave(participant.roomId);
}

server.listen(Number(process.env.PORT || process.env.SIGNALING_PORT || 4000));
