const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const express = require('express');
require('dotenv').config({ path: '../../projekt1_node/node_app/.env' });

const port = process.env.PORT || 8080;
const app = express();
const server = app.listen(port, () => { // Use process.env.PORT
    console.log(`Server running on port ${port}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ server });
const SECRET_KEY = process.env.SECRET_KEY;

// WebSocket connections
const clients = {}
const boardClients = {}

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const token = urlParams.get('access_token');
    const username = urlParams.get('user');

    console.log("WebSocket connection opened");

    // Verifierar token
    jwt.verify(token, SECRET_KEY, (err) => {
        if (err) {
            console.error('JWT verification failed:', err);
            ws.close(); 
            return;
        }

        clients[username] = ws;
        ws.username = username; 

        updateGlobalUserList();

        // Tar emot meddelanden till servern och skickar ut dem till användarna
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                const username = ws.username;
        
                if (data.action === 'connectBoard') {
                    const boardId = data.id;
                    console.log(`User ${username} selected board: ${boardId}`);

                    if (!boardClients[boardId]) {
                        boardClients[boardId] = new Set(); 
                    }
                    boardClients[boardId].add(username);

                    // Tar bort användarna från tidigare boards
                    for (const id in boardClients) {
                        if (boardClients[id].has(username)) {
                            boardClients[id].delete(username);
                            notifyUserLeft(id, username);
                        }
                    }

                    // Lägger till användaren till den nya borden och meddelar till alla andra användare
                    boardClients[boardId].add(username);
                    notifyUserJoined(boardId, username);
                }

                if (data.action === 'updateTitle') {
                    const noteId = data.id;
                    const updatedTitle = data.title;
                    const boardId = data.boardId;
                    updateStickyTitle(noteId, updatedTitle, boardId, username);
                }

                if (data.action === 'updatePosition') {
                    const noteId = data.id;
                    const positionX = data.positionX;
                    const positionY = data.positionY;
                    const boardId = data.boardId;
                    updateStickyPosition(noteId, positionX, positionY, boardId, username);
                }

                if (data.action === 'updateContent') {
                    const noteId = data.id;
                    const updatedContent = data.content;
                    const boardId = data.boardId;
                    updateStickyContent(noteId, updatedContent, boardId, username)
                }

                if (data.action === 'editDimensions') {
                    const noteId = data.id;
                    const width = data.width;
                    const height = data.height;
                    const boardId = data.boardId;
                    updateStickyDimensions(noteId, width, height, boardId, username)
                }

                if (data.action === 'createNote') {
                    const boardId = data.boardId;
                    createSticky(boardId, username);
                }

                if (data.action === 'deleteNote') {
                    const noteId = data.id;
                    const boardId = data.boardId;
                    deleteSticky(noteId, boardId, username);
                }

                if (data.action === 'deleteBoard') {
                    const boardId = data.id;
                    deleteBoard(boardId, username);
                }

                if (data.action === 'createBoard') {
                    createBoard(username);
                }
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        });

        // När WebSocket connection stängs
        ws.on('close', () => {
            console.log(`Connection closed for user: ${username}`);
            delete clients[username]; // Tar bort användaren från den globala listan

            // Tar bort användaren från alla boards den var connected till
            for (const boardId in boardClients) {
                if (boardClients[boardId].has(username)) {
                    boardClients[boardId].delete(username); 
                    notifyUserLeft(boardId, username);
                }

                if (boardClients[boardId].size === 0) {
                    delete boardClients[boardId];
                }
            }
            updateGlobalUserList();
        });
    });
});

// Funktioner som skickar meddelanden till alla connected användare om ändringar som hänt
function updateStickyTitle(noteId, title, boardId, exludeUser) {
    const message = {
        action: 'updateTitle',
        title: title,
        id: noteId,
    }
    broadcastToBoard(boardId, message, exludeUser);
}

function updateStickyPosition(noteId, positionX, positionY, boardId, exludeUser) {
    const message = {
        action: 'updatePosition',
        positionX: positionX,
        positionY: positionY,
        id: noteId,
    }
    broadcastToBoard(boardId, message, exludeUser);
}

function updateStickyContent(noteId, updatedContent, boardId, exludeUser) {
    const message = {
        action: 'updateContent',
        content: updatedContent,
        id: noteId,
    }
    broadcastToBoard(boardId, message, exludeUser);
}

function updateStickyDimensions(noteId, width, height, boardId, excludeUser) {
    const message = {
        action: 'editDimensions',
        width: width,
        height: height,
        id: noteId
    }
    broadcastToBoard(boardId, message, excludeUser);
}

function createSticky(boardId, exludeUser) {
    const message = {
        action: 'createNote',
        boardId: boardId
    }
    broadcastToBoard(boardId, message, exludeUser);
}

function deleteSticky(noteId, boardId, exludeUser) {
    const message = {
        action: 'deleteNote',
        id: noteId,
        boardId: boardId
    }
    broadcastToBoard(boardId, message, exludeUser);
}

function deleteBoard(boardId, exludeUser) {
    const message = {
        action: 'deleteBoard',
        boardId: boardId
    }
    broadcastGlobally(message, exludeUser);
}

function createBoard(excludeUser) {
    const message = {
        action: 'createBoard',
    }
    broadcastGlobally(message, excludeUser);
}

function broadcastToBoard(boardId, message, exludeUser) {
    for (const clientUsername of boardClients[boardId]) {
        if (clientUsername !== exludeUser) {
            const clientWs = clients[clientUsername];
            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(message));
            }
        }
    }
}

function broadcastGlobally(message, excludeUsername) {
    for (const clientUsername in clients) {
        if (clientUsername !== excludeUsername) {
            const clientWs = clients[clientUsername];
            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(message));
            }
        }
    }
}

function updateGlobalUserList() {
    const usersGlobally = Object.keys(clients);
    const message = {
        action: 'globalUserListUpdate',
        users: usersGlobally 
    };
    broadcastGlobally(message);
}

function notifyUserJoined(boardId, username) {
    const usersOnBoard = Array.from(boardClients[boardId] || []);
    const message = {
        action: 'userJoined',
        message: `${username} has joined the board: ${boardId}`,
        users: usersOnBoard,
    }
    broadcastToBoard(boardId, message);
}

function notifyUserLeft(boardId, username) {
    const usersOnBoard = Array.from(boardClients[boardId] || []);
    const message = {
        action: 'userLeft',
        message: `${username} has left the board: ${boardId}`,
        users: usersOnBoard
    }
    broadcastToBoard(boardId, message);
}