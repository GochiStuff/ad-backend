export class FlightManager {
    constructor() {
        // flightCode -> { ownerId, members: Set<socketId>, ownerConnected, sdp }
        this.flights = new Map();
        // socketId -> { name, ipPrefix, isPrivate, ip, inFlight: boolean }
        this.users = new Map();
    }

    addUser(socketId, userData) {
        this.users.set(socketId, { ...userData, inFlight: false });
    }

    removeUser(socketId) {
        this.users.delete(socketId);
    }

    getUser(socketId) {
        return this.users.get(socketId);
    }

    createFlight(flightCode, ownerId) {
        this.flights.set(flightCode, {
            ownerId,
            members: new Set([ownerId]),
            ownerConnected: true,
            sdp: null,
        });
        const user = this.getUser(ownerId);
        if (user) user.inFlight = true;
    }

    joinFlight(flightCode, socketId) {
        const flight = this.flights.get(flightCode);
        if (!flight || flight.members.size >= 2) {
            return false; // Flight not found or is full
        }

        flight.members.add(socketId);
        const user = this.getUser(socketId);
        if (user) user.inFlight = true;
        
        return true;
    }

    leaveFlight(socketId) {
        let affectedFlightCode = null;

        for (const [code, flight] of this.flights.entries()) {
            if (flight.members.has(socketId)) {
                affectedFlightCode = code;
                if (flight.ownerId === socketId) {
                    // Owner left, dissolve the flight
                    this.flights.delete(code);
                } else {
                    // A member left
                    flight.members.delete(socketId);
                }
                break;
            }
        }
        
        const user = this.getUser(socketId);
        if (user) user.inFlight = false;
        
        return affectedFlightCode;
    }

    getFlight(code) {
        const flight = this.flights.get(code);
        if (!flight) return null;

        return {
            ownerId: flight.ownerId,
            members: Array.from(flight.members).map(id => ({
                id,
                name: this.users.get(id)?.name || "Unknown"
            })),
            ownerConnected: flight.ownerConnected,
        };
    }
    
    // This LAN discovery logic is a heuristic and may not work in all network
    // configurations (e.g., behind CGNAT, complex corporate networks  !! NOT WORKING IN MY COLLEGE NETWORK ).
    // It relies on comparing IP address prefixes.
    getNearbyUsers(socketId) {
        const currentUser = this.users.get(socketId);
        if (!currentUser || !currentUser.ipPrefix) return [];

        const nearby = [];
        for (const [id, user] of this.users.entries()) {
            if (id === socketId || user.inFlight || !user.ipPrefix) {
                continue;
            }

            const isSamePrivateNetwork = currentUser.isPrivate && user.isPrivate && user.ipPrefix === currentUser.ipPrefix;
            const isSamePublicNetwork = !currentUser.isPrivate && !user.isPrivate && user.ipPrefix === currentUser.ipPrefix;

            if (isSamePrivateNetwork || isSamePublicNetwork) {
                nearby.push({ id, name: user.name });
            }
        }
        return nearby;
    }

    startCleanupInterval() {
        setInterval(() => {
            for (const [code, flight] of this.flights.entries()) {
                // Remove flight if owner is disconnected or no members are left
                const ownerExists = this.users.has(flight.ownerId);
                if (!ownerExists || flight.members.size === 0) {
                    this.flights.delete(code);
                    console.log(`[CLEANUP] Removed inactive flight: ${code}`);
                }
            }
        }, 120 * 1000); // every 2 minutes
    }
}