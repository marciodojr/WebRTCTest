'use strict';

var webRTCApp = function(io, localVideoId, remoteVideoId, mediaConstraints, peerConnectionConfig, sdpConstraints, room){

    var localStream = null;
    var remoteStream = null;

    var localPeerConnection = null;
    var isChannelReady = false;
    var isInitiator = false;
    var isStarted = false;

    var localVideo = document.getElementById(localVideoId);
    var remoteVideo = document.getElementById(remoteVideoId);

    /* ######################## Socket.io Events ########################## */

    var NUMBER_OF_ATTEMPTS = 10;
    var TIME_BETWEEN_ATTEMPTS = 200;

    var socket = io.connect({
    	'forceNew':true,
    	'reconnection': true,
    	'reconnectionDelay': TIME_BETWEEN_ATTEMPTS,
    	'reconnectionDelayMax' : TIME_BETWEEN_ATTEMPTS * 5,
    	'reconnectionAttempts': NUMBER_OF_ATTEMPTS,
    	'transports': [
    		'websocket'
    	]
    });

    socket.on("connect", function(){
        openWebcam();
        initSocketActionsAndListeners();
    });

    function sendMessage(message) {
        console.log('Client sending message: ', message);
        socket.emit('message', message);
    }

    // Setup signalling
    function initSocketActionsAndListeners() {
        console.log('Message from client: Asking to join room ' + room);
        socket.emit('create or join', room);

        socket.on('created', function(room, clientId) {
            console.log('Created room ' + room);
            isInitiator = true;
        });

        socket.on('full', function(room) {
            console.log('Message from client: Room ' + room + ' is full :^(');
        });

        socket.on('join', function (room){
          console.log('Another peer made a request to join room ' + room);
          console.log('This peer is the initiator of room ' + room + '!');
          isInitiator = true;
          isChannelReady = true;
        });

        socket.on('ipaddr', function(ipaddr) {
            console.log('Message from client: Server IP address is ' + ipaddr);
        });

        socket.on('joined', function(room, clientId) {
          isInitiator = false;
          isChannelReady = true;
        });

        socket.on('log', function(array) {
          console.log.apply(console, array);
        });

        // This client receives a message
        socket.on('message', function(message) {
          console.log('Client received message:', message);
          if (message.type === 'localstream') {
            maybeStart();
          } else if (message.type === 'offer') {
            if (!isInitiator && !isStarted) {
              maybeStart();
            }
            localPeerConnection.setRemoteDescription(new RTCSessionDescription(message));
            doAnswer();
          } else if (message.type === 'answer' && isStarted) {
            localPeerConnection.setRemoteDescription(new RTCSessionDescription(message));
          } else if (message.type === 'candidate' && isStarted) {
            var candidate = new RTCIceCandidate({
              sdpMLineIndex: message.label,
              candidate: message.candidate
            });
            localPeerConnection.addIceCandidate(candidate);
        } else if (message.type === 'endconnection' && isStarted) {
            handleRemoteHangup();
          }
        });
    }

    /* ######################## functions ################################# */

    // access to webcam
    function openWebcam(){
        navigator.mediaDevices.getUserMedia(mediaConstraints).then(function(stream){
            feedback("Success: local stream", stream);
            localStream = stream;
            localVideo.src = window.URL.createObjectURL(stream);
            sendMessage({
                type: 'localstream'
            });
            if (isInitiator) {
                maybeStart();
            }
        }).catch(function(error){
            feedback("Error: local stream", error);
        });
    }

    function maybeStart() {
        feedback('isStarted ', isStarted);
        feedback('isChannelReady ', isChannelReady);
        if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
            feedback('creating peer connection');
            createPeerConnection();
            // handle stream on local peer
            localPeerConnection.addStream(localStream);
            feedback("Added local stream to local peer connection");
            isStarted = true;
            feedback('isInitiator', isInitiator);
            if (isInitiator) {
                doCall();
            }
        }
    }

    function doCall() {
        feedback('Sending offer to peer');
        localPeerConnection.createOffer(setLocalAndSendMessage, handleCreateOfferError);
    }

    function setLocalAndSendMessage(sessionDescription) {
        localPeerConnection.setLocalDescription(sessionDescription);
        feedback('setLocalAndSendMessage sending message', sessionDescription);
        sendMessage(sessionDescription);
    }

    function handleCreateOfferError(event) {
        feedback('createOffer() error: ', event);
    }

    function doAnswer() {
        feedback('Sending answer to peer.');
        localPeerConnection
            .createAnswer()
            .then(
                setLocalAndSendMessage,
                onCreateSessionDescriptionError
        );
    }

    function onCreateSessionDescriptionError(error) {
        feedback('Failed to create session description: ', error);
    }

    // create the RTCPeerConnection
    function createPeerConnection() {
        try {
            // local peer connection
            localPeerConnection = new RTCPeerConnection(peerConnectionConfig);

            // listen for ice candidates
            localPeerConnection.onicecandidate = handleIceCandidate;
            feedback("Listening for Ice candidates");

            localPeerConnection.onaddstream = handleRemoteStreamAdded;
            localPeerConnection.onremovestream = handleRemoteStreamRemoved;

            feedback("Created local peer connection", localPeerConnection);
        } catch(e) {
            feedback('Failed to create PeerConnection, exception: ', e);
        }
    }

    function handleIceCandidate(event) {
        feedback('icecandidate event: ', event);
        if (event.candidate) {
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
            feedback('Ice candidate: ', event.candidate.candidate);
        } else {
            feedback('End of candidates.');
        }
    }

    function handleRemoteStreamAdded(event) {
        remoteVideo.src = URL.createObjectURL(event.stream);
        remoteStream = event.stream;
        feedback('Remote stream added.');
    }

    function handleRemoteStreamRemoved(event) {
      feedback('Remote stream removed. Event: ', event);
    }

    function hangup() {
      feedback('Hanging up.');
      stop();
      sendMessage({
          type: 'endconnection'
      });
    }

    function handleRemoteHangup() {
      feedback('Session terminated.');
      stop();
      isInitiator = false;
    }

    function stop() {
        isStarted = false;
        localPeerConnection.close();
        localPeerConnection = null;
    }

    window.onbeforeunload = function() {
      sendMessage({
          type: 'endconnection'
      });
    };

    /* ############################# feedback messages ##################### */

    function feedback(msg, data) {
        console.log("[WebRTC Debug] " + msg, data);
    }
};
