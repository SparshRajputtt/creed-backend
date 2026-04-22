const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');
const { getChatContext } = require('../controllers/chatContextController');
const { optionalAuth } = require('../middleware/auth');

// GET /api/chat/context — fetch products, categories, coupons for chatbot
router.get('/context', getChatContext);

// POST /api/chat — send message to AI
// optionalAuth: works for guests too, but attaches user if logged in
router.post('/', optionalAuth, (req, res, next) => {
  // Attach userId from JWT if logged in
  if (req.user) {
    req.body.userId = req.user._id || req.user.id;
  }
  next();
}, handleChat);

module.exports = router;