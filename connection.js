const MQTT_BROKER_HOST      = "ws://broker.emqx.io:8083/mqtt";
const MQTT_PUBLISH_TOPIC    = "ipc/devices/me/request";
const MQTT_SUBSCRIBE_TOPIC  = "ipc/devices/me/respond";

let mosqp;
let bHostConnected = false;

/** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
 ** MQTT Connection
 ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
*/
// document.addEventListener('DOMContentLoaded', function() {
//     document.getElementById('media').style.display = 'none';
//     document.getElementById('create-signaling').style.display = 'none';

//     mosqp = mqtt.connect(MQTT_BROKER_HOST);

//     mosqp.on('connect', () => {
//         console.log("Connected to " + MQTT_BROKER_HOST);
//         mosqp.subscribe(MQTT_SUBSCRIBE_TOPIC);

//         /* Send salutation message */
//         let serial = document.getElementById('product-id').textContent;
//         const msg = JSON.stringify({
//             Method: "SET",
//             Serial: serial,
//             Command: "Request",
//             MessageType: "DeviceStatus"
//         });
//         mosqp.publish(MQTT_PUBLISH_TOPIC, msg);
//     });

//     mosqp.on('message', (topic, message) => {
//         // console.log(`Received message. Payload: ${message.toString()}. Topic: ${topic}`);
//         try {
//             const msg = JSON.parse(message.toString());
    
//             if (msg.Command === "Respond") {
//                 if (msg.MessageType == "Signaling") {
//                     console.log(msg.Data);
//                     if (!bPeerCreated) {
//                         if (msg.Data.type == "offer") {
//                             handleOffer(msg.Data);
//                         }
//                     }
//                 }
//                 else if (msg.MessageType == "DeviceStatus") {
//                     document.getElementById('product-id').textContent = msg.Data.ProductID;
//                     document.getElementById('chipset').textContent = msg.Data.Chipset;
//                     document.getElementById('version').textContent = msg.Data.Version;
//                     document.getElementById('cpu').textContent = msg.Data.CPU;
//                     document.getElementById('last-connected').textContent = timestampToDatetime(msg.Data.Timestamp);
//                     document.getElementById('create-signaling').style.display = 'block';
//                 }
//             }
//         }
//         catch (error) {
//             alert(message.payloadString);
//         }
//     });

//     mosqp.on('reconnect', () => {
//         console.log("Reconnect to " + MQTT_BROKER_HOST);
//     });

//     mosqp.on('error', (error) => {
//         alert("Can't establish MQTT connection" + MQTT_BROKER_HOST);
//     });

//     mosqp.on('close', () => {
//         alert("Can't connect to " + MQTT_BROKER_HOST);
//     });
// });

function openSession() {
    document.getElementById('media').style.display = 'none';
    document.getElementById('create-signaling').style.display = 'none';

    mosqp = mqtt.connect(MQTT_BROKER_HOST);

    mosqp.on('connect', () => {
        document.getElementById('open-session').style.display = 'none';
        console.log("Connected to " + MQTT_BROKER_HOST);
        mosqp.subscribe(MQTT_SUBSCRIBE_TOPIC);

        /* Send salutation message */
        let serial = document.getElementById('product-id').textContent;
        const msg = JSON.stringify({
            Method: "SET",
            Serial: serial,
            Command: "Request",
            MessageType: "DeviceStatus"
        });
        mosqp.publish(MQTT_PUBLISH_TOPIC, msg);
    });

    mosqp.on('message', (topic, message) => {
        // console.log(`Received message. Payload: ${message.toString()}. Topic: ${topic}`);
        try {
            const msg = JSON.parse(message.toString());
    
            if (msg.Command === "Respond") {
                if (msg.MessageType == "Signaling") {
                    console.log(msg.Data);
                    if (!bPeerCreated) {
                        if (msg.Data.type == "offer") {
                            handleOffer(msg.Data);
                        }
                    }
                }
                else if (msg.MessageType == "DeviceStatus") {
                    document.getElementById('product-id').textContent = msg.Data.ProductID;
                    document.getElementById('chipset').textContent = msg.Data.Chipset;
                    document.getElementById('version').textContent = msg.Data.Version;
                    document.getElementById('cpu').textContent = msg.Data.CPU;
                    document.getElementById('last-connected').textContent = timestampToDatetime(msg.Data.Timestamp);
                    document.getElementById('create-signaling').style.display = 'block';
                }
            }
        }
        catch (error) {
            alert(message.payloadString);
        }
    });

    mosqp.on('reconnect', () => {
        console.log("Reconnect to " + MQTT_BROKER_HOST);
    });

    mosqp.on('error', (error) => {
        alert("Can't establish MQTT connection" + MQTT_BROKER_HOST);
    });

    mosqp.on('close', () => {
        alert("Can't connect to " + MQTT_BROKER_HOST);
    });
}

function performPublish(msg) {
    if (mosqp) {
        mosqp.publish(MQTT_PUBLISH_TOPIC, msg);
    }
    else {
        alert("Can't establish MQTT connection" + MQTT_BROKER_HOST);
    }
}

/** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
 ** Peer Connection
 ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** 
*/
let bPeerCreated = false;
let pc = null;
let dc = null;
const clientId = randomId(5);

function onSignaling() {
    if (!bPeerCreated) {
        ////////////////////////   Create Peer Connection   ////////////////////////
        let serial = document.getElementById('product-id').textContent;
        const msg = JSON.stringify({
            Method: "SET",
            Serial: serial,
            Command: "Request",
            MessageType: "Signaling",
            Data: {
                id: clientId,
                type: "request"
            }
        });
        performPublish(msg);
    }
    else {
        ////////////////////////   Close Peer Connection   ////////////////////////
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
        
        bPeerCreated = false;
        document.getElementById('media').style.display = 'none';
        document.getElementById('create-signaling').textContent = "Watch"
    }
}

function createPeerConnection() {
    const config = {
        bundlePolicy: "max-bundle",
    };
    config.iceServers = [{urls: ['stun:stun.l.google.com:19302']}];

    let pc = new RTCPeerConnection(config);

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
            bPeerCreated = true;
            document.getElementById('create-signaling').textContent = "Close"
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

    let sn = document.getElementById('product-id').textContent;
    const msg = JSON.stringify({
        Method: "SET",
        Serial: sn,
        Command: "Request",
        MessageType: "Signaling",
        Data: {
            id: clientId,
            type: answer.type,
            sdp: answer.sdp,
        }
    });
    performPublish(msg);
}

async function handleOffer(offer) {
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

/* Helper function to generate a random ID */
function randomId(length) {
    const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const pickRandom = () => characters.charAt(Math.floor(Math.random() * characters.length));
    return [...Array(length) ].map(pickRandom).join('');
}

/* Helper function convert unix timestamp to datetime human readable */
function timestampToDatetime(timestamp) {
    const date = new Date(timestamp * 1000);

    // Extract components
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    // Format as day/month/year hour:minute:second
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}