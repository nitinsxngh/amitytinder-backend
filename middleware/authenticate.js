// backend/middleware/authenticate.js

const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Extract the token from the Authorization header
  console.log('Token:', token); // Log the token to verify it

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token using your secret
    req.user = decoded; // Attach the decoded user to the request object
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

module.exports = authenticate;
