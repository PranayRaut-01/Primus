import { Router } from 'express';
import {Session} from '../models/session.js'
import { DatabaseCredentials } from '../models/dbCreds.js'
import { User } from '../models/user.js'
import {ChatLog} from '../models/chatLogs.js';
import {authUser} from '../middleware/auth.js';
import {dbConfigStr} from '../models/dbConfigStr.js'
import bcrypt from 'bcryptjs';
import {askQuestion} from '../agents/agent.js'
import {main} from '../report/dbDataToSheet.js'
import moment from 'moment'
import * as dotenv from "dotenv";
import { Schema } from 'mongoose';
dotenv.config();
const router = Router();

router.post('/newMessage', async (req, res) => {
  const { email,psid, message,sessionId ,dbtype, newSession = false, chat_history=[]} = req.body;

  try {

    const existingUser = await User.findOne({ email:email});
    let session_doc
    if (!sessionId) {
      session_doc = await Session.create({userId:existingUser._id ,psid, isActive: true });
    }else{
      session_doc = await Session.findOne({_id:sessionId});
    }
    const chat_history = await ChatLog.find({sessionId})
    console.log("request message : ",message )
    

    let configs={}
    console.log(process.env.SERVER_ENV)
    if(process.env.SERVER_ENV == 'dev'){
      const data = await DatabaseCredentials.findOne({ userId:existingUser._id });
      configs.dbDetail = {
        config : {
        host:  process.env.SERVER,
        user: process.env.USER_NAME,
        password: process.env.PASSWORD,
        database: process.env.DB_NAME
        },
        dbtype:process.env.DB_TYPE, 
        userId:existingUser._id,
        schema:data.schema
      }
      configs.llm_model = {
        config : {
          model: process.env.OPENAI_MODEL,
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
          apiKey: process.env.OPENAI_API_KEY
        },
        usedLLM:process.env.LLM
      }
    }else{
    // will handle this later 
      configs.dbDetail = await DatabaseCredentials.findOne({ userId:existingUser._id });
      configs.dbDetail = {
        config : {
        host:  dbDetail.host,
        user: dbDetail.username,
        password: dbDetail.password,
        database: dbDetail.database
        }
      }
      configs.llm_model = {
        config : {
          model: process.env.OPENAI_MODEL,
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
          apiKey: process.env.OPENAI_API_KEY
        },
        usedLLM:process.env.LLM
      }
    }
    
    session_doc.input = message;
    session_doc.chat_history = chat_history;
    session_doc.dbDetail = configs.dbDetail;
    session_doc.llm_model = configs.llm_model;
    // Save the updated session document
    if(!sessionId){
      await session_doc.save();
    }
    const response = await askQuestion(session_doc)

    const chatLogId = await ChatLog.create({ 
      userId:existingUser._id,psid, 
      message:response.chat_history, 
      sessionId:session_doc._id,
      context: { 
        agent:response.agent?response.agent:"",
        query_description: response.query_description?response.query_description:"",
        followup:response.followup?response.followup:"",
        SQL_query:response.SQL_query?response.SQL_query:"",
        DB_response:response.DB_response?response.DB_response:"",
      }});

    res.status(200).send({ 
      message: 'Message processed successfully' , 
      sessionId:session_doc._id,
      chatLogId:chatLogId._id,
      agent:response.agent?response.agent:"",
      query_description: response.query_description?response.query_description:"",
      followup:response.followup?response.followup:"",
      SQL_query:response.SQL_query?response.SQL_query:"",
      DB_response:response.DB_response?response.DB_response:"",
    });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

router.post('/signup',async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ status : false ,message: 'All fields are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ status : false ,message: 'User already exists' });
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
    res.status(201).json({ status: true,message: 'Your Account is created successfully' });
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
          return res.status(404).json({ status: false, message: "Invalid username or password" });
      }

      // Compare the password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
          return res.status(401).json({ status: false, message: "Invalid username or password" });
      }

      // Create JWT token
      const token = jwt.sign({ userId: user.id }, 'Pri%40mus', { expiresIn: '3h' });

      res.status(200).send({ status: true, token ,message: "Welcome to AginoTech"});
  } catch (err) {
      res.status(500).send({ status: false, message: err.message });
  }
});

router.get('/database',authUser,async (req,res)=>{

  const data = await dbConfigStr.find({})
  res.status(200).json({status:true,data})
})

router.get('/chatHistory',authUser,async (req,res)=>{
  const user = req.token

  const sessions = Session.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(user) } },
    {
      $lookup: {
        from: 'chatLogs',
        localField: '_id',
        foreignField: 'sessionId',
        as: 'messages',
      },
    },
    {
      $addFields: {
        lastUserMessage: {
          $last: {
            $filter: {
              input: '$messages',
              as: 'message',
              cond: { $eq: ['$$message.sender', 'user'] },
            },
          },
        },
      },
    },
    {
      $project: {
        startTime: 1,
        endTime: 1,
        'lastUserMessage.content': 1,
        'lastUserMessage.timestamp': 1,
      },
    },
  ]);

  res.status(200).json({status:true,data:sessions})
})

router.get('/chatlogBySessionId',authUser,async(req,res)=>{
  const {sessionId} = req.query.sessionId

  const chatHistory =  await ChatLog.find({sessionId}).select('message ')
  return res.status(200).json({status:true,data:chatHistory})
})

router.post('/shopifyDetails',authUser,async (req,res)=>{
  
    const { shopName, apiKey, apiSecret, shopLink, accessToken } = req.body;

    if (!shopName || !apiKey || !apiSecret || !shopLink || !accessToken) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const newShop = new Shop({
            shopName,
            apiKey: encrypt(apiKey),
            apiSecret: encrypt(apiSecret),
            shopLink,
            accessToken: encrypt(accessToken),
        });

        await newShop.save();

        res.status(201).json({ message: 'Shopify details saved successfully', shop: newShop });
    } catch (error) {
        console.error('Error saving Shopify details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/getSheet', async (req, res) => {
  try {
      const {chatLogId} = req.query;
      const data = await ChatLog.findOne({_id:chatLogId});
      const url = await main(data.context.DB_response)
      res.status(200).send({ status: true ,message: "sheet generated successfully",url:url});
  } catch (err) {
      res.status(500).send({ status: false, message: err.message });
  }
});



export  {router};
