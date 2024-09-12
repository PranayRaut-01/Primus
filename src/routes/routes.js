import { Router } from 'express';
import { Session } from '../models/session.js'
import { DatabaseCredentials } from '../models/dbCreds.js'
import { User } from '../models/user.js'
import { ChatLog } from '../models/chatLogs.js';
import { authUser } from '../middleware/auth.js';
import { dbConfigStr } from '../models/dbConfigStr.js'
import { askQuestion } from '../agents/agent.js'
import { main } from '../report/dbDataToSheet.js'
import { createDb,testConnection } from '../controller/createdb.js'
import { saveDataFromExcleToDb } from '../controller/excleToDb.js'
import { embedAndStoreSchema } from '../clientDB/pinecone.js'
import { Notes } from '../models/notes.js'
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

router.get('/',async (req,res) =>{
  res.status(200).send("<h1>Welcome to Agino tech</h1>")
})

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
     return res.status(400).send({ status: true, message: "Mandatory parameter missing" });
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
    res.status(201).json({ status: true, message: 'Your Account is created successfully', data: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Server error' });
  }
})

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).send({ status: true, message: "Mandatory parameter missing" });
    }

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

    res.status(200).send({ status: true, token:token, message: "Welcome to AginoTech" });
  } catch (err) {
    res.status(500).send({ status: false, message: err.message });
  }
});

router.post('/newMessage',authUser ,async (req, res) => {
  try {
    const {  message, sessionId, database, psid } = req.body;

    if (!message || !database || !psid) {
      return res.status(400).send({ status: true, message: "Mandatory parameter missing" });
    }

    const userId  = new ObjectId(req.token)
    let session_doc
    if (!sessionId) {
      session_doc = await Session.create({ userId: userId, psid, isActive: true })
    } else {
      session_doc = await Session.findOne({ _id: sessionId });
    }
    const chat_history = await ChatLog.find({ sessionId })
    console.log("request message : ", message)

      const dbDetail = await DatabaseCredentials.findOne({ userId: userId, database:database}).lean();
      dbDetail.config = {
          user: dbDetail.username,
          password: dbDetail.password,
          database: dbDetail.database
        }
        if (dbDetail.host) {
          dbDetail.config.host = dbDetail.host
        } else {
          dbDetail.config.server = dbDetail.server
        }
      const llm_model = {
        config: {
          model: process.env.OPENAI_MODEL,
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
          apiKey: process.env.OPENAI_API_KEY
        },
        usedLLM: process.env.LLM
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
        error:response.error?response.error : ""
      }
    });

    if(response.error){
      return res.status(400).send({
        message: 'some error occured',
        sessionId: session_doc._id,
        chatLogId: chatLogId._id,
        agent: response.agent ? response.agent : "",
        query_description: response.query_description ? response.query_description : "",
        followup: response.followup ? response.followup : "",
        SQL_query: response.SQL_query ? response.SQL_query : "",
        DB_response: response.DB_response ? response.DB_response : "",
        error:response.error?response.error:""
      });
    }

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
    res.status(500).send({ error: 'Server error', message : error });
  }
});

router.get('/databaseForm', authUser, async (req, res) => {
  try {
    const data = await dbConfigStr.find({})
    res.status(200).json({ status: true, data })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: false, message: 'Internal Server Error' });
  }

})

router.post('/testConnection', authUser, async (req, res) => {
  try {
    const {  host, server, database, username, password,dbtype } = req.body;

    if ( !database || !username || !password || !dbtype) {
      return res.status(400).send({ status: false, message: "Mandatory parameter missing"});
    }
    const dbDetail = {
      dbtype:dbtype.trim(),
    }
    dbDetail.config = {
      user: username.trim(),
      password: password.trim(),
      database: database.trim()
    }
    if (host) {
      dbDetail.config.host = host.trim()
    } else {
      dbDetail.config.server = server.trim()
    }

    const result = await testConnection(dbDetail);
    if(result.connection){
      res.status(200).send({ status: true, message: "Database connected succesfully",table:result.table});
    }else{
      res.status(400).send({ status: false, message: result.message});
    }

   
  } catch (error) {
    console.error(error)
  }
})

router.post('/database', authUser, async (req, res) => {
  try {
    const userId  = new ObjectId(req.token)
    const { dbtype, host, server, database, username, password, schema } = req.body;

    if (!dbtype || (!host || !server)|| !database || !username || !password || !schema) {
      return res.status(400).send({ status: true, message: "Mandatory parameter missing"});
    }

    const data = {
      userId: userId, dbtype: dbtype, database: database, username: username, password: password, schema:schema
    }
    if (host) {
      data.host = host
    } else {
      data.server = server
    }

    const pinconeData = await embedAndStoreSchema(data,data.schema)
    if(!pinconeData.status){
      return res.status(500).send({ status: true, message: "getting some error while saving database data", data: pinconeData.message });
    }
    data.pincone = true;
    data.indexName = pinconeData.indexName
    const document = new DatabaseCredentials(data);
    const dbDetail = await document.save();

    res.status(200).send({ status: true, message: "Database saved succesfully", document: dbDetail });

  } catch (error) {
    console.error(error)
    res.status(500).send({ status: false, message: "Some error occured", data: error.message });
  }
})

router.get('/database', authUser, async (req, res) => {
  try {
    const data = await DatabaseCredentials.find({})
    res.status(200).json({ status: true, data })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: false, message: 'Internal Server Error' });
  }
})

router.get('/connecteddatabases', authUser, async (req, res) => {
  try {
    const userId  = new ObjectId(req.token)
    const data = await DatabaseCredentials.find({ userId }).$project('_id database aliasName').lean();
    res.status(200).json({ status: true, data:data });
  } catch (error) {
      console.error('Error fetching connected databases:', error);
      res.status(500).json({ status: false, message: 'Internal Server Error' });
  }
});

router.post('/uploadSheet',authUser, upload.single('file'), async (req, res) =>{
  try {
     if (!req.file) {
            throw new Error('No file uploaded. Please upload an Excel file.');
        }
        const userId  = new ObjectId(req.token)
        // ?req.token:{userId:"66cf4e05554955c52c266abd"}

        const fileExtension = path.extname(req.file.originalname);
        if (fileExtension !== '.xlsx' && fileExtension !== '.xls') {
            throw new Error('Invalid file format. Only Excel files are allowed.');
        }


        let dbData = await DatabaseCredentials.findOne({ userId:userId, database:userId})

        if(!dbData){
          dbData = await DatabaseCredentials.findOne({ _id:new ObjectId(process.env.DB_ID)})
          const config = {
            userId: userId, dbtype: dbData.dbtype, database: userId, username: dbData.username, password: dbData.password,host:dbData.host, aliasName:"sheet"}
          const dbCreation = await createDb(config)
          if(dbCreation){
            const document = new DatabaseCredentials(config);
            await document.save();
          }

          dbData = await DatabaseCredentials.findOne({userId: userId,database: userId})
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
          const data = await DatabaseCredentials.updateOne({ userId: userId ,database: userId}, { $set: { schema: result } })

          res.status(200).send({ status: true, message: "sheet uploaded successfully",data: data});
  } catch (err) {
    console.log(err)
    res.status(500).send({ status: false, message: err.message });
  }
});

router.get('/chatHistory', authUser, async (req, res) => {
  try {
    const userId  = new ObjectId(req.token)
  
    const sessions = await Session.find({userId:userId}).select({_id:1, psid:1,startTime:1}).lean()
  
  res.status(200).json({ status: true, data: sessions })
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ status: false, message: 'Internal Server Error' , error : error.message});
  }
 
})

router.get('/chatlogBySessionId', authUser, async (req, res) => {
  try {
    const sessionId  = new ObjectId(req.query.sessionId)

    const chatHistory = await ChatLog.find({ sessionId }).select({ message: 1, context: 1 }).lean();
    return res.status(200).json({ status: true, data: chatHistory })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: false, message: 'Internal Server Error' , error : error.message});
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

router.get('/getSheet',authUser, async (req, res) => {
  try {
    const { chatLogId } = req.query;
    const data = await ChatLog.findOne({ _id: chatLogId });
    const url = await main(data.context.DB_response)
    res.status(200).send({ status: true, message: "sheet generated successfully", url: url });
  } catch (err) {
    res.status(500).send({ status: false, message: err.message });
  }
});

router.post('/graphData', async(req, res) => {
  try {
    const { xaxis, yaxis1, yaxis2 ,chatLogId} = req.body; 

    if (!xaxis || !yaxis1 ) {
      return res.status(400).send({ status: true, message: "Mandatory parameter missing" });
    }

    const chatlogId = new ObjectId(chatLogId)
    
  const data = (await ChatLog.findOne({ _id: chatlogId }).lean()).context.DB_response;

  const structuredData = {
    labels: data.map(row => row[xaxis]) ,
    datasets:[{
      label: yaxis1,
      data: data.map(row => row[yaxis1]),
      fill: false,  // For line charts to disable filling under the line
      yAxisID: "y-axis-1"  // If you have multiple y-axes
    },
    {
      label: yaxis2,
      data:  yaxis2 ? data.map(row => row[yaxis2]) : [],
      fill: false,
      yAxisID: "y-axis-2"
    }
  ]
  };

  // Clean undefined keys if xaxis2 is not provided
  Object.keys(structuredData).forEach(key => {
      if (!structuredData[key]) {
          delete structuredData[key];
      }
  });

  res.status(200).send({ status: true, message: "Graph data generated", data: structuredData});
  } catch (err) {
    console.log(err)
    res.status(500).send({ status: false, message: err.message });
  }
});

router.post('/api/notes',authUser, async (req, res) => {
  try {
    const { title, content, discription } = req.body;
    const userId  = new ObjectId(req.token)

    if (!title || !content || userId ) {
      return res.status(400).send({ status: false, message: "Mandatory parameter missing" });
    }

    const newNote = new Notes({
      userId,
      title,
      content,
      discription:discription?discription:""
    });
    const savedNote = await newNote.save();
    console.log('Saved Note:', savedNote);
    res.status(201).send({ status: true, message: "Note saved", data: savedNote });
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({status:false, message: 'Failed to create note', error: err.message });
  }
});

router.put('/api/notes/:id',authUser, async (req, res) => {
  try {
    const { title, content, discription } = req.body;
    const userId  = new ObjectId(req.token)
    console.log('PUT Request Body:', req.body);

    const updatedNote = await Notes.findByIdAndUpdate(req.params.id, { userId, title, content, discription }, { new: true });
    if (!updatedNote) {
      return res.status(404).json({ message: 'Note not found' });
    }
    console.log('Updated Note:', updatedNote);
    res.status(201).send({ status: true, message: "Note update", data: updatedNote });
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ message: 'Failed to update note', error: err.message });
  }
});

router.get('/api/notes/:id',authUser, async (req, res) => {
  try {
    const note = await Notes.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.status(200).send({ status: true, message: "notes details by id", data: note });
  } catch (err) {
    console.error('Error fetching note:', err);
    res.status(500).json({ message: 'Failed to fetch note', error: err.message });
  }
});

router.get('/api/notes',authUser, async (req, res) => {
  try {
    const userId  = new ObjectId(req.token)
    const notes = await Notes.find({userId});
    res.status(200).send({ status: true, message: "all the notes of perticular user", data: notes });
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ message: 'Failed to fetch notes', error: err.message });
  }
});



export { router };
