var username = prompt('Enter username:');
var meetingid = prompt('Enter meetingid:');
var connection;
var myPeerConnection;
var webcamStream;
// var transceiver;
var mediaConstraints = { video: {width:240,height:240,aspectRatio:1.0,frameRate:{ max:25 }} };
var clientId;
const offerOptions = {
  offerToReceiveAudio: 0,
  offerToReceiveVideo: 1
};
function setData(usertype) {
  sendToServer({
    name: username,
    date: Date.now(),
    id: clientId,
    meetingId: meetingid,
    userType: usertype,
    type: "username"
  });
}

function sendToServer(msg) {
  var msgJSON = JSON.stringify(msg);

  console.log("Sending '" + msg.type + "' message: " + msgJSON);
  connection.send(msgJSON);
}

// function connect(){
connection = new WebSocket("ws://localhost:6505", "json");

connection.onopen = function (evt) { };
connection.onerror = function (evt) {
  console.dir(evt);
};
connection.onmessage = function (evt) {
  var msg = JSON.parse(evt.data);
  console.log(msg);
  switch (msg.type) {
    case 'id':
      clientId = msg.id;
      setData('candidate');
      break;
    case 'data':
      document.getElementById('details').innerText = JSON.stringify(msg);
      break;
    // Signaling messages: these messages are used to trade WebRTC
    // signaling information during negotiations leading up to a video
    // call.

    case "video-offer":  // Invitation and offer to chat
      handleVideoOfferMsg(msg);
      break;
    case "video-answer":  // Callee has answered our offer
      handleVideoAnswerMsg(msg);
      break;
    case "new-ice-candidate": // A new ICE candidate has been received
      handleNewICECandidateMsg(msg);
      break;
    case "hang-up":
      handleHangUpMsg(msg);
      break;
    default:
      console.log("Unknown message received:", msg);
  }
};
// }

async function handleVideoOfferMsg(msg) {
  targetUsername = msg.name;

  // If we're not already connected, create an RTCPeerConnection
  // to be linked to the caller.

  console.log("Received video chat offer from " + targetUsername);
  if (!myPeerConnection) {
    createPeerConnection();
  }

  // We need to set the remote description to the received SDP offer
  // so that our local WebRTC layer knows how to talk to the caller.

  var desc = new RTCSessionDescription(msg.sdp);

  // If the connection isn't stable yet, wait for it...

  if (myPeerConnection.signalingState != "stable") {
    console.log("  - But the signaling state isn't stable, so triggering rollback");

    // Set the local and remove descriptions for rollback; don't proceed
    // until both return.
    await Promise.all([
      myPeerConnection.setLocalDescription({ type: "rollback" }),
      myPeerConnection.setRemoteDescription(desc)
    ]);
    return;
  } else {
    console.log("  - Setting remote description");
    await myPeerConnection.setRemoteDescription(desc);
  }

  // Get the webcam stream if we don't already have it

  if (!webcamStream) {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    } catch (err) {
      handleGetUserMediaError(err);
      return;
    }

      // document.getElementById("local_video").srcObject = webcamStream;

    // Add the camera stream to the RTCPeerConnection

    try {
      webcamStream.getTracks().forEach(track => myPeerConnection.addTrack(track,webcamStream));
    } catch (err) {
      handleGetUserMediaError(err);
    }
  }

  console.log("---> Creating and sending answer to caller");

  await myPeerConnection.setLocalDescription(await myPeerConnection.createAnswer());

  sendToServer({
    name: username,
    from: clientId,
    actor: 'proctor',
    target: meetingid,
    type: "video-answer",
    sdp: myPeerConnection.localDescription
  });
}

async function handleVideoAnswerMsg(msg) {
  console.log("*** Call recipient has accepted our call");

  // Configure the remote description, which is the SDP payload
  // in our "video-answer" message.

  var desc = new RTCSessionDescription(msg.sdp);
  await myPeerConnection.setRemoteDescription(desc).catch(function (err) { console.log(err.name, err.message); });
}

async function handleNewICECandidateMsg(msg) {
  var candidate = new RTCIceCandidate(msg.candidate);

  console.log("*** Adding received ICE candidate: " + JSON.stringify(candidate));
  try {
    await myPeerConnection.addIceCandidate(candidate)
  } catch (err) {
    console.log(err.name, err.message);
  }
}

function handleHangUpMsg(msg) {
  console.log("*** Received hang up notification from other peer");

  closeVideoCall();
}

async function shareAV() {
  if (myPeerConnection) {
    alert("You can't start a call because you already have one open!");
  } else {
    if (meetingid === username) {
      alert("I'm afraid I can't let you talk to yourself. That would be weird.");
      return;
    }
    createPeerConnection();

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      // document.getElementById("local_video").srcObject = webcamStream;
    } catch (err) {
      handleGetUserMediaError(err);
      return;
    }

    // Add the tracks from the stream to the RTCPeerConnection

    try {
      webcamStream.getTracks().forEach(
        // track => myPeerConnection.addTrack(track, { streams: [webcamStream] })
        track => myPeerConnection.addTrack(track,webcamStream)
      );
    } catch (err) {
      handleGetUserMediaError(err);
    }
  }
}

async function createPeerConnection() {
  console.log("Setting up a connection...");

  // Create an RTCPeerConnection which knows to use our chosen
  // STUN server.
  var servers = {
    iceServers: [     // Information about ICE servers - Use your own!
      {
        urls: "turn:" + 'localhost',  // A TURN server
        username: "webrtc",
        credential: "turnserver"
      }
    ]
  };
  myPeerConnection = new RTCPeerConnection();

  // Set up event handlers for the ICE negotiation process.

  myPeerConnection.onicecandidate = handleICECandidateEvent;
  myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
  myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
  myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
  myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
  myPeerConnection.ontrack = handleTrackEvent;
  console.log(myPeerConnection);
}

function handleICECandidateEvent(event) {
  if (event.candidate) {
    console.log("*** Outgoing ICE candidate: " + event.candidate.candidate);

    sendToServer({
      type: "new-ice-candidate",
      from: clientId,
      target: meetingid,
      actor:'proctor',
      candidate: event.candidate
    });
  }
}

function handleICEConnectionStateChangeEvent(event) {
  console.log("*** ICE connection state changed to " + myPeerConnection.iceConnectionState);

  switch (myPeerConnection.iceConnectionState) {
    case "closed":
    case "failed":
    case "disconnected":
      closeVideoCall();
      break;
  }
}
function handleICEGatheringStateChangeEvent(event) {
  console.log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);
}
async function handleNegotiationNeededEvent() {
  console.log("*** Negotiation needed");

  try {
    console.log("---> Creating offer");
    const offer = await myPeerConnection.createOffer();

    // If the connection hasn't yet achieved the "stable" state,
    // return to the caller. Another negotiationneeded event
    // will be fired when the state stabilizes.

    if (myPeerConnection.signalingState != "stable") {
      console.log("     -- The connection isn't stable yet; postponing...")
      return;
    }

    // Establish the offer as the local peer's current
    // description.

    console.log("---> Setting local description to the offer");
    await myPeerConnection.setLocalDescription(offer);

    // Send the offer to the remote peer.

    console.log("---> Sending the offer to the remote peer");
    sendToServer({
      name: username,
      from: clientId,
      actor: 'proctor',
      target: meetingid,
      type: "video-offer",
      sdp: myPeerConnection.localDescription
    });
  } catch (err) {
    console.log("*** The following error occurred while handling the negotiationneeded event:", err.name, err.message);
    //   reportError(err);
  };
}

function handleSignalingStateChangeEvent(event) {
  console.log("*** WebRTC signaling state changed to: " + myPeerConnection.signalingState);
  switch (myPeerConnection.signalingState) {
    case "closed":
      closeVideoCall();
      break;
  }
}

function hangUpCall() {
  closeVideoCall();

  sendToServer({
    name: username,
    target: clientId,
    type: "hang-up"
  });
}

function closeVideoCall() {
  var localVideo = document.getElementById("local_video");

  console.log("Closing the call");

  // Close the RTCPeerConnection

  if (myPeerConnection) {
    console.log("--> Closing the peer connection");

    // Disconnect all our event listeners; we don't want stray events
    // to interfere with the hangup while it's ongoing.

    myPeerConnection.ontrack = null;
    myPeerConnection.onnicecandidate = null;
    myPeerConnection.oniceconnectionstatechange = null;
    myPeerConnection.onsignalingstatechange = null;
    myPeerConnection.onicegatheringstatechange = null;
    myPeerConnection.onnotificationneeded = null;

    // Stop all transceivers on the connection

    myPeerConnection.getTransceivers().forEach(transceiver => {
      if(transceiver) transceiver.stop();
    });

    // Stop the webcam preview as well by pausing the <video>
    // element, then stopping each of the getUserMedia() tracks
    // on it.

    if (webcamStream) {
      localVideo.pause();
      webcamStream.getTracks().forEach(track => {
        track.stop();
      });
    }

    // Close the peer connection

    myPeerConnection.close();
    myPeerConnection = null;
    webcamStream = null;
  }

  // Disable the hangup button

  document.getElementById("hangup-button").disabled = true;
  // targetUsername = null;
}

function handleTrackEvent(event) {
  console.log("*** Track event",event.streams[0]);
  // document.getElementById("received_video").srcObject = event.streams[0];
  document.getElementById("hangup-button").disabled = false;
}

function handleGetUserMediaError(e) {
  console.log(e);
  switch (e.name) {
    case "NotFoundError":
      alert("Unable to open your call because no camera and/or microphone" +
        "were found.");
      break;
    case "SecurityError":
    case "PermissionDeniedError":
      // Do nothing; this is the same as the user canceling the call.
      break;
    default:
      alert("Error opening your camera and/or microphone: " + e.message);
      break;
  }

  // Make sure we shut down our end of the RTCPeerConnection so we're
  // ready to try again.

  closeVideoCall();
}