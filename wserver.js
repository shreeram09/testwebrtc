const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocketServer = require('websocket').server;

const keyFilePath = "/etc/pki/tls/private/mdn.key";
const certFilePath = "/etc/pki/tls/private/mdn.cert";

var nextID = Date.now();
const appendToMakeUnique = 1;

var httpsOptions = {
    key: null,
    cert: null
};

try {
    httpsOptions.key = fs.readFileSync(keyFilePath);
    try {
        httpsOptions.cert = fs.readFileSync(certFilePath);
    } catch (err) {
        httpsOptions.key = null;
        httpsOptions.cert = null;
    }
} catch (err) {
    httpsOptions.key = null;
    httpsOptions.cert = null;
}

var webServer = null;

try {
    if (httpsOptions.key && httpsOptions.cert) {
        webServer = https.createServer(httpsOptions, handleWebRequest);
    }
} catch (err) {
    webServer = null;
}

if (!webServer) {
    try {
        webServer = http.createServer({}, handleWebRequest);
    } catch (err) {
        webServer = null;
        log(`Error attempting to create HTTP(s) server: ${err.toString()}`);
    }
}

function handleWebRequest(request, response) {
    log("Received request for " + request.url);
    response.writeHead(404);
    response.end();
}

function getConnectionForID(id) {
    var connect = null;
    var i;

    for (i = 0; i < activeConnections.length; i++) {
        if (activeConnections[i].clientID === id) {
            connect = activeConnections[i];
            break;
        }
    }

    return connect;
}

webServer.listen(6505, function () {
    console.log("Server is listening on port 6505");
});

var wsServer = new WebSocketServer({
    httpServer: webServer,
    autoAcceptConnections: false
});

if (!wsServer) {
    console.log("ERROR: Unable to create WbeSocket server!");
}
var activeConnections = [];
wsServer.on('request', function (request) {
    var connection = request.accept("json", request.origin);
    connection.clientID = nextID;
    activeConnections.push(connection);
    nextID++;
    var msg = {
        type: "id",
        id: connection.clientID
    };
    connection.sendUTF(JSON.stringify(msg));
    connection.on('message', function (message) {

        if (message.type === 'utf8') {
            msg = JSON.parse(message.utf8Data);
            // console.log('==>', msg);
            // var connect = getConnectionForID(msg.id);
            switch (msg.type) {
                case "username":
                    for (var i = 0; i < activeConnections.length; i++) {
                        if (activeConnections[i].clientID === msg.id) {
                            activeConnections[i].name = msg.name;
                            activeConnections[i].type = msg.userType;
                            msg.type = 'data';
                            activeConnections[i].sendUTF(JSON.stringify(msg));
                            // msg.type='new-candidate';
                            // activeConnections[i].sendUTF(JSON.stringify(msg));
                            if (msg.userType === 'candidate') {
                                var proctor = activeConnections.filter(c => c.name === msg.meetingId);
                                // console.log(proctor);
                                if (proctor) {
                                    activeConnections[i].meetingId = msg.meetingId;
                                    msg.type = 'new-candidate';
                                    proctor[0].sendUTF(JSON.stringify(msg));
                                }
                            }
                        }

                    }
                    activeConnections.forEach((v, i) => console.log(i, v.clientID, v.name, v.type));
                    break;
            }
            if (msg.target && msg.target !== undefined && msg.target.length !== 0) {
                sendToOneUser(msg.target,msg.actor ,JSON.stringify(msg));
            }
            // activeConnections.forEach((v, i) => console.log(i, v.clientID, v.name, v.type));
        }
    });
    connection.on('close', function (reason, description) {
        activeConnections = activeConnections.filter(function (el, idx, ar) {
            return el.connected;
        });
        console.log(`address:${connection.remoteAddress}, reason:${reason}, description:${description}`);
    });
});
function sendToOneUser(target,actor, msgString) {
    // var isUnique = true;
    var i;

    for (i = 0; i < activeConnections.length; i++) {
        if (actor === 'proctor') {
            if (activeConnections[i].name === target) {
                activeConnections[i].sendUTF(msgString);
                break;
            }
        } else {
            if (activeConnections[i].clientID === target) {
                activeConnections[i].sendUTF(msgString);
                break;
            }
        }
    }
}
