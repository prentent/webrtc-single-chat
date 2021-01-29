"use strict";

var myHostname = "localhost";

var connectButton = null;
var disconnectButton = null;
var sendButton = null;
var messageInputBox = null;
var receiveBox = null;

var connection = null;
var localConnection = null;

var sendChannel = null;
var receiveChannel = null;
var clientID = Date.now();
var localname = "";
var otherClientID = null;
var otherClientIDCopy = null;
var otherUsername = null;

function sendToServer(msg) {
    var msgJSON = JSON.stringify(msg);
    console.log("----Sending '", localname, clientID, otherUsername, otherClientID, otherClientIDCopy);
    console.log("----Sending '" + msg.type + "' message: " + msgJSON);
    connection.send(msgJSON);
}

//连接socket服务器
function connectPeers() {
    // 打开一个 web socket
    connection = new WebSocket("ws://" + myHostname + ":8080", 'json');
    connection.onopen = function () {
        // Web Socket 已连接上，使用 send() 方法发送数据
        if (connection.readyState === connection.OPEN) {
            console.log("已连接上...");
        }
    };
    connection.onmessage = function (evt) {
        var msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "id":
                clientID = msg.id;
                sendToServer({
                    type: "username",
                    clientID: clientID,
                    username: localname
                });
                break;
            case "userlist":
                creatUserlistMsg(msg);
                break;
            case "data-offer":  // Invitation and offer to chat
                console.log("-----------------data-offer");
                handleDataOfferMsg(msg);
                break;

            case "data-answer":  // Callee has answered our offer
                console.log("-----------------data-answer");
                handleDataAnswerMsg(msg);
                break;

            case "new-ice-candidate": // A new ICE candidate has been received
                console.log("-------------new-ice-candidate");
                handleNewICECandidateMsg(msg);
                break;

        }
    };
    connection.onclose = function () {
        console.log("链接已关闭...");
    };
}

//创建RTCPeerConnection
function createPeerConnection() {
    console.log("Setting up a connection...");
    localConnection = new RTCPeerConnection({
        iceServers: [
            {
                urls: "turn:" + myHostname,  // 一个TURN服务器
                username: "webrtc",
                credential: "turnserver"
            }
        ]
    });
    localConnection.onicecandidate = handleICECandidateEvent;
    localConnection.onnegotiationneeded = handleNegotiationNeededEvent;

    sendChannel = localConnection.createDataChannel("sendChannel");
    sendChannel.onopen = event => {
        console.log("--------send---onopen")
        messageInputBox.disabled = false;
        messageInputBox.focus();
        sendButton.disabled = false;
        disconnectButton.disabled = false;
        connectButton.disabled = true;
    };
    sendChannel.onclose = event => {
        console.log("--------send---onclose")
        disconnectPeers();
    };
    sendChannel.onerror = err => console.log(err);

    localConnection.ondatachannel = event => {
        receiveChannel = event.channel;
        receiveChannel.onmessage = event => {
            var el = document.createElement("p");
            var txtNode = document.createTextNode(event.data);
            el.appendChild(txtNode);
            receiveBox.appendChild(el);
        };
        receiveChannel.onopen = event => console.log("*** receive：", receiveChannel.readyState);
        receiveChannel.onclose = event => {
            console.log("*** receive：", receiveChannel.readyState);
            disconnectPeers();
        };
        receiveChannel.onerror = err => console.log(err);
    };
}


function handleICECandidateEvent(event) {
    if (event.candidate) {
        console.log("*** Outgoing ICE candidate: " + event.candidate.candidate);
        sendToServer({
            type: "new-ice-candidate",
            offerId: clientID,
            anserId: otherClientID,
            candidate: event.candidate
        });
    }
}

function creatUserlistMsg(msg) {
    var listElem = document.querySelector(".left-item");

    //删除已有的列表
    while (listElem.firstChild) {
        listElem.removeChild(listElem.firstChild);
    }

    // 添加所有用户
    msg.users.forEach(function (node) {
        var item = document.createElement("li");
        item.setAttribute("clientID", node.clientID);
        item.appendChild(document.createTextNode(node.username));
        item.addEventListener("click", invite, false);
        listElem.appendChild(item);
    });
}

function invite(event) {
    otherUsername = event.target.textContent;
    otherClientID = event.target.getAttribute("clientID");
    if (!connectButton.disabled) {
        alert("未连接服务器");
    } else if (localConnection) {
        alert("你暂时不能连接，因为你已经有一个连接了!");
    } else if (otherClientID == clientID) {
        alert("不能向自己发消息");
    }
    else {
        createPeerConnection();
    }
}

//呼叫初始化
async function handleNegotiationNeededEvent() {
    console.log("*** Negotiation");
    if (!otherClientID && (otherClientIDCopy == otherClientID)) {
        return;
    }
    try {
        otherClientIDCopy = otherClientID;
        console.log("---> 创建 offer");
        const offer = await localConnection.createOffer();

        console.log("---> 改变与连接相关的本地描述");
        await localConnection.setLocalDescription(offer);

        console.log("---> 发送这个本地描述到到远端用户");
        console.log(clientID, otherClientID);
        sendToServer({
            type: "data-offer",
            offerId: clientID,
            anserId: otherClientID,
            sdp: localConnection.localDescription
        });
    } catch (err) {
        console.error(err);
    };
}

//呼叫回答
async function handleDataOfferMsg(msg) {
    console.log("Received data chat offer from " + msg.username);
    if (!localConnection) {
        createPeerConnection();
    }

    var desc = new RTCSessionDescription(msg.sdp);

    console.log("  - Setting remote description");
    await localConnection.setRemoteDescription(desc);
    console.log("---> Creating and sending answer to caller");

    await localConnection.setLocalDescription(await localConnection.createAnswer());

    sendToServer({
        type: "data-answer",
        offerId: msg.anserId,
        anserId: msg.offerId,
        sdp: localConnection.localDescription
    });
}

// 通信接收者已经接听了我们的通信
async function handleDataAnswerMsg(msg) {
    console.log("*** 通信接收者已经接听了我们的通信");
    try {
        var desc = new RTCSessionDescription(msg.sdp);
        await localConnection.setRemoteDescription(desc).catch(function (err) { console.log(err); });
    } catch (err) {
        console.error(err);
    }
}

//接受者的 ICE 候选地址信息
async function handleNewICECandidateMsg(msg) {
    var candidate = new RTCIceCandidate(msg.candidate);
    console.log("*** 添加接受者的 ICE 候选地址信息： " + JSON.stringify(candidate));
    try {
        await localConnection.addIceCandidate(candidate)
    } catch (err) {
        console.error(err);
    }
}

function sendMessage() {
    console.log(clientID, localname);
    var message = messageInputBox.value;
    sendChannel.send(message);

    messageInputBox.value = "";
    messageInputBox.focus();
}

//关闭连接
function disconnectPeers() {
    if (sendChannel) {
        sendChannel.onopen = null;
        sendChannel.onclose = null;
        sendChannel.close();
        sendChannel = null;
    }
    if (receiveChannel) {
        receiveChannel.onmessage = null;
        receiveChannel.onopen = null;
        receiveChannel.onclose = null;
        receiveChannel.close();
        receiveChannel = null;
    }
    if (localConnection) {
        localConnection.onicecandidate = null;
        localConnection.onnegotiationneeded = null;
        localConnection.ondatachannel = null;
        localConnection.close();
        localConnection = null;
    }
    if (connection) {
        connection.close();
        connection = null;
    }

    connectButton.disabled = false;
    disconnectButton.disabled = true;
    sendButton.disabled = true;

    messageInputBox.value = "";
    messageInputBox.disabled = true;
}


window.addEventListener('load', function () {
    connectButton = document.getElementById('connectButton');
    disconnectButton = document.getElementById('disconnectButton');
    sendButton = document.getElementById('sendButton');
    messageInputBox = document.getElementById('message');
    receiveBox = document.getElementById('receiveBox');

    connectButton.addEventListener('click', confirmUsername, false);
    disconnectButton.addEventListener('click', disconnectPeers, false);
    sendButton.addEventListener('click', sendMessage, false);
}, false);

window.addEventListener('unload', function () {
    disconnectPeers();
}, false);

//创建当前账户
function confirmUsername() {
    var _username = document.getElementById('username').value;
    if (!_username) {
        alert("用户名不能为空！");
    }
    localname = _username;
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    connectPeers();
}