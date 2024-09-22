function showContent(contentId) {
    const contents = document.querySelectorAll('.content');
    contents.forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById('bottom-' + contentId).classList.add('active');

    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    if (contentId === 'left') {
        tabs[0].classList.add('active');
    } else {
        tabs[1].classList.add('active');
    }
}

function queryPlaylist() {
    const startDate = new Date(document.getElementById('start-date').value);
    const endDate = new Date(document.getElementById('end-date').value);
    const tableBody = document.querySelector('#records-table tbody');

    // Clear previous records
    tableBody.innerHTML = '';

    // Simulate fetching records based on the date range
    const records = [
        { id: 1, title: 'Record A', timestamp: '2024-09-19T10:00:00' },
        { id: 2, title: 'Record B', timestamp: '2024-09-19T12:30:00' },
        { id: 3, title: 'Record C', timestamp: '2024-09-19T14:00:00' },
        { id: 4, title: 'Record C', timestamp: '2024-09-19T14:00:00' },
        { id: 5, title: 'Record C', timestamp: '2024-09-19T14:00:00' },
        { id: 6, title: 'Record C', timestamp: '2024-09-19T14:00:00' },
        { id: 7, title: 'Record C', timestamp: '2024-09-19T14:00:00' },
        // Add more sample records as needed
    ];

    records.forEach(record => {
        const recordDate = new Date(record.timestamp);
        
        // Ensure we compare the start and end dates properly
        if (recordDate >= startDate && recordDate <= endDate) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${record.id}</td>
                <td>${record.title}</td>
                <td>${record.timestamp}</td>
            `;
            tableBody.appendChild(row);
        }
    });

    // Check if any records were found
    if (tableBody.innerHTML === '') {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="3">No records found</td>`;
        tableBody.appendChild(row);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////
const MQTT_BROKER_HOST      = "wss://broker.emqx.io:8084/mqtt";
const MQTT_PUBLISH_TOPIC    = "ipc/devices/me/request";
const MQTT_SUBSCRIBE_TOPIC  = "ipc/devices/me/respond";

let Sn;
let mosqp;
let pc = null;
let dc = null;
let isPeerCreated = false;
const clientId = randomId(5);

////////////////////////////////////////////////////////////////////////////////////////////
document.addEventListener('DOMContentLoaded', () => {
    hideP2PComponents(true);
    setTimeout(main, 500);
});

////////////////////////////////////////////////////////////////////////////////////////////
function main() {
    /* Hide components 
    */
    document.getElementById('media').style.display = 'none';

    /* DO: Start MQTT Connection 
    */
    mosqp = mqtt.connect(MQTT_BROKER_HOST);

    mosqp.on('connect', () => {
        console.log("Connected to " + MQTT_BROKER_HOST);
        mosqp.subscribe(MQTT_SUBSCRIBE_TOPIC);

        /* Send salutation message */
        const msg = JSON.stringify({
            Method: "SET",
            Sn: "BROADCAST",
            MessageType: "Request",
            Command: "Production"
        });
        mosqp.publish(MQTT_PUBLISH_TOPIC, msg);
    });

    mosqp.on('message', (topic, message) => {
        try {
            const msg = JSON.parse(message.toString());
            console.log(msg);
    
            if (msg.MessageType === "Respond") {
                if (msg.Command === "Signaling") {
                    console.log(msg.Data);
                    if (!isPeerCreated) {
                        if (msg.Data.type === "offer") {
                            handleOffer(msg.Data);
                        }
                    }
                }
                else if (msg.Command == "Production") {
                    updateListTableDevices(msg.Data);
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

////////////////////////////////////////////////////////////////////////////////////////////
function openSignaling(serial) {
    if (!isPeerCreated) {
        /* Create Peer Connection */
        Sn = serial;

        const data = {
            id: clientId,
            type: "request"
        };
        const msg = templateMessageTypeRequest("Signaling", data);
        performPublish(msg);
    }
    else {
        /* Close Peer Connection */
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

        Sn = '';
        isPeerCreated = false;
        hideP2PComponents(true);
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
            isPeerCreated = true;
            hideP2PComponents(false);
            document.getElementById('button-signaling').innerHTML = '<i class="fas fa-sign-out"></i>';
        };

        let dcTimeout = null;
        dc.onmessage = (evt) => {
            if (typeof evt.data !== 'string') {
                console.log("Can't handle message via data channel");
                return;
            }

            try {
                const msg = JSON.parse(evt.data);
                onMessage(msg);
            }
            catch (error) {
                alert(message.payloadString);
            }
        }

        dc.onclose = () => {
            clearTimeout(dcTimeout);
            dcTimeout = null;
        };
    }

    return pc;
}

function onMessage(msg) {
    if (msg.MessageType === "Respond" || msg.MessageType === "Report") {
        if (msg.Command == "Resource") {
            document.getElementById('cpu').textContent = msg.Data.CPU;
            document.getElementById('storage').textContent = msg.Data.Storage;
            document.getElementById('memory-usage').textContent = msg.Data.MemUsage;
            document.getElementById('runtime').textContent = msg.Data.Timestamp;
        }
        else if (msg.Command == "PANTILT") {
            
        }
    }
}

async function waitGatheringComplete() {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
        } 
        else {
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
    const data = {
        id: clientId,
        type: answer.type,
        sdp: answer.sdp
    }
    const msg = templateMessageTypeRequest("Signaling", data);
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
    const d = new Date(timestamp * 1000);
    return d.toLocaleString();
}

/*  Template message request
*/
function templateMessageTypeRequest(command, data) {
    return JSON.stringify({
        Method: "SET",
        Sn: Sn,
        MessageType: "Request",
        Command: command,
        Data: data
    });
}

function changeVideoResolution() {
    const sel = document.getElementById("resolution-select");
    const res = sel.value;
    
    const data = {
        Option: 1,                  /* 0/1/2 : IDLE/LIVE/PLAYBACK   */
        Resolution: parseInt(res)   /* 0/1   : HD/3MP               */
    };
    const msg = templateMessageTypeRequest("LIVEVIEW", data);
    if (dc) {
        dc.send(msg);
    }
}

/*  Update list table devices when devices has online.
    Create new instance if it's not existed
*/
function updateListTableDevices(data) {
    console.log(data);

    const tbody = document.querySelector("tbody");
    let existed = Array.from(tbody.rows).find(row => row.cells[1].innerText === data.Sn);

    if (existed) {
        existed.cells[2].innerText = data.Manufactor;
        existed.cells[3].innerText = data.Chipset;
        existed.cells[4].innerText = data.Version;
        existed.cells[5].innerText = data.Startup;
        existed.cells[6].innerText = data.LastConnected;
    }
    else {
        const instance = document.createElement("tr");
        instance.innerHTML = `
            <td>
                <button class="icon-button" id="button-signaling" onclick="openSignaling('${data.Sn}')">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </td>
            <td>${data.Sn}</td>
            <td>${data.Manufactor}</td>
            <td>${data.Chipset}</td>
            <td>${data.Version}</td>
            <td>${timestampToDatetime(data.Startup)}</td>
            <td>${timestampToDatetime(data.LastConnected)}</td>
        `;
        tbody.appendChild(instance);
    }
}

/* Show/Hide P2P components
*/
function hideP2PComponents(boolean) {
    if (!boolean) {
        document.getElementById('media').style.display = 'block';
        document.getElementById('bottom-pane').style.display = 'block';
        document.getElementById('ipc-resource').style.display = 'block';
        document.getElementById('resolution-display').style.display = 'block';
    }
    else {
        document.getElementById('media').style.display = 'none';
        document.getElementById('bottom-pane').style.display = 'none';
        document.getElementById('ipc-resource').style.display = 'none';
        document.getElementById('resolution-display').style.display = 'none';
    }
}

/*  Motors direction by data channel
*/
const TILTUP = document.getElementById('motor-up');
const PANLEFT = document.getElementById('motor-left');
const PANRIGHT = document.getElementById('motor-right');
const TILTDOWN = document.getElementById('motor-down');

let holdInterval; // To track the interval of holding

function onJoyStickHolding(direction) {
    holdInterval = setInterval(() => {
        const data = {
            Direction: direction
        };
        const msg = templateMessageTypeRequest("PANTILT", data);
        if (dc) {
            dc.send(msg);
        }
    }, 200);
}

function onJoyStickRelease() {
    clearInterval(holdInterval);
}

TILTUP.addEventListener('mousedown', onJoyStickHolding);
TILTUP.addEventListener('mouseup', onJoyStickRelease);
TILTUP.addEventListener('mouseleave', onJoyStickRelease);
TILTUP.addEventListener('touchend', onJoyStickRelease);
TILTUP.addEventListener('touchcancel', onJoyStickRelease);
/* Touch events for mobile */
TILTUP.addEventListener('touchstart', (e) => {
    e.preventDefault(); /* Prevents default behavior (like scrolling) */
    onJoyStickHolding("UP");
});

PANLEFT.addEventListener('mousedown', onJoyStickHolding);
PANLEFT.addEventListener('mouseup', onJoyStickRelease);
PANLEFT.addEventListener('mouseleave', onJoyStickRelease);
PANLEFT.addEventListener('touchend', onJoyStickRelease);
PANLEFT.addEventListener('touchcancel', onJoyStickRelease);
PANLEFT.addEventListener('touchstart', (e) => {
    e.preventDefault(); /* Prevents default behavior (like scrolling) */
    onJoyStickHolding("LEFT");
});

PANRIGHT.addEventListener('mousedown', onJoyStickHolding);
PANRIGHT.addEventListener('mouseup', onJoyStickRelease);
PANRIGHT.addEventListener('mouseleave', onJoyStickRelease);
PANRIGHT.addEventListener('touchend', onJoyStickRelease);
PANRIGHT.addEventListener('touchcancel', onJoyStickRelease);
PANRIGHT.addEventListener('touchstart', (e) => {
    e.preventDefault(); /* Prevents default behavior (like scrolling) */
    onJoyStickHolding("RIGHT");
});

TILTDOWN.addEventListener('mousedown', onJoyStickHolding);
TILTDOWN.addEventListener('mouseup', onJoyStickRelease);
TILTDOWN.addEventListener('mouseleave', onJoyStickRelease);
TILTDOWN.addEventListener('touchend', onJoyStickRelease);
TILTDOWN.addEventListener('touchcancel', onJoyStickRelease);
TILTDOWN.addEventListener('touchstart', (e) => {
    e.preventDefault(); /* Prevents default behavior (like scrolling) */
    onJoyStickHolding("DOWN");
});
