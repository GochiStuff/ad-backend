import express from "express";
import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import { Stat } from "./model/stats.model.js";
import { connectDB } from "./db/mongodb.js";
import feedbackRoute from "./routes/feedback.route.js";
import cors from "cors";

function generateCode() {
    return nanoid(6).toUpperCase();
}

const app = express();
app.use(express.json());
const server = http.createServer(app);
app.use(cors({
  origin: ["https://airdelivery.site", "http://localhost:3000"],
  methods: ["GET", "POST"],
  credentials: true
}));





const io = new Server(server, {
    cors: {
        origin: ["https://airdelivery.site", "http://localhost:3000" , ""],
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




// { ownerId: socketId, members: [socketId] }
const flights = new Map();
// socketid -> { name, ipPrefix, inFlight: boolean }
const nearByUsers = new Map();

// const joinRequest = new Map(); not need as for now I only allow connection to be made by near by .

function broadcastNearbyUsers(socket) {
  const user = nearByUsers.get(socket.id);
  if (!user) return;

  const userPrefixes = Array.from(user.ipPrefixes);

  const nearby = Array.from(nearByUsers.entries())
    .filter(([id, data]) => 
      id !== socket.id &&
      !data.inFlight &&
      data.ipPrefixes &&
      data.ipPrefixes.size > 0 &&
      Array.from(data.ipPrefixes).some(prefix => userPrefixes.includes(prefix))
    )
    .map(([id, data]) => ({ id, name: data.name }));
  socket.emit("nearbyUsers", nearby);
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

// rest . 
app.use("/api/v1/feedback" ,feedbackRoute);
app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

io.on("connection", (socket) => {

    const name = getRandomName();
 

    nearByUsers.set(socket.id, { name, ipPrefixes: new Set(),  inFlight: false });

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
            { date: { $gte: new Date().setHours(0, 0, 0, 0) } },
            { $inc: { totalFlights: 1 } },
            { upsert: true }
        ).exec();
        socket.join(code);
        callback({ code });

        broadcastUsers(code);
    });

    socket.on("updateStats", ({ filesShared, Transferred }) => {


    // Data recived in MB 
    Stat.updateOne(
        { date: { $gte: new Date().setHours(0, 0, 0, 0) } },
        {
        $inc: {
            totalFilesShared: filesShared || 0,
            totalMBTransferred: Transferred || 0,
        },
        },
        { upsert: true }
    ).exec();
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

    
    socket.on("registerLocalIp", ({ localIP }) => {
    const user = nearByUsers.get(socket.id);
    if (user && typeof localIP === "string") {
            const prefix = localIP.split(".").slice(0, 3).join(".");
            
            // Replace old prefixes with only the current one
            user.ipPrefixes = new Set([prefix]);
            
            nearByUsers.set(socket.id, user);

        }
    });




    socket.on("getNearbyUsers", () => {
        broadcastNearbyUsers(socket);
    });
    socket.on("joinFlight", (code, callback) => {
        if (flights.has(code)) {
            const flight = flights.get(code);

            if (flight.members.length >= 2) {
                callback({ success: false, message: "Flight is full" });
                return;
            }


            socket.join(code);
            if (flight.ownerId !== socket.id) {
                flight.members.push(socket.id);
                socket.emit("offer", flight.ownerId, { sdp: flight.sdp });
            }

            const user = nearByUsers.get(socket.id);
            if (user) {
                user.inFlight = true;
                nearByUsers.set(socket.id, user);
            }


            callback({ success: true });
            broadcastUsers(code);
        } else {
            callback({ success: false, message: "flight not found" });
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

    socket.on("leaveFlight", () => {
  const user = nearByUsers.get(socket.id);
  if (user) {
    user.inFlight = false;
    nearByUsers.set(socket.id, user);
  }

  let flightCodeToDelete  = "";

  for (const [code, flight] of flights.entries()) {
    if (flight.ownerId === socket.id) {
      flight.ownerConnected = false;
      broadcastUsers(code);
      flightCodeToDelete = code;
      break;
    } else {
      const wasMember = flight.members.includes(socket.id);
      flight.members = flight.members.filter(id => id !== socket.id);
      if (wasMember) {
        broadcastUsers(code);
        break;
      }
    }
  }

  if (flightCodeToDelete) {
    flights.delete(flightCodeToDelete);
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

    socket.emit("yourName", { id: socket.id, name });
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




server.listen(5500, async () => {
    try {
        await connectDB()
        console.log(` Server running on port 5500`)
    } catch (err) {
        console.error(' DB connection failed:', err.message)
        process.exit(1)
    }
});
