import { Router } from 'express';
import { Session } from '../models/session.js'
import { DatabaseCredentials } from '../models/dbCreds.js'
import { User } from '../models/user.js'
import { ChatLog } from '../models/chatLogs.js';
import { authUser } from '../middleware/auth.js';
import { dbConfigStr } from '../models/dbConfigStr.js'
import { askQuestion } from '../agents/agent.js'
import { main } from '../report/dbDataToSheet.js'
import { createDb } from '../controller/createdb.js'
import {saveDataFromExcleToDb} from '../controller/excleToDb.js'
import multer from 'multer';
import bcrypt from 'bcryptjs';
import path from 'path';
import jwt from 'jsonwebtoken';
import * as dotenv from "dotenv";
import mongoose from 'mongoose';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const ObjectId = mongoose.Types.ObjectId;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const upload = multer({
  dest: path.join(__dirname, 'uploads/')
});
const router = Router();

router.post('/newMessage',authUser ,async (req, res) => {
  const {  message, sessionId, database, psid } = req.body;

  try {
    const userId  = new ObjectId(req.token)
    let session_doc
    if (!sessionId) {
      session_doc = await Session.create({ userId: userId, psid, isActive: true });
    } else {
      session_doc = await Session.findOne({ _id: sessionId });
    }
    const chat_history = await ChatLog.find({ sessionId })
    console.log("request message : ", message)


    let llm_model,dbDetail;
    console.log(process.env.SERVER_ENV)
    if (process.env.SERVER_ENV == 'dev1') {
      const data = await DatabaseCredentials.findOne({ userId: userId,database:database});
      dbDetail = {
        config: {
          host: process.env.SERVER,
          user: process.env.USER_NAME,
          password: process.env.PASSWORD,
          database: process.env.DB_NAME
        },
        dbtype: process.env.DB_TYPE,
        userId: userId,
        schema: data.schema
      }
      llm_model = {
        config: {
          model: process.env.OPENAI_MODEL,
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
          apiKey: process.env.OPENAI_API_KEY
        },
        usedLLM: process.env.LLM
      }
    } else {
      // will handle this later 
      dbDetail = await DatabaseCredentials.findOne({ userId: userId, database:database});
      dbDetail.config = {
          host: dbDetail.host,
          user: dbDetail.username,
          password: dbDetail.password,
          database: dbDetail.database
        }
      llm_model = {
        config: {
          model: process.env.OPENAI_MODEL,
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
          apiKey: process.env.OPENAI_API_KEY
        },
        usedLLM: process.env.LLM
      }
    }

    session_doc.input = message;
    session_doc.chat_history = chat_history;
    session_doc.dbDetail = dbDetail;
    session_doc.llm_model = llm_model;
    // Save the updated session document
    if (!sessionId) {
      await session_doc.save();
    }
    const response = await askQuestion(session_doc)

    const chatLogId = await ChatLog.create({
      userId: userId,
      psid,
      message: response.chat_history,
      sessionId: session_doc._id,
      context: {
        agent: response.agent ? response.agent : "",
        query_description: response.query_description ? response.query_description : "",
        followup: response.followup ? response.followup : "",
        SQL_query: response.SQL_query ? response.SQL_query : "",
        DB_response: response.DB_response ? response.DB_response : "",
      }
    });

    res.status(200).send({
      message: 'Message processed successfully',
      sessionId: session_doc._id,
      chatLogId: chatLogId._id,
      agent: response.agent ? response.agent : "",
      query_description: response.query_description ? response.query_description : "",
      followup: response.followup ? response.followup : "",
      SQL_query: response.SQL_query ? response.SQL_query : "",
      DB_response: response.DB_response ? response.DB_response : "",
    });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ status: false, message: 'All fields are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ status: false, message: 'User already exists' });
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
    res.status(201).json({ status: true, message: 'Your Account is created successfully' });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Server error' });
  }
})

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user in the database
    const user = await User.findOne({ email: username });
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

    res.status(200).send({ status: true, token, message: "Welcome to AginoTech" });
  } catch (err) {
    res.status(500).send({ status: false, message: err.message });
  }
});

router.get('/databaseForm', authUser, async (req, res) => {
  try {
    const data = await dbConfigStr.find({})
    res.status(200).json({ status: true, data })
  } catch (error) {
    console.error(error)
  }

})

router.get('/database', authUser, async (req, res) => {
  try {
    const data = await DatabaseCredentials.find({})
    res.status(200).json({ status: true, data })
  } catch (error) {
    console.error(error)
  }

})

router.get('/connecteddatabases', authUser, async (req, res) => {
  try {
      const userId = req.token;
      const data = await DatabaseCredentials.find({ userId }).$project('_id database aliasName').lean();
      res.status(200).json({ status: true, data });
  } catch (error) {
      console.error('Error fetching connected databases:', error);
      res.status(500).json({ status: false, message: 'Internal Server Error' });
  }
});

router.post('/database', authUser, async (req, res) => {
  try {
    const { userId } = req.token
    const { dbtype, host, server, database, username, password } = req.body;

    const data = {
      userId: userId, dbtype: dbtype, database: database, username: username, password: password
    }
    if (host) {
      data.host = host
    } else {
      data.server = server
    }

    const document = new DatabaseCredentials(data);
    await document.save();

    res.status(200).send({ status: true, message: "sheet generated successfully", document: document });

  } catch (error) {
    console.error(error)
  }
})

router.get('/chatHistory', authUser, async (req, res) => {
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

  res.status(200).json({ status: true, data: sessions })
})

router.get('/chatlogBySessionId', authUser, async (req, res) => {
  try {
    const { sessionId } = req.query.sessionId

    const chatHistory = await ChatLog.find({ sessionId }).select('message ')
    return res.status(200).json({ status: true, data: chatHistory })
  } catch (error) {
    console.error(error)
  }

})

router.post('/shopifyDetails', authUser, async (req, res) => {

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
    const { chatLogId } = req.query;
    const data = await ChatLog.findOne({ _id: chatLogId });
    const url = await main(data.context.DB_response)
    res.status(200).send({ status: true, message: "sheet generated successfully", url: url });
  } catch (err) {
    res.status(500).send({ status: false, message: err.message });
  }
});

router.post('/uploadSheet', upload.single('file'), async (req, res) =>{
  try {
     if (!req.file) {
            throw new Error('No file uploaded. Please upload an Excel file.');
        }
        const { userId } = req.token?req.token:{userId:"66c4e3f4e2e69b38ea2581f9"}

        const fileExtension = path.extname(req.file.originalname);
        if (fileExtension !== '.xlsx' && fileExtension !== '.xls') {
            throw new Error('Invalid file format. Only Excel files are allowed.');
        }


        let dbData = await DatabaseCredentials.findOne({ userId:userId, database:userId});

        if(!dbData){
          dbData = await DatabaseCredentials.findOne({ _id:new ObjectId(process.env.DB_ID)});
          const config = {
            userId: userId, dbtype: dbData.dbtype, database: userId, username: dbData.username, password: dbData.password,host:dbData.host
          }
          const dbCreation = await createDb(config)
          if(dbCreation){
            const document = new DatabaseCredentials(config);
            await document.save();
          }

          dbData = await DatabaseCredentials.findOne({userId: userId,database: userId});
          if(!dbData){
            console.log("some error occured")
          }
        }

        let dbDetail = {
            config: {
            host: dbData.host,
            user: dbData.username,
            password: dbData.password,
            database: dbData.database
            },
            dbtype: dbData.dbtype,
          }
        
          const result = await saveDataFromExcleToDb(req, res, dbDetail)
          dbData.schema = result
          dbData.save()
          res.status(200).send({ status: true, message: "sheet uploaded successfully"});
  } catch (err) {
    console.log(err)
    res.status(500).send({ status: false, message: err.message });
  }
});



export { router };
