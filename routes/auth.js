const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Chat = require('../models/chat');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const cloudinary = require('cloudinary').v2; // Import cloudinary
const multer = require('multer');
const storage = multer.memoryStorage(); // Store the image in memory
const upload = multer({ storage });

// Load environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to generate a random unique username
const generateUniqueUsername = async (baseName) => {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
  const username = `${baseName}_${randomSuffix}`;

  // Check if the username already exists
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    // Recursively generate a new username if the current one exists
    return generateUniqueUsername(baseName);
  }

  return username;
};

// Middleware to authenticate JWT tokens
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Register User
router.post('/register', async (req, res) => {
  const { email, password, confirmPassword, username } = req.body;

  // Validate input
  if (!email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Email, password, and confirmation password are required' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  try {
    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Generate a random unique username if not provided
    let finalUsername = username;
    if (!finalUsername) {
      const baseName = email.split('@')[0]; // Use the part of the email before '@' as a base
      finalUsername = await generateUniqueUsername(baseName);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      email,
      password: hashedPassword,
      username: finalUsername,
    });

    await newUser.save();

    // Generate JWT token after registration
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({
      message: 'User registered successfully',
      token, // Return the token along with the registration response
      username: finalUsername,
      userId: newUser._id, // Include userId in the response
    });
  } catch (err) {
    console.error("Error during registration:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Login User
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Compare hashed password with the stored password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Check if it's a new day (if the user hasn't logged in today)
    const lastLoginDate = new Date(user.lastLogin);
    const currentDate = new Date();

    if (lastLoginDate.toDateString() !== currentDate.toDateString()) {
      // Update the swipeLimit and spinLimit if they are below thresholds
      if (user.swipeLimit < 20) user.swipeLimit = 20;
      if (user.spinLimit < 1) user.spinLimit = 1;

      // Update lastLogin timestamp
      user.lastLogin = currentDate;
      await user.save(); // Save updated user data
    }

    // Generate JWT Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Respond with success message and user data
    res.status(200).json({
      message: 'Login successful',
      token,
      username: user.username,
      userId: user._id, // Include userId in the response
      swipeLimit: user.swipeLimit,
      spinLimit: user.spinLimit, // Include updated limits
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update User Profile
router.put('/update-profile', authenticate, async (req, res) => {
  const updates = req.body;

  if (updates.gender) {
    updates.gender = updates.gender.charAt(0).toUpperCase() + updates.gender.slice(1).toLowerCase();
  }
  if (updates.interestedIn) {
    updates.interestedIn =
      updates.interestedIn.charAt(0).toUpperCase() + updates.interestedIn.slice(1).toLowerCase();
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Fetch User Details
router.get('/user', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
  return array;
};

router.get('/all-users', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id; // Get the current user's ID from the token

    // Fetch the current user's preferences, liked users, and matches
    const currentUser = await User.findById(currentUserId, 'interestedIn liked matches');
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { interestedIn, liked, matches } = currentUser;

    // Define gender filter based on the user's preference
    let genderFilter = [];
    if (interestedIn === 'Male') genderFilter = ['Male'];
    else if (interestedIn === 'Female') genderFilter = ['Female'];
    else if (interestedIn === 'Both') genderFilter = ['Male', 'Female', 'Other'];

    // Combine liked and matches into one exclusion list
    const excludeIds = [...new Set([...liked, ...matches, currentUserId])]; // Ensure uniqueness

    // Get pagination parameters from the query (default to page 1, limit 10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch profiles with and without a profile picture separately, excluding liked and matched profiles
    const usersWithPicture = await User.find(
      {
        _id: { $nin: excludeIds }, // Exclude current user, liked users, and matched users
        name: { $ne: null, $ne: '' },
        dob: { $ne: null },
        gender: { $in: genderFilter },
        interestedIn: { $ne: null },
        profilePicture: { $ne: null }, // Ensure profile picture exists
      },
      'name profilePicture dob gender interestedIn bio' // Include bio field
    ).skip(skip).limit(limit); // Apply pagination

    const usersWithoutPicture = await User.find(
      {
        _id: { $nin: excludeIds }, // Exclude current user, liked users, and matched users
        name: { $ne: null, $ne: '' },
        dob: { $ne: null },
        gender: { $in: genderFilter },
        interestedIn: { $ne: null },
        profilePicture: null, // Profiles without a picture
      },
      'name profilePicture dob gender interestedIn bio' // Include bio field
    ).skip(skip).limit(limit); // Apply pagination

    // Shuffle both groups
    const shuffledWithPicture = shuffleArray(usersWithPicture);
    const shuffledWithoutPicture = shuffleArray(usersWithoutPicture);

    // Combine them, prioritizing profiles with pictures
    const prioritizedUsers = [...shuffledWithPicture, ...shuffledWithoutPicture];

    res.status(200).json(prioritizedUsers);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/spinner-users', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId, 'interestedIn liked matches');
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { interestedIn, liked, matches } = currentUser;

    let genderFilter = [];
    if (interestedIn === 'Male') genderFilter = ['Male'];
    else if (interestedIn === 'Female') genderFilter = ['Female'];
    else if (interestedIn === 'Both') genderFilter = ['Male', 'Female', 'Other'];

    const excludeIds = [...new Set([...liked, ...matches, currentUserId])];

    const users = await User.find(
      {
        _id: { $nin: excludeIds },
        dob: { $ne: null },
        gender: { $in: genderFilter },
      },
      'name profilePicture dob gender'
    )
      .limit(10) // Limit results to 10
      .exec();

    const spinnerUsers = users.map(user => ({
      id: user._id,
      name: user.name || 'Name not available',
      profilePicture: user.profilePicture || 'https://example.com/dummy-profile.jpg',
    }));

    res.status(200).json(spinnerUsers);
  } catch (err) {
    console.error('Error fetching spinner users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




router.post('/swipe', authenticate, async (req, res) => {
  try {
    const { targetUserId, direction } = req.body;

    if (!['left', 'right'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid swipe direction' });
    }

    const currentUserId = req.user.id; // Current logged-in user's ID

    if (direction === 'right') {
      // Check if the target user has already liked the current user
      const targetUser = await User.findById(targetUserId, 'liked matches');

      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      const isMutual = targetUser.liked.includes(currentUserId);

      if (isMutual) {
        // Add each other to matches
        await User.findByIdAndUpdate(currentUserId, {
          $addToSet: { matches: targetUserId },
          $pull: { liked: targetUserId, disliked: targetUserId }, // Remove from liked and disliked
        });

        await User.findByIdAndUpdate(targetUserId, {
          $addToSet: { matches: currentUserId },
          $pull: { liked: currentUserId, disliked: currentUserId }, // Remove from liked and disliked
        });

        // Decrease swipe limit for the current user
        await User.findByIdAndUpdate(currentUserId, {
          $inc: { swipeLimit: -1 }, // Decrement swipeLimit by 1
        });

        return res.status(200).json({ message: 'Matched! Connection created.', mutual: true });
      }
    }

    // Update swipe action in the database
    const updateActions =
      direction === 'right'
        ? {
            $addToSet: { liked: targetUserId }, // Add to liked
            $pull: { disliked: targetUserId }, // Remove from disliked
          }
        : { $addToSet: { disliked: targetUserId } }; // Add to disliked for left swipe

    const updatedUser = await User.findByIdAndUpdate(currentUserId, updateActions, { new: true });

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Decrease swipe limit for the current user
    await User.findByIdAndUpdate(currentUserId, {
      $inc: { swipeLimit: -1 }, // Decrement swipeLimit by 1
    });

    res.status(200).json({ message: `Swiped ${direction}`, mutual: false });
  } catch (err) {
    console.error('Error handling swipe:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



router.post('/spinwin', authenticate, async (req, res) => {
  try {
    const { targetUserId, isSpinnerWinner } = req.body;
    const currentUserId = req.user.id; // Current logged-in user's ID

    if (isSpinnerWinner) {
      // Directly add winner to matches for both users
      const winnerUpdate = await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { matches: targetUserId },
        $pull: { liked: targetUserId, disliked: targetUserId }, // Ensure cleaned liked/disliked
      });

      const targetUserUpdate = await User.findByIdAndUpdate(targetUserId, {
        $addToSet: { matches: currentUserId },
        $pull: { liked: currentUserId, disliked: currentUserId }, // Ensure cleaned liked/disliked
      });

      if (!winnerUpdate || !targetUserUpdate) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({ message: 'Winner connected successfully!', mutual: true });
    }

    // Regular swipe logic
    const { direction } = req.body;
    if (!['left', 'right'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid swipe direction' });
    }

    if (direction === 'right') {
      const targetUser = await User.findById(targetUserId, 'liked matches');
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      const isMutual = targetUser.liked.includes(currentUserId);
      if (isMutual) {
        await User.findByIdAndUpdate(currentUserId, {
          $addToSet: { matches: targetUserId },
          $pull: { liked: targetUserId, disliked: targetUserId },
        });

        await User.findByIdAndUpdate(targetUserId, {
          $addToSet: { matches: currentUserId },
          $pull: { liked: currentUserId, disliked: currentUserId },
        });

        return res.status(200).json({ message: 'Matched! Connection created.', mutual: true });
      }
    }

    const updateActions =
      direction === 'right'
        ? {
            $addToSet: { liked: targetUserId },
            $pull: { disliked: targetUserId },
          }
        : { $addToSet: { disliked: targetUserId } };

    const updatedUser = await User.findByIdAndUpdate(currentUserId, updateActions, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: `Swiped ${direction}`, mutual: false });
  } catch (err) {
    console.error('Error handling swipe:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get("/matches", authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    console.log("Current User ID:", currentUserId);

    // Fetch the user with the pinnedMatches field
    const user = await User.findById(currentUserId)
      .populate("matches", "name profilePicture")
      .select("pinnedMatches");
      
    if (!user) {
      console.error("User not found");
      return res.status(404).json({ error: "User not found" });
    }

    console.log("User Matches:", user.matches);

    // Separate matches into pinned and non-pinned
    const pinnedMatches = user.matches.filter((match) => user.pinnedMatches.includes(match._id));
    const nonPinnedMatches = user.matches.filter((match) => !user.pinnedMatches.includes(match._id));

    // Fetch chat data for each match in both pinned and non-pinned
    const fetchMessages = async (matches) => {
      return await Promise.all(matches.map(async (match) => {
        const chat = await Chat.findOne({
          participants: { $all: [currentUserId, match._id] },
        }).populate('messages');
        
        // Get the last message or null if no messages
        const lastMessage = chat && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
        
        return {
          ...match.toObject(),
          lastMessage,
        };
      }));
    };

    const pinnedMatchesWithMessages = await fetchMessages(pinnedMatches);
    const nonPinnedMatchesWithMessages = await fetchMessages(nonPinnedMatches);

    // Combine the results: pinned matches come first, then non-pinned
    const sortedMatches = [
      ...pinnedMatchesWithMessages,
      ...nonPinnedMatchesWithMessages,
    ];

    // Sort by last message date (most recent first)
    const finalSortedMatches = sortedMatches.sort((a, b) => {
      const aDate = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0); // Default to epoch if no message
      const bDate = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
      return bDate - aDate; // Sort in descending order by last message date
    });

    // If no matches found, return empty array
    if (!finalSortedMatches || finalSortedMatches.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(finalSortedMatches);
  } catch (err) {
    console.error("Error fetching matches:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Endpoint to handle connecting users
router.post('/connect-user', authenticate, async (req, res) => {
  try {
    // Ensure req.user is set correctly by authenticate middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { winnerId } = req.body;
    const currentUserId = req.user._id; // Now it's safe to access _id

    // Find the winner and the current user
    const winner = await User.findById(winnerId);
    const currentUser = await User.findById(currentUserId);

    if (!winner || !currentUser) {
      return res.status(400).json({ success: false, message: 'User(s) not found' });
    }

    // Add the current user's ID to the winner's matches array
    if (!winner.matches.includes(currentUserId)) {
      winner.matches.push(currentUserId);
      await winner.save();
    }

    return res.status(200).json({ success: true, message: 'User connected successfully' });
  } catch (error) {
    console.error('Error connecting users:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Pin Match - Allows users to "pin" a match to their profile
router.put('/pin-match', authenticate, async (req, res) => {
  try {
    const { targetUserId } = req.body; // Target user to be pinned or unpinned
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    const currentUserId = req.user.id; // Current logged-in user's ID

    // Find the current user and check if the target user exists
    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User or target user not found' });
    }

    // Toggle pin/unpin
    const matchIndex = currentUser.pinnedMatches.indexOf(targetUserId);
    if (matchIndex !== -1) {
      // If match is already pinned, unpin it
      currentUser.pinnedMatches.splice(matchIndex, 1); // Remove from pinned list
      await currentUser.save();
      return res.status(200).json({ message: 'Match unpinned successfully', pinnedMatches: currentUser.pinnedMatches });
    } else {
      // If match is not pinned, pin it
      currentUser.pinnedMatches.push(targetUserId);
      await currentUser.save();
      return res.status(200).json({ message: 'Match pinned successfully', pinnedMatches: currentUser.pinnedMatches });
    }
  } catch (err) {
    console.error('Error pinning/unpinning match:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/liked-by', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // Find all users who liked the current user
    const users = await User.find({ liked: currentUserId }, 'name profilePicture username');

    if (!users.length) {
      return res.status(404).json({ message: 'No users have liked you yet.' });
    }

    res.status(200).json(users);
  } catch (err) {
    console.error('Error fetching liked-by users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



router.post('/upload-profile-image', authenticate, upload.single('profileImage'), async (req, res) => {
  // This is where req.user should be set if authentication passes
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto' },
      async (error, result) => {
        if (error) {
          return res.status(500).json({ error: 'Error uploading image to Cloudinary' });
        }

        const imageUrl = result.secure_url;
        const userId = req.user.id; // req.user should be populated by authenticate middleware
        console.log(req.user._id);
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          { profilePicture: imageUrl },
          { new: true }
        );

        if (!updatedUser) {
          return res.status(404).json({ error: 'User not found' });
        }

        return res.json({ profileImage: imageUrl });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error('Error uploading image:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});



module.exports = router;
