import { TODEBUG } from "../config/index.js";

const isDevelopment = TODEBUG ;

// ANSI Color Codes for terminal readability
const colors = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

const getTimestamp = () => new Date().toISOString();

/**
 * Base log function.
 * @param {string} level - 'debug', 'info', 'warn', 'error'
 * @param {string} color - ANSI color code
 * @param {string} context - The module or function name (e.g., 'Socket', 'createFlight')
 * @param {string} message - The log message
 * @param  {...any} args - Additional objects to log
 */
const log = (level, color, context, message, ...args) => {
    const timestamp = getTimestamp();
    const contextStr = context ? `[${context}]` : '';
    
    // Format the main message line
    const formattedMessage = `${colors.dim}${timestamp}${colors.reset} ${color}[${level.toUpperCase()}]${colors.reset} ${colors.cyan}${contextStr}${colors.reset} ${message}`;
    
    console.log(formattedMessage);
    
    // Print additional objects (like request bodies, errors) in a readable way
    if (args.length > 0) {
        args.forEach(arg => {
            console.dir(arg, { depth: null, colors: true });
        });
    }
};

export const logger = {
    /**
     * Logs verbose details only in 'development' mode.
     */
    debug: (context, message, ...args) => {
        if (isDevelopment) {
            log('debug', colors.magenta, context, message, ...args);
        }
    },
    /**
     * Logs informational messages (e.g., server start, task completion).
     */
    info: (context, message, ...args) => {
        log('info', colors.green, context, message, ...args);
    },
    /**
     * Logs warnings for non-critical issues (e.g., failed attempts, missing data).
     */
    warn: (context, message, ...args) => {
        log('warn', colors.yellow, context, message, ...args);
    },
    /**
     * Logs critical errors that require attention.
     */
    error: (context, message, error, ...args) => {
        // Pass the error object first for structured logging
        log('error', colors.red, context, message, error, ...args);
    },
};

export default logger;