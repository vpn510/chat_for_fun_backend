const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// In-memory storage
const onlineUsers = new Map();
const messages = [];

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    onlineUsers: onlineUsers.size,
    messages: messages.length 
  });
});

io.on('connection', (socket) => {
  console.log('🔌 New connection:', socket.id);

  socket.on('user_join', (username) => {
    socket.username = username;
    onlineUsers.set(socket.id, username);
    socket.emit('previous_messages', messages);
    const usersList = Array.from(onlineUsers.values());
    io.emit('users_update', usersList);
    socket.broadcast.emit('user_joined', username);
    console.log(`✅ ${username} joined. Online: ${onlineUsers.size}`);
  });

  socket.on('send_message', (data) => {
    const message = {
      id: Date.now() + Math.random(),
      username: data.username,
      text: data.text,
      timestamp: new Date().toISOString()
    };
    messages.push(message);
    if (messages.length > 100) messages.shift();
    io.emit('receive_message', message);
    console.log(`💬 ${data.username}: ${data.text}`);
  });

  socket.on('typing', (username) => {
    socket.broadcast.emit('user_typing', username);
  });

  socket.on('stop_typing', () => {
    socket.broadcast.emit('user_stop_typing');
  });

  socket.on('call_user', (data) => {
    const targetSocketId = Array.from(onlineUsers.entries())
      .find(([, name]) => name === data.to)?.[0];
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_call', {
        from: data.from,
        offer: data.offer,
        callType: data.callType
      });
      console.log(`📞 Call from ${data.from} to ${data.to}`);
    }
  });

  socket.on('answer_call', (data) => {
    const targetSocketId = Array.from(onlineUsers.entries())
      .find(([, name]) => name === data.to)?.[0];
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_answered', {
        from: socket.username,
        answer: data.answer
      });
      console.log(`✅ ${socket.username} answered call from ${data.to}`);
    }
  });

  socket.on('ice_candidate', (data) => {
    const targetSocketId = Array.from(onlineUsers.entries())
      .find(([, name]) => name === data.to)?.[0];
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice_candidate', {
        from: socket.username,
        candidate: data.candidate
      });
    }
  });

  socket.on('reject_call', (data) => {
    const targetSocketId = Array.from(onlineUsers.entries())
      .find(([, name]) => name === data.to)?.[0];
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_rejected', {
        from: socket.username
      });
      console.log(`❌ ${socket.username} rejected call from ${data.to}`);
    }
  });

  socket.on('end_call', (data) => {
    const targetSocketId = Array.from(onlineUsers.entries())
      .find(([, name]) => name === data.to)?.[0];
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended', {
        from: socket.username
      });
      console.log(`📴 Call ended between ${socket.username} and ${data.to}`);
    }
  });

  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    if (username) {
      onlineUsers.delete(socket.id);
      const usersList = Array.from(onlineUsers.values());
      io.emit('users_update', usersList);
      socket.broadcast.emit('user_left', username);
      console.log(`👋 ${username} left. Online: ${onlineUsers.size}`);
    }
  });
});

server.listen(4521, () => {
  console.log(`🚀 Server running on port ${4521}`);
  console.log(`📡 WebRTC signaling enabled`);
});