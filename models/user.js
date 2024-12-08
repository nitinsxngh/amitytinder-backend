const mongoose = require('mongoose');  // <-- Import mongoose

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },
    name: {
      type: String,
      trim: true,
    },
    dob: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
    },
    interestedIn: {
      type: String,
      enum: ['Male', 'Female', 'Both'],
    },
    bio: {
      type: String,
      maxlength: 250,
      default: '',
    },
    profilePicture: {
      type: String,
      default: '',
    },
    university: {
      type: String,
      trim: true,
      default: '',
    },
    swipeLimit: {
      type: Number,
      default: 10,
    },
    spinLimit: {
      type: Number,
      default: 5,
    },
    liked: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    disliked: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    matches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    otp: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'banned'],
      default: 'inactive',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    pinnedMatches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model('User', userSchema); // Export the model
