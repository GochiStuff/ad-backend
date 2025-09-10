// src/handlers/ConnectionHandler.js
import { Stat } from "../model/stats.model.js";
import { generateCode } from "../utils/code.js";

export class ConnectionHandler {
    constructor(io, socket, flightManager) {
        this.io = io;
        this.socket = socket;
        this.flightManager = flightManager;
        
        this.socket.on("createFlight", this.createFlight.bind(this));
        this.socket.on("joinFlight", this.joinFlight.bind(this));
        this.socket.on("leaveFlight", this.handleLeaveOrDisconnect.bind(this));
        this.socket.on("getNearbyUsers", this.getNearbyUsers.bind(this));
        this.socket.on("offer", this.handleOffer.bind(this));
        this.socket.on("answer", this.handleAnswer.bind(this));
        this.socket.on("ice-candidate", this.handleIceCandidate.bind(this));
        this.socket.on("updateStats", this.updateStats.bind(this));
        this.socket.on("disconnect", this.handleLeaveOrDisconnect.bind(this));
    }

    // --- Event Handlers ---

    createFlight(callback) {
        const code = generateCode();
        this.flightManager.createFlight(code, this.socket.id);
        this.socket.join(code);
        
        Stat.updateOne(
            { date: { $gte: new Date().setHours(0, 0, 0, 0) } },
            { $inc: { totalFlights: 1 } },
            { upsert: true }
        ).exec();
        
        callback({ code });
        this.broadcastUsers(code);
    }
    
    joinFlight(code, callback) {
        const flight = this.flightManager.getFlight(code);
        if (!flight) {
            return callback({ success: false, message: "Flight not found" });
        }
        if (flight.members.length >= 2) {
            return callback({ success: false, message: "Flight is full" });
        }

        const success = this.flightManager.joinFlight(code, this.socket.id);
        if(success) {
            this.socket.join(code);
            // Re-fetch flight to get updated member list
            const updatedFlight = this.flightManager.getFlight(code);
            if(updatedFlight) {
                 this.socket.to(updatedFlight.ownerId).emit("offer-request", this.socket.id);
            }
            callback({ success: true });
            this.broadcastUsers(code);
        } else {
            callback({ success: false, message: "Could not join flight" });
        }
    }
    
    handleLeaveOrDisconnect() {
        const affectedFlightCode = this.flightManager.leaveFlight(this.socket.id);
        if (affectedFlightCode) {
            this.broadcastUsers(affectedFlightCode);
        }
        this.flightManager.removeUser(this.socket.id);
        console.log(`User disconnected: ${this.socket.id}`);
    }

    getNearbyUsers() {
        const nearby = this.flightManager.getNearbyUsers(this.socket.id);
        this.socket.emit("nearbyUsers", nearby);
    }

    handleOffer(payload) {
        this.io.to(payload.to).emit("offer", { from: this.socket.id, sdp: payload.sdp });
    }

    handleAnswer(payload) {
        this.io.to(payload.to).emit("answer", { from: this.socket.id, sdp: payload.sdp });
    }

    handleIceCandidate(payload) {
        this.io.to(payload.to).emit("ice-candidate", { from: this.socket.id, candidate: payload.candidate });
    }

    updateStats({ filesShared, Transferred }) {
        Stat.updateOne(
            { date: { $gte: new Date().setHours(0, 0, 0, 0) } },
            { $inc: { totalFilesShared: filesShared || 0, totalMBTransferred: Transferred || 0 } },
            { upsert: true }
        ).exec();
    }
    
    // --- Helper Methods ---

    broadcastUsers(flightCode) {
        const flightData = this.flightManager.getFlight(flightCode);
        if (flightData) {
            this.io.to(flightCode).emit("flightUsers", flightData);
        }
    }
}