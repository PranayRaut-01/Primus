// server.js

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (optional)
app.use(express.static('public'));

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A user connected');

  // Join a room
  socket.on('join room', (room) => {
    socket.join(room);
    console.log(`User joined room: ${room}`);
  });

  // Handle incoming messages
  socket.on('chat_message', (msg) => {
    console.log('Message:', msg);
    const { room, message } = msg;
    // Broadcast the message to everyone in the room
    io.to(room).emit('chat message', message);


  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});


