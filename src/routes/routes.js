import { Router } from 'express';
import {Session} from '../models/session.js'
import { DatabaseCredentials } from '../models/dbCreds.js'
import { User } from '../models/user.js'
import {ChatLog} from '../models/chatLogs.js';
import bcrypt from 'bcryptjs';
const router = Router();

router.post('/newMessage', async (req, res) => {
  const { email,psid, message } = req.body;

  try {

    const existingUser = await User.findOne({ email });
    let session = await Session.findOne({ psid, isActive: true });

    if (!session) {
      session = await Session.create({userId:existingUser._id ,psid, isActive: true });
    }

    const sessionId = session._id;

    await ChatLog.create({ userId:existingUser._id,psid, message, sessionId });

    res.status(200).send({ message: 'Message processed successfully' });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).send({ error: 'Server error' });
  }
});;

router.post('/signup',async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Server error' });
  }
})

export  {router};
