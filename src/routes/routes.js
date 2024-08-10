import { Router } from 'express';
import {Session} from '../models/session.js'
import { DatabaseCredentials } from '../models/dbCreds.js'
import { User } from '../models/user.js'
import {ChatLog} from '../models/chatLogs.js';
import {authUser} from '../middleware/auth.js'
import bcrypt from 'bcryptjs';
import askQuestion from '../agents/agent.js'
import moment from 'moment'
const router = Router();

router.post('/newMessage',authUser, async (req, res) => {
  const { email,psid, message,sessionId ,dbtype, newSession = false } = req.body;

  try {

    const existingUser = await User.findOne({ email:req.token, isDeleted:false});
    if (!sessionId) {
      session = await Session.create({userId:existingUser._id ,psid, isActive: true });
      sessionId = session._id
    }
    const chat_history = await ChatLog.find({sessionId}).projection({"message":1})

    let dbDetail = await DatabaseCredentials.findOne({ userId:existingUser._id,default :true });
    if (!dbDetail) {
      dbDetail = await DatabaseCredentials.findOne({ _id:ObjectId("") });
    }
    

    askQuestion(message,chat_history,dbDetail)

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

router.post('/login', async (req, res) => {
  try {
      const { username, password } = req.body;

      // Find user in the database
      const user = await User.findOne({ email:username });
      if (!user) {
          return res.json({ status: false, message: "Invalid username or password" });
      }

      // Compare the password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
          return res.status(401).json({ status: false, message: "Invalid username or password" });
      }

      // Create JWT token
      const token = jwt.sign({ userId: user.id }, 'Pri%40mus', { expiresIn: '3h' });

      res.status(200).send({ status: true, token });
  } catch (err) {
      res.status(500).send({ status: false, message: err.message });
  }
});

router.post('/dbDetails',authUser,async (req,res)=>{

})

export  {router};
