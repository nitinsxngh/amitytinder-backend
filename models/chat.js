const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const chatSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    messages: [messageSchema],
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Update lastMessageAt when a new message is added
chatSchema.methods.addMessage = async function (message) {
  this.messages.push(message);
  this.lastMessageAt = message.createdAt; // Update lastMessageAt when new message is added
  await this.save();
};

// Compound index to optimize queries based on participants and lastMessageAt
chatSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
