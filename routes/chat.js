const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');

const Chat = require('../models/chat');
const authenticate = require('../middleware/authenticate');

// Fetch all chats for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'name profilePicture _id') // Populate participant details
      .sort({ lastMessageAt: -1 });

    const enhancedChats = chats.map((chat) => {
      const unreadCount = chat.messages.filter(
        (message) => !message.readBy.includes(userId)
      ).length;

      return { ...chat.toObject(), unreadCount };
    });

    res.status(200).json({ success: true, chats: enhancedChats });
  } catch (err) {
    console.error('Error fetching chats:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Fetch all messages for a specific chat
router.get('/messages/:chatId', authenticate, async (req, res) => {
  const { chatId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    return res.status(400).json({ success: false, error: 'Invalid chat ID.' });
  }

  try {
    const chat = await Chat.findById(chatId).populate('messages.sender', 'name profilePicture');
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found.' });
    }

    res.status(200).json({ success: true, messages: chat.messages });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create or fetch a chat
router.post('/start', authenticate, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Valid target user ID is required.' });
    }

    let chat = await Chat.findOne({
      participants: { $all: [userId, targetUserId] },
    });

    if (!chat) {
      chat = new Chat({
        participants: [userId, targetUserId],
        messages: [],
      });
      await chat.save();
    }

    res.status(200).json({ success: true, chat });
  } catch (err) {
    console.error('Error starting chat:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});




// Send a message in a chat
router.post('/:chatId/message', authenticate, async (req, res) => {
  const { chatId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    return res.status(400).json({ success: false, error: 'Invalid chat ID.' });
  }

  if (!content.trim()) {
    return res.status(400).json({ success: false, error: 'Message content cannot be empty.' });
  }

  try {
    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, participants: userId },
      {
        $push: { messages: { sender: userId, content } },
        $set: { lastMessageAt: Date.now() },
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found.' });
    }

    const newMessage = chat.messages[chat.messages.length - 1];

    res.status(200).json({ success: true, message: newMessage });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


module.exports = router;
