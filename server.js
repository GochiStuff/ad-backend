import express from "express";
import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";

function generateCode(){
    return nanoid(6).toUpperCase();
}

const app = express();
const server = http.createServer(app);
const io = new Server(server , {cors : {origin : "*"}});

// { ownerId: socketId, members: [socketId] }
const flights = new Map();

function broadcastUsers(flightCode) {
    const flight = flights.get(flightCode);
    if (!flight) return;

    io.to(flightCode).emit("flightUsers", { 
        ownerId: flight.ownerId, 
        members: flight.members,
        ownerConnected: flight.ownerConnected
    });
}

io.on("connection", (socket) => {

    socket.on("createFlight", (callback) => {
        let code;
        do {
            code = generateCode();
        } while (flights.has(code));

        flights.set(code, { 
            ownerId: socket.id, 
            members: [socket.id],
            ownerConnected: true,
            disconnectTimeout: null,
        });

        socket.join(code);
        callback({code});

        broadcastUsers(code);
    });

    socket.on("joinFlight", (code , callback) => {
        if (flights.has(code)) {
            const flight = flights.get(code);

            socket.join(code);
            if(flight.ownerId !== socket.id){
                flight.members.push(socket.id);
                socket.emit("offer" , flight.ownerId ,  {sdp: flight.sdp});
            }
            
            callback({success: true});  
            broadcastUsers(code);
        } else {
            callback({success: false , message: "flight not found"});
        }
    });
    socket.on("offer", (code, sdp) => {
        const flight = flights.get(code);
        if (!flight) {
            console.error(`No flight found for code: ${code}`);
            return;
        }
        flight.sdp = sdp; 

    });
    socket.on("answer", (code, { sdp }) => {
        const flight = flights.get(code);
        if (flight && io.sockets.sockets.get(flight.ownerId)) {
            io.to(flight.ownerId).emit("answer", { from: socket.id, sdp });
        }
    });

    socket.on("ice-candidate", (payload) => {
        if (payload && payload.id && payload.candidate) {
            io.to(payload.id).emit("ice-candidate", { from: socket.id, candidate: payload.candidate });
        }
    });

    socket.on("disconnect", () => {
        for (const [code, flight] of flights.entries()) {

            if (flight.ownerId === socket.id) {
                
                flight.ownerConnected = false;
                broadcastUsers(code);
                flights.delete(code);
            } else {
                
                flight.members = flight.members.filter(id => id !== socket.id);
                broadcastUsers(code);
            }
        }
    });

});



server.listen(4000 , () => console.log("Websocket is up on port 4000"));
