import { DB_URI , CORS_ORIGIN, NODE_ENV, PORT } from "./config/index.js";
import express from "express";
import http from "http";
import cors from "cors";
import { connectDB } from "./db/mongodb.js";
import { SocketManager } from "./services/Socket.js";
import feedbackRoute from "./routes/feedback.route.js";

// --- Initialization ---
const app = express();
const server = http.createServer(app);

// --- Middleware ---
app.use(express.json());
app.use(cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
}));

// --- API Routes ---
app.use("/api/v1/feedback", feedbackRoute);
app.get("/api/v1/health", (req, res) => res.status(200).send("OK"));

// --- Start Server ---
const startServer = async () => {
    try {
        await connectDB(DB_URI);
        console.log("MongoDB connected successfully.");

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            
            // Initialize Socket.IO after server is listening
            const socketManager = new SocketManager(server);
            socketManager.initialize();
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();

// --- Graceful Shutdown ---
const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
        console.log('HTTP server closed.');
        // Add DB disconnection logic if your `connectDB` returns a client
        process.exit(0);
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));