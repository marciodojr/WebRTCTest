'use strict';

var os = require('os');
var express = require('express');
var app = express();
var socketIO = require('socket.io');
var https = require('https');

var fs = require('fs');

var options = {
  key: fs.readFileSync('keys/key.pem'),
  cert: fs.readFileSync('keys/cert.pem')
};

var server = https.createServer(options, app);
server.listen(8080);
var io = socketIO.listen(server);

app.use(express.static('public'));

io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message) {
    log('Client said: ', message);
    // room only broadcast
    socket.broadcast.in(socket.room).emit('message', message);
  });

  socket.on('create or join', function(roomName) {
    log('Received request to create or join room ' + roomName);
    var room = io.sockets.adapter.rooms[roomName];
    var numClients = (room === undefined) ? 1 : (room.length + 1);
    log('A new client is trying to enter in the room ' + roomName);

    if (numClients === 1) {
      socket.join(roomName);
      log('Client ID ' + socket.id + ' created room ' + roomName);
      socket.emit('created', roomName, socket.id);
    } else if (numClients === 2) {
      io.sockets.in(roomName).emit('join', roomName);
      socket.join(roomName);
      socket.emit('joined', roomName, socket.id);
      log('Client ID ' + socket.id + ' joined room ' + roomName);
      io.sockets.in(roomName).emit('ready');
    } else { // max two clients
      socket.emit('full', roomName);
    }

    if(numClients < 3) {
        log('The room ' + roomName + ' now has ' + numClients + ' client(s).');
        socket.room = roomName;
    }

  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('error', function(error){
      log('socket error', error);
  });

});
