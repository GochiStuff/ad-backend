import express from "express"
import { submitFeedback } from "../controllers/feedback.controller.js"
import { feedbackRateLimiter } from "../middleware/rl/feedback.ratelimit.js";

const feedbackRoute = express.Router();

feedbackRoute.post('/', feedbackRateLimiter, submitFeedback);

export default feedbackRoute;