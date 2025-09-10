import { Server } from "socket.io";
import { FlightManager } from "./FileManage.js";
import { ConnectionHandler } from "../handler/ConnectionHandle.js";
import { getRandomName } from "../utils/names.js";
import Peer from "../peer.js";
import { CORS_ORIGIN, NODE_ENV } from "../config/index.js";

export class SocketManager {
    constructor(httpServer) {
        this.flightManager = new FlightManager();
        this.io = new Server(httpServer, {
            cors: {
                origin: CORS_ORIGIN,
                methods: ["GET", "POST"],
                credentials: true,
            },
        });
        
        console.log("Socket.IO Manager initialized.");
        console.log(`CORS Origins allowed: ${CORS_ORIGIN.join(', ')}`);
    }

    initialize() {
        this.flightManager.startCleanupInterval();
        
        this.io.on("connection", (socket) => {
            this.handleConnection(socket);
        });
    }

    handleConnection(socket) {
        const name = getRandomName();
        // The Peer class needs the request object, available on the socket handshake
        const peer = new Peer(socket, socket.request, { debug: NODE_ENV === "development" });

        console.log(`New connection: ${socket.id} with name ${name} from IP ${peer.ip}`);

        this.flightManager.addUser(socket.id, {
            name,
            ipPrefix: peer.ipPrefix,
            isPrivate: peer.isPrivate,
            ip: peer.ip,
        });

        socket.emit("yourDetails", { id: socket.id, name });

        // Each connection gets its own handler instance
        new ConnectionHandler(this.io, socket, this.flightManager);
    }
}