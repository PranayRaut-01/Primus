const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // Adjust as per your user model

// Default password for Google SSO users (hashed to satisfy schema)
const defaultPassword = 'GoogleSSO_DefaultPassword123!';

// Function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, 'Pri%40mus', { expiresIn: '3h' });
};

// Function to find or create user (for both Google and traditional login)
const findOrCreateUser = async (profile) => {
  let user = await User.findOne({ email: profile.email });

  if (!user) {
    // If user doesn't exist, create a new user (Google SSO signup)
    const hashedPassword = await bcrypt.hash(defaultPassword, 10); // Hash default password
    user = new User({
      email: profile.email,
      name: profile.name,
      isVerified: profile.verified_email || false, // Google SSO users are verified if their email is verified
      googleId: profile.googleId || null, // Only for Google SSO users
      password: hashedPassword, // Use hashed default password
    });
    await user.save();
  }

  return user;
};

// Function to verify user and generate a token (common for both login flows)
const authenticateUser = async (user, password) => {
  // Check if user is verified
  if (!user.isVerified) {
    throw new Error("User not verified, please contact contact@agino.tech");
  }

  // If password is provided, verify it (for traditional login)
  if (password) {
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid username or password");
    }
  }

  // Generate and return JWT token
  return generateToken(user.id);
};

// Main loginUser function
async function loginUser(req, res, profile = null) {
  try {
    let user, token;

    if (profile) {
      // Google SSO flow
      const { email, verified_email, name, id: googleId } = profile;

      // Ensure profile data is valid
      if (!email || !verified_email) {
        return res.status(400).send({ status: false, message: "Google account not verified" });
      }

      // Find or create user (Google SSO)
      user = await findOrCreateUser({
        email,
        name,
        verified_email,
        googleId,
      });

      // Authenticate user (Google SSO doesn't require password)
      token = await authenticateUser(user);
    } else {
      // Traditional login flow (email/password)
      const { username: email, password } = req.body;

      // Ensure email and password are provided
      if (!email || !password) {
        return res.status(400).send({ status: false, message: "Mandatory parameter missing" });
      }

      // Find user in the database
      user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ status: false, message: "Invalid username or password" });
      }

      // Authenticate user (with password check)
      token = await authenticateUser(user, password);
    }

    // Successful authentication
    res.status(200).send({ status: true, token, message: "Welcome to AginoTech" });
  } catch (err) {
    res.status(500).send({ status: false, message: err.message });
  }
}


// Signup route
async function signupUser (req, res, profile = null) {
  



  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ status: false, message: 'User already exists' });
    }

    let newUser;
    
    // If profile is provided, this is a Google SSO signup
    if (profile) {
      const { email, verified_email, name, googleId } = profile;

      if (!email) {
        return res.status(400).send({ status: false, message: "Email is required" });
      }

      newUser = new User({
        username: name, // May come from the Google profile or be optional
        email,
        googleId, // Store Google ID for future authentication
        isVerified: true // Google SSO users are usually considered verified
      });
    } else {
      const { username, email, password } = req.body;

      if (!email) {
        return res.status(400).send({ status: false, message: "Email is required" });
      } 

      // Traditional signup (email/password)
      if (!password || !username) {
        return res.status(400).send({ status: false, message: "Mandatory parameter missing" });
      }

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      newUser = new User({
        username,
        email,
        password: hashedPassword,
        isVerified: false // You can decide whether to verify users via email, etc.
      });
    }

    // Save new user
    await newUser.save();
    
    res.status(201).json({ status: true, message: 'Your account is created successfully', data: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
}


export {loginUser,signupUser}