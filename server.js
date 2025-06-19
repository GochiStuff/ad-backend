import express from "express";
import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import { Stat } from "./model/stats.model.js";
import { connectDB } from "./db/mongodb.js";


function generateCode(){
    return nanoid(6).toUpperCase();
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://airdelivery.site"],
    methods: ["GET", "POST"],
    credentials: true
  }
});


const namePool = [
  // Pokémon-inspired
  "Pika", "Zard", "Eevee", "Magi", "Snorlax",
  "Ditto", "Mew", "Lucar", "Goomy", "Toge",
  "Gren", "Chomp", "Infern", "Bidoof", "Sylv",
  "Scorb", "Quag", "Zoroa", "Sable", "Piplup",

  // Anime-inspired (from Naruto, DBZ, One Piece, etc.)
  "Luffy", "Zoro", "Goku", "Vegeta", "Itachi",
  "Kakashi", "Sasuke", "Levi", "Eren", "Nami",
  "Killua", "Gon", "Gojo", "Tanji", "Nezuko",
  "Baki", "Yugi", "Natsu", "Shoto", "Lain"
];


function getRandomName() {
  const i = Math.floor(Math.random() * namePool.length);
  return namePool[i];
}

function getIpPrefix(socket) {
  const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const ipv4 = ip.includes("::ffff:") ? ip.split("::ffff:")[1] : ip;
  return ipv4?.split(".")?.slice(0, 3)?.join(".");
}



// { ownerId: socketId, members: [socketId] }
const flights = new Map();
// socketid -> { name, ipPrefix, inFlight: boolean }
const nearByUsers = new Map();


function broadcastNearbyUsers(socket) {
    const user = nearByUsers.get(socket.id);
    if (!user) return;

    const users = Array.from(nearByUsers.entries())
        .filter(([id, data]) =>
            data.ipPrefix === user.ipPrefix &&
            id !== socket.id &&
            !data.inFlight
        )
        .map(([id, data]) => ({ id, name: data.name }));

    socket.emit("nearbyUsers", users);
}
function broadcastUsers(flightCode) {
    const flight = flights.get(flightCode);
    if (!flight) return;

    io.to(flightCode).emit("flightUsers", { 
        ownerId: flight.ownerId,
        members: flight.members.map(id => ({
            id,
            name: nearByUsers.get(id)?.name || "Unknown"
        })),
        ownerConnected: flight.ownerConnected
    });
}

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

io.on("connection", (socket) => {

    const name = getRandomName();
    const ipPrefix = getIpPrefix(socket);


    nearByUsers.set(socket.id, { name, ipPrefix, inFlight: false });

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

        const user = nearByUsers.get(socket.id);
        if (user) {
            user.inFlight = true;
            nearByUsers.set(socket.id, user);
        }

        Stat.updateOne(
        { date: { $gte: new Date().setHours(0,0,0,0) } },
        { $inc: { totalFlights: 1 } },
        { upsert: true }
        ).exec();
        socket.join(code);
        callback({code});

        broadcastUsers(code);
    });

    socket.on("feedback" , ( payload) => { 
        
    });

    socket.on("requestToConnect", (targetId, callback) => {
    if (!io.sockets.sockets.has(targetId)) {
        callback({ success: false, message: "User not found or offline" });
        return;
    }

    let code;
    do {
        code = generateCode();
    } while (flights.has(code));

    // Create a flight between this socket and targetId
    flights.set(code, {
        ownerId: socket.id,
        members: [socket.id, targetId],
        ownerConnected: true,
        disconnectTimeout: null,
    });

    socket.join(code);
    io.to(targetId).socketsJoin(code);

    // Inform both clients about the room code and participants
    const senderName = nearByUsers.get(socket.id)?.name || "Unknown";
    const receiverName = nearByUsers.get(targetId)?.name || "Unknown";

    io.to(code).emit("flightStarted", {
        code,
        members: [
            { id: socket.id, name: senderName },
            { id: targetId, name: receiverName },
        ],
    });

    callback({ success: true, code });
});


    socket.on("inviteToFlight", ({ targetId, flightCode }, callback) => {
    const flight = flights.get(flightCode);
    if (!flight) {
        callback?.({ success: false, message: "Flight not found" });
        return;
    }

    if (!flight.members.includes(socket.id)) {
        callback?.({ success: false, message: "You are not part of this flight" });
        return;
    }

    if (!io.sockets.sockets.has(targetId)) {
        callback?.({ success: false, message: "Target user not connected" });
        return;
    }


    // Notify the invited user to go to the flight page
    const inviterName = nearByUsers.get(socket.id)?.name || "Someone";

    io.to(targetId).emit("invitedToFlight", {
        flightCode,
        fromId: socket.id,
        fromName: inviterName,
    });

    callback?.({ success: true });
});



    socket.on("getNearbyUsers", () => {
        broadcastNearbyUsers(socket);
    });
    socket.on("joinFlight", (code , callback) => {
        if (flights.has(code)) {
            const flight = flights.get(code);

            if (flight.members.length >= 2) {
                callback({ success: false, message: "Flight is full" });
                return;
            }


            socket.join(code);
            if(flight.ownerId !== socket.id){
                flight.members.push(socket.id);
                socket.emit("offer" , flight.ownerId ,  {sdp: flight.sdp});
            }

            const user = nearByUsers.get(socket.id);
            if (user) {
                user.inFlight = true;
                nearByUsers.set(socket.id, user);
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

        nearByUsers.delete(socket.id);
    

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

    socket.emit("yourName" , {id : socket.id , name });
});


// TODO 
// Periodic cleanups + use lastseen time stamps . 


setInterval(() => {
  for (const [code, flight] of flights.entries()) {
    const inactiveTooLong = flight.members.length === 0 || !flight.ownerConnected;
    if (inactiveTooLong) {
      flights.delete(code);
      console.log(`[CLEANUP] Removed inactive flight: ${code}`);
    }
  }
}, 120 * 1000); // every 120 seconds




server.listen(5500 , async() => {
    try {
    await connectDB()
    console.log(` Server running on port 5500`)
  } catch (err) {
    console.error(' DB connection failed:', err.message)
    process.exit(1)
  }
});
