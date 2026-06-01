import { Router } from 'express';
import { sendChatbotMessage } from '../controllers/chatbot.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.middleware.js';
const router = Router();
const chatbotRateLimiter = createRateLimitMiddleware({
    keyPrefix: 'chatbot-message',
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many chatbot messages. Please try again later.',
});
router.post('/message', authMiddleware, chatbotRateLimiter, sendChatbotMessage);
export default router;
//# sourceMappingURL=chatbot.routes.js.map