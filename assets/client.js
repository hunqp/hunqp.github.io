const MQTT_BROKER_HOST      = "broker.hivemq.com";
const MQTT_BROKER_PORT      = 8000;
const MQTT_PUBLISH_TOPIC    = "ipc/devices/me/request";
const MQTT_SUBSCRIBE_TOPIC  = "ipc/devices/me/respond";

var iceConnectionLog;
var iceGatheringLog;
var signalingLog;

let bPeerConnected = false;
let bHostConnected = false;

let pc = null;
let dc = null;

document.addEventListener('DOMContentLoaded', function() {
    iceConnectionLog = document.getElementById('ice-connection-state');
    iceGatheringLog = document.getElementById('ice-gathering-state');
    signalingLog = document.getElementById('signaling-state');

    // performConnection(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
});

function onOpenMQTT() {
    performConnection(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
}

/** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
 ** Peer Connection
 ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
*/
function onPeerConnection() {
    if (!bPeerConnected) {
        console.log("Open peer connection");
        let sn = document.getElementById('ipc-sn-01').textContent;
        const msg = JSON.stringify({
            Method: "SET",
            Serial: sn,
            Command: "Request",
            MessageType: "PeerConnection",
            Data: {
                id: sn,
                type: "request"
            }
        });
        console.log(msg);
        performPublish(msg);
    }
    else {
        console.log("Close peer connection");

        if (dc) {
            dc.close();
            dc = null;
        }
    
        /* Close transceivers */
        if (pc.getTransceivers) {
            pc.getTransceivers().forEach((transceiver) => {
                if (transceiver.stop) {
                    transceiver.stop();
                }
            });
        }
    
        /* Close local audio/video */
        pc.getSenders().forEach((sender) => {
            const track = sender.track;
            if (track !== null) {
                sender.track.stop();
            }
        });
    
        /* Close peer connection */
        pc.close();
        pc = null;

        bPeerConnected = false;
        document.getElementById('button-peer-connect').textContent = "Connect"
        document.getElementById('media').style.display = 'none';
    }
}

function createPeerConnection() {
    const config = {
        bundlePolicy: "max-bundle",
    };
    config.iceServers = [{urls: ['stun:stun.l.google.com:19302']}];

    let pc = new RTCPeerConnection(config);
    
    /* Register some listeners to help debugging */
    pc.addEventListener('iceconnectionstatechange', () =>
        iceConnectionLog.textContent = pc.iceConnectionState.toUpperCase());
    iceConnectionLog.textContent = pc.iceConnectionState;

    pc.addEventListener('icegatheringstatechange', () =>
        iceGatheringLog.textContent = pc.iceGatheringState.toUpperCase());
    iceGatheringLog.textContent = pc.iceGatheringState;

    pc.addEventListener('signalingstatechange', () =>
        signalingLog.textContent = pc.signalingState.toUpperCase());
    signalingLog.textContent = pc.signalingState;

    // Receive audio/video track
    pc.ontrack = (evt) => {
        document.getElementById('media').style.display = 'block';
        const video = document.getElementById('video');
        // always overrite the last stream - you may want to do something more clever in practice
        video.srcObject = evt.streams[0]; // The stream groups audio and video tracks
        video.play();
    };

    // Receive data channel
    pc.ondatachannel = (evt) => {
        dc = evt.channel;

        dc.onopen = () => {
            bPeerConnected = true;
            document.getElementById('button-peer-connect').textContent = "Disconnect"
        };

        let dcTimeout = null;
        dc.onmessage = (evt) => {
            if (typeof evt.data !== 'string') {
                return;
            }

            dcTimeout = setTimeout(() => {
                if (!dc) {
                    return;
                }
                const message = `Pong ${currentTimestamp()}`;
                dc.send(message);
            }, 1000);
        }

        dc.onclose = () => {
            clearTimeout(dcTimeout);
            dcTimeout = null;
        };
    }

    return pc;
}

async function waitGatheringComplete() {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
        } else {
            pc.addEventListener('icegatheringstatechange', () => {
                if (pc.iceGatheringState === 'complete') {
                    resolve();
                }
            });
        }
    });
}

async function sendAnswer(pc) {
    await pc.setLocalDescription(await pc.createAnswer());
    await waitGatheringComplete();

    const answer = pc.localDescription;

    let sn = document.getElementById('ipc-sn-01').textContent;
    const msg = JSON.stringify({
        Method: "SET",
        Serial: sn,
        Command: "Request",
        MessageType: "PeerConnection",
        Data: {
            id: sn,
            type: answer.type,
            sdp: answer.sdp,
        }
    });
    console.log(msg);
    performPublish(msg);
}

async function handleOffer(offer) {
    console.log(offer);
    pc = createPeerConnection();
    await pc.setRemoteDescription(offer);
    await sendAnswer(pc);
}

/* Helper function to generate a timestamp */
let startTime = null;
function currentTimestamp() {
    if (startTime === null) {
        startTime = Date.now();
        return 0;
    } else {
        return Date.now() - startTime;
    }
}

/** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
 ** MQTT Connection
 ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
*/
function performConnection(host, port) {
    clientID = "ipc-" + parseInt(Math.random() * 100);
    client = new Paho.MQTT.Client(host, port, clientID);
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;
    client.connect({
        onSuccess: onConnected
    });
}

function forceDisconnection() {
    client.disconnect();
    bHostConnected = false;
    document.getElementById('button-peer-connect').innerText = "Connect";
}

function onConnected() {
    bHostConnected = true;
    client.subscribe(MQTT_SUBSCRIBE_TOPIC);
    console.log("Connected to " + MQTT_BROKER_HOST);

    let sn = document.getElementById('ipc-sn-01').textContent;
    const msg = JSON.stringify({
        Method: "SET",
        Serial: sn,
        Command: "Request",
        MessageType: "DeviceStatus"
    });
    console.log(msg);
    performPublish(msg);
}

function onConnectionLost(responseObject){
    if (responseObject !=0){
        bHostConnected = false;
        document.getElementById('button-peer-connect').innerText = "Disconnect";
    }
}

async function onMessageArrived(message) {
    try {
        const msg = JSON.parse(message.payloadString);
        console.log(message.payloadString);

        if (msg.Command == "Respond") {
            if (msg.MessageType == "PeerConnection") {
                if (msg.Data.type == "offer") {
                    handleOffer(msg.Data);
                }
            }
            else if (msg.MessageType == "DeviceStatus") {
                document.getElementById('icp-status').textContent = "ONLINE";
            }
        }
    }
    catch (error) {
        alert(message.payloadString);
    }
}

function performPublish(msg){
    if (bHostConnected === false) {
        console.log("Can't publish cause broker is disconnected");
        return;
    }
    Message = new Paho.MQTT.Message(msg);
    Message.destinationName = MQTT_PUBLISH_TOPIC;

    client.send(Message);
}
