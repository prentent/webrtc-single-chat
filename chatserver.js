//#!/usr/bin/env node
"use strict";

var WebSocketServer = require('websocket').server;
var http = require('http');
var nextID = Date.now();
var connectionArr = []

var server = http.createServer(function (request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(8080, function () {
    console.log((new Date()) + ' Server is listening on port 8080');
});

var wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

//不设置限制
function originIsAllowed(origin) {
    return true;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    var connection = request.accept('json', request.origin);
    console.log((new Date()) + ' Connection accepted.');
    connection.clientID = nextID;
    nextID++;
    connectionArr.push(connection);

    //把当前连接ID发往客户端
    var msg = {
        type: "id",
        id: connection.clientID
    };
    connection.sendUTF(JSON.stringify(msg));

    connection.on('message', function (message) {
        console.log(connectionArr.length);
        var obj = JSON.parse(message.utf8Data);
        switch (obj.type) {
            case "username": //新用户
                connection.username = obj.username;
                sendToAllListUser();
                break;
            default: //其他所有信息只往单个用户发送
                let con = connectionArr.find(f => f.clientID == obj.anserId);
                if (con) {
                    con.sendUTF(message.utf8Data);
                }
                break;
        }
    });
    connection.on('close', function (reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
        connectionArr = connectionArr.filter(el => el.connected);
    });
});

function sendToAllListUser() {
    var userlist = connectionArr.map(m => {
        return { clientID: m.clientID, username: m.username };
    });
    connectionArr.forEach(con => {
        con.sendUTF(JSON.stringify({
            type: "userlist",
            users: userlist
        }));
    });
}