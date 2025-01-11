import { Router } from "express";
import fs from "fs";
import { Session } from "../models/session.js";
import { DatabaseCredentials } from "../models/dbCreds.js";
import { User } from "../models/user.js";
import { ChatLog } from "../models/chatLogs.js";
import { authUser } from "../middleware/auth.js";
import { dbConfigStr } from "../models/dbConfigStr.js";
import { askQuestion } from "../agents/agent.js";
import { main } from "../report/dbDataToSheet.js";
import { testConnection, fetchDbDetails } from "../controller/createdb.js";
import {
  sheetUpload,
  dropTableAndDeleteDbDetail,
} from "../controller/excleToDb.js";
import { embedAndStoreSchema } from "../clientDB/pinecone.js";
import {
  saveDashboardAnalyticsData,
  getDashboardAnalyticsData,
  updateDashboardAnalyticsData,
  deleteDashboardAnalyticsData,
  getDashboardAnalyticsDataById,
} from "../controller/dashboardAnalytics.js";
import { Notes } from "../models/notes.js";
import { Feedback } from "../models/Feedback.js";
import multer from "multer";
import path from "path";
import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { uploadToS3 } from "../controller/uploadToS3.js";
import { loginUser, signupUser } from "../controller/userController.js";
import { sendMail } from "../controller/mailFunction.js";
import axios from "axios";
const ObjectId = mongoose.Types.ObjectId;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const upload = multer({
  dest: path.join(__dirname, "uploads/"),
});
const router = Router();

router.get("/", async (req, res) => {
  res.status(200).send("<h1>Welcome to Agino tech</h1>");
});

router.post("/signup", signupUser);
router.post("/login", loginUser);

router.post("/sendmail", authUser, upload.single("file"), async (req, res) => {
  const { to, subject, body } = req.body;

  // Validate required fields
  if (!to || !subject || !body) {
    return res
      .status(400)
      .send({ status: false, message: "All fields are required." });
  }

  // Validate email address
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.every(isValidEmail)) {
    return res
      .status(400)
      .send({ status: false, message: "Invalid email address(es)." });
  }

  // Validate file existence
  if (!req.file) {
    return res
      .status(400)
      .send({ status: false, message: "File is required." });
  }

  // Validate file type
  const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    fs.unlink(req.file.path, () => {}); // Clean up temporary file
    return res
      .status(400)
      .send({ status: false, message: "Invalid file type." });
  }

  const attachments = [
    {
      filename: req.file.originalname,
      path: req.file.path,
    },
  ];

  try {
    // Send email
    const result = await sendMail({
      to: recipients.join(","),
      subject,
      body,
      attachments,
    });

    // Clean up the temporary file
    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error("Error deleting file:", err);
      } else {
        console.log("Temporary file deleted.");
      }
    });

    res.status(200).send({
      status: true,
      message: "Email Sent. Please check your inbox.",
    });
  } catch (error) {
    // Delete the temporary file if sendMail fails
    fs.unlink(req.file.path, () => {});
    res.status(500).send({ status: false, message: error.message });
  }
});

router.post("/genericMailer", upload.single("file"), async (req, res) => {
  const { to, subject, body } = req.body;

  // Validate required fields
  if (!to || !subject || !body) {
    return res
      .status(400)
      .send({ status: false, message: "All fields are required." });
  }

  // Validate email address
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.every(isValidEmail)) {
    return res
      .status(400)
      .send({ status: false, message: "Invalid email address(es)." });
  }

  // Initialize the attachments array (empty if no file is uploaded)
  let attachments = [];

  // Validate file existence and type if file is uploaded
  if (req.file) {
    const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      fs.unlink(req.file.path, () => {}); // Clean up temporary file
      return res
        .status(400)
        .send({ status: false, message: "Invalid file type." });
    }

    attachments = [
      {
        filename: req.file.originalname,
        path: req.file.path,
      },
    ];
  }

  try {
    // Send email
    const result = await sendMail({
      to: recipients.join(","),
      subject,
      body,
      attachments, // Attachments will be an empty array if no file is provided
    });

    // Clean up the temporary file if it exists
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) {
          console.error("Error deleting file:", err);
        } else {
          console.log("Temporary file deleted.");
        }
      });
    }

    res.status(200).send({
      status: true,
      message: "Email Sent. Please check your inbox.",
    });
  } catch (error) {
    // Delete the temporary file if sendMail fails
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).send({ status: false, message: error.message });
  }
});

router.get("/auth/google", (req, res) => {
  console.log("inside auth google");
  console.log("Origin:", req.headers.origin);
  console.log(process.env.CLIENT_ID);
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&response_type=code&scope=profile email`;
  res.redirect(url);
  console.log("**********Done with this");
});

router.get(
  "/auth/google/callback",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "https://app.agino.tech");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
  },
  async (req, res) => {
    const { code } = req.query;
    console.log("inside auth google callback", req.headers.origin);

    try {
      // Exchange authorization code for access token
      const { data } = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code,
        redirect_uri: process.env.REDIRECT_URI,
        grant_type: "authorization_code",
      });

      const { access_token, id_token } = data;

      // Use access_token or id_token to fetch user profile
      const { data: profile } = await axios.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        {
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );

      // Code to handle user authentication and retrieval using the profile data
      console.log(profile); // For now, just log the profile data
      req.profile = profile;

      const existingUser = await User.findOne({ email: profile.email });
      if (existingUser) {
        loginUser(req, res);
      } else {
        signupUser(req, res);
      }
      //res.send('Login successful!');
    } catch (error) {
      console.error("Error:", error);
      res.redirect("/login");
    }
  }
);

router.post("/newMessage", authUser, async (req, res) => {
  try {
    const { message, sessionId, database, psid } = req.body;

    if (!message || !database || !psid) {
      return res
        .status(400)
        .send({ status: true, message: "Mandatory parameter missing" });
    }

    const userId = new ObjectId(req.token);
    let session_doc;
    if (!sessionId) {
      session_doc = await Session.create({
        userId: userId,
        psid,
        isActive: true,
      });
    } else {
      session_doc = await Session.findOne({ _id: sessionId });
    }
    const chat_history = await ChatLog.find({ sessionId });
    console.log("request message : ", message);

    const dbDetail = await fetchDbDetails({
      _id: new ObjectId(database),
      userId: userId,
    });
    console.log(dbDetail);
    if (!dbDetail.config) {
      res
        .status(500)
        .send({ error: "Server error", message: dbDetail.message });
    }
    const llm_model = {
      config: {
        model: process.env.OPENAI_MODEL,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
        apiKey: process.env.OPENAI_API_KEY,
      },
      usedLLM: process.env.LLM,
    };

    session_doc.input = message;
    session_doc.chat_history = chat_history;
    session_doc.dbDetail = dbDetail;
    session_doc.llm_model = llm_model;
    // Save the updated session document
    if (!sessionId) {
      await session_doc.save();
    } else {
      await Session.findOneAndUpdate(
        { _id: sessionId }, // Find by session ID
        { $set: { input: message } }, // Update the input field
        { new: true } // Return the updated document
      );
    }
    const response = await askQuestion(session_doc);

    const chatLogId = await ChatLog.create({
      userId: userId,
      psid,
      message: response.chat_history,
      sessionId: session_doc._id,
      context: {
        agent: response.agent ? response.agent : "",
        query_description: response.query_description
          ? response.query_description
          : "",
        followup: response.followup ? response.followup : "",
        SQL_query: response.SQL_query ? response.SQL_query : "",
        DB_response: response.DB_response ? response.DB_response : "",
        error: response.error ? response.error : "",
      },
    });

    if (response.error) {
      return res.status(400).send({
        message: "some error occured",
        sessionId: session_doc._id,
        chatLogId: chatLogId._id,
        agent: response.agent ? response.agent : "",
        query_description: response.query_description
          ? response.query_description
          : "",
        followup: response.followup ? response.followup : "",
        SQL_query: response.SQL_query ? response.SQL_query : "",
        DB_response: response.DB_response ? response.DB_response : "",
        error: response.error ? response.error : "",
      });
    }

    res.status(200).send({
      message: "Message processed successfully",
      sessionId: session_doc._id,
      chatLogId: chatLogId._id,
      agent: response.agent ? response.agent : "",
      query_description: response.query_description
        ? response.query_description
        : "",
      followup: response.followup ? response.followup : "",
      SQL_query: response.SQL_query ? response.SQL_query : "",
      DB_response: response.DB_response ? response.DB_response : "",
    });
  } catch (error) {
    console.error("Error processing message:", error);
    res.status(500).send({ error: "Server error", message: error });
  }
});

router.get("/databaseForm", authUser, async (req, res) => {
  try {
    const data = await dbConfigStr.find({});
    res.status(200).json({ status: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
});

router.post("/testConnection", authUser, async (req, res) => {
  try {
    const { host, server, database, username, password, dbtype } = req.body;

    if (!database || !username || !password || !dbtype) {
      return res
        .status(400)
        .send({ status: false, message: "Mandatory parameter missing" });
    }
    const dbDetail = {
      dbtype: dbtype.trim(),
    };
    dbDetail.config = {
      user: username.trim(),
      password: password.trim(),
      database: database.trim(),
    };
    if (host) {
      dbDetail.config.host = host.trim();
    } else {
      dbDetail.config.server = server.trim();
    }

    const result = await testConnection(dbDetail);
    if (result.connection) {
      res.status(200).send({
        status: true,
        message: "Database connected succesfully",
        table: result.table,
      });
    } else {
      res.status(400).send({ status: false, message: result.message });
    }
  } catch (error) {
    console.error(error);
  }
});

router.post("/database", authUser, async (req, res) => {
  try {
    const userId = new ObjectId(req.token);
    const {
      dbtype,
      host,
      server,
      database,
      username,
      password,
      schema,
      tableName,
    } = req.body;

    if (
      !dbtype ||
      !host ||
      !server ||
      !database ||
      !username ||
      !password ||
      !schema ||
      !tableName
    ) {
      return res
        .status(400)
        .send({ status: true, message: "Mandatory parameter missing" });
    }

    const data = {
      userId: userId,
      dbtype: dbtype,
      database: database,
      username: username,
      password: password,
      schema: schema,
      tableName: tableName,
    };
    if (host) {
      data.host = host;
    } else {
      data.server = server;
    }

    const pinconeData = await embedAndStoreSchema(data, data.schema);
    if (!pinconeData.status) {
      return res.status(500).send({
        status: true,
        message: "getting some error while saving database data",
        data: pinconeData.message,
      });
    }
    data.pincone = true;
    data.indexName = pinconeData.indexName;
    const document = new DatabaseCredentials(data);
    const dbDetail = await document.save();

    res.status(200).send({
      status: true,
      message: "Database saved succesfully",
      document: dbDetail,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      status: false,
      message: "Some error occured",
      data: error.message,
    });
  }
});

router.get("/database", authUser, async (req, res) => {
  try {
    const data = await DatabaseCredentials.find({});
    res.status(200).json({ status: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
});

router.get("/connecteddatabases", authUser, async (req, res) => {
  try {
    const userId = new ObjectId(req.token);
    const data = await DatabaseCredentials.find({ userId })
      .select("_id database tableName")
      .lean();
    res.status(200).json({ status: true, data: data });
  } catch (error) {
    console.error("Error fetching connected databases:", error);
    res
      .status(500)
      .json({ status: false, message: "Internal Server Error", error: error });
  }
});

router.get("/existingSheets", authUser, async (req, res) => {
  try {
    const userId = new ObjectId(req.token);

    const tables = await DatabaseCredentials.find({ userId: userId }).select({
      tableName: 1,
      database: 1,
      schema: 1,
    });

    res.status(200).send({
      status: true,
      message: "Existing sheets fetched successfully.",
      data: tables,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: false, message: err.message });
  }
});

router.post("/uploadSheet", authUser, upload.single("file"), sheetUpload);
router.delete("/uploadSheet", authUser, dropTableAndDeleteDbDetail);

router.get("/chatHistory", authUser, async (req, res) => {
  try {
    const userId = new ObjectId(req.token);

    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;

    const sessions = await Session.find({ userId: userId })
      .select({ _id: 1, psid: 1, startTime: 1, input: 1 })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Send response with the data
    res.status(200).json({ status: true, data: sessions });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

router.get("/chatlogBySessionId", authUser, async (req, res) => {
  try {
    const sessionId = new ObjectId(req.query.sessionId);

    const chatHistory = await ChatLog.find({ sessionId }).select({
      message: 1,
      context: 1,
    });
    return res.status(200).json({ status: true, data: chatHistory });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

router.post("/shopifyDetails", authUser, async (req, res) => {
  const { shopName, apiKey, apiSecret, shopLink, accessToken } = req.body;

  if (!shopName || !apiKey || !apiSecret || !shopLink || !accessToken) {
    return res.status(400).json({ error: "All fields are required" });
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

    res
      .status(201)
      .json({ message: "Shopify details saved successfully", shop: newShop });
  } catch (error) {
    console.error("Error saving Shopify details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/getSheet", authUser, async (req, res) => {
  try {
    const { chatLogId } = req.query;
    const data = await ChatLog.findOne({ _id: chatLogId });
    const url = await main(data.context.DB_response);
    res.status(200).send({
      status: true,
      message: "sheet generated successfully",
      url: url,
    });
  } catch (err) {
    res.status(500).send({ status: false, message: err.message });
  }
});

router.post("/graphData", async (req, res) => {
  try {
    const { xaxis, yaxis1, yaxis2, chatLogId } = req.body;

    if (!xaxis || !yaxis1 || !chatLogId) {
      return res
        .status(400)
        .send({ status: true, message: "Mandatory parameter missing" });
    }

    const chatlogId = new ObjectId(chatLogId);

    const data = (await ChatLog.findOne({ _id: chatlogId }).lean()).context
      .DB_response;

    const structuredData = {
      labels: data.map((row) => row[xaxis]),
      datasets: [
        {
          label: yaxis1,
          data: data.map((row) => row[yaxis1]),
          fill: false, // For line charts to disable filling under the line
          yAxisID: "y-axis-1", // If you have multiple y-axes,
          borderColor: "rgba(255, 99, 132, 1)", // Red border color
          backgroundColor: "rgba(255, 99, 132, 0.2)", // Red background color with opacity
        },
      ],
    };

    if (yaxis2) {
      structuredData.datasets.push({
        label: yaxis2,
        data: yaxis2 ? data.map((row) => row[yaxis2]) : [],
        fill: false,
        yAxisID: "y-axis-2",
        borderColor: "rgba(54, 162, 235, 1)", // Blue border color
        backgroundColor: "rgba(54, 162, 235, 0.2)", // Blue background color with opacity
      });
    }

    // Clean undefined keys if xaxis2 is not provided
    Object.keys(structuredData).forEach((key) => {
      if (!structuredData[key]) {
        delete structuredData[key];
      }
    });

    res.status(200).send({
      status: true,
      message: "Graph data generated",
      data: structuredData,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: false, message: err.message });
  }
});

router.post("/api/notes", authUser, async (req, res) => {
  try {
    const { title, content, discription } = req.body;
    const userId = new ObjectId(req.token);

    if (!title || !content) {
      return res
        .status(400)
        .send({ status: false, message: "Mandatory parameter missing" });
    }

    const newNote = new Notes({
      userId,
      title,
      content,
      discription: discription ? discription : "",
    });
    const savedNote = await newNote.save();
    console.log("Saved Note:", savedNote);
    res
      .status(201)
      .send({ status: true, message: "Note saved", data: savedNote });
  } catch (err) {
    console.error("Error creating note:", err);
    res.status(500).json({
      status: false,
      message: "Failed to create note",
      error: err.message,
    });
  }
});

router.put("/api/notes/:id", authUser, async (req, res) => {
  try {
    const { title, content, discription } = req.body;
    const userId = new ObjectId(req.token);
    console.log("PUT Request Body:", req.body);

    const updatedNote = await Notes.findByIdAndUpdate(
      req.params.id,
      { userId, title, content, discription },
      { new: true }
    );
    if (!updatedNote) {
      return res.status(404).json({ message: "Note not found" });
    }
    console.log("Updated Note:", updatedNote);
    res
      .status(201)
      .send({ status: true, message: "Note update", data: updatedNote });
  } catch (err) {
    console.error("Error updating note:", err);
    res.status(500).json({
      status: false,
      message: "Failed to update note",
      error: err.message,
    });
  }
});

router.get("/api/notes/:id", authUser, async (req, res) => {
  try {
    const note = await Notes.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }
    res
      .status(200)
      .send({ status: true, message: "notes details by id", data: note });
  } catch (err) {
    console.error("Error fetching note:", err);
    res.status(500).json({
      status: false,
      message: "Failed to fetch note",
      error: err.message,
    });
  }
});

router.get("/api/notes", authUser, async (req, res) => {
  try {
    const userId = new ObjectId(req.token);
    const notes = await Notes.find({ userId });
    res.status(200).send({
      status: true,
      message: "all the notes of perticular user",
      data: notes,
    });
  } catch (err) {
    console.error("Error fetching notes:", err);
    res.status(500).json({
      status: false,
      message: "Failed to fetch notes",
      error: err.message,
    });
  }
});

// Endpoint for adding feedback

router.post("/api/feedback", authUser, async (req, res) => {
  try {
    const userId = new ObjectId(req.token);
    const { feedback, image, rating } = req.body;

    // Check for mandatory parameters
    if (!feedback || !rating) {
      return res.status(400).send({
        status: false,
        message: "Mandatory parameter missing",
      });
    }
    let imageUrl = "";
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      const fileName = `feedback_images/${userId}_${Date.now()}.jpeg`;

      const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: fileName,
        fileContent: buffer,
        ContentType: "image/jpeg",
        ACL: "public-read",
      };

      try {
        imageUrl = await uploadToS3(params);
      } catch (error) {
        return res.status(500).send({
          status: false,
          message: "Failed to upload image",
          error: error.message,
        });
      }
    }

    const newFeedback = new Feedback({
      userId,
      rating,
      feedback,
      image: imageUrl,
    });

    const savedFeedback = await newFeedback.save();
    return res.status(201).send({
      status: true,
      message: "Feedback submitted successfully",
      data: savedFeedback,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      status: false,
      message: "Failed to submit feedback",
      error: error.message,
    });
  }
});

//***********************************//
//***Endpoints for Admin Dashboard***//
//***********************************//

// Fetch all users
router.get("/api/admin/getusers", authUser, async (req, res) => {
  try {
    const users = await User.find(); // Fetch all users from the User collection
    console.log(users);
    res.status(200).send({ status: true, data: users }); // Send the users in the response
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({
      status: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
});

// Toggle user verification
router.put("/api/admin/verifyuser/:id", authUser, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: false, message: "User not found" });
    }

    user.isVerified = !user.isVerified;

    const updatedUser = await user.save();

    res.status(200).send({
      status: true,
      message: "User verification status updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error toggling user verification:", error);
    res.status(500).send({
      status: false,
      message: "Failed to toggle user verification",
      error: error.message,
    });
  }
});

router.get("/api/admin/feedback", authUser, async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const pageInt = parseInt(page);
    const pageSizeInt = parseInt(pageSize);

    const feedbacks = await Feedback.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $unwind: {
          path: "$userInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          feedback: 1,
          rating: 1,
          image: 1,
          createdAt: 1,
          email: "$userInfo.email",
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: (pageInt - 1) * pageSizeInt,
      },
      {
        $limit: pageSizeInt,
      },
    ]);
    const totalCount = await Feedback.countDocuments();
    return res.status(200).send({
      status: true,
      data: feedbacks,
      pagination: {
        totalItems: totalCount,
        currentPage: pageInt,
        pageSize: pageSizeInt,
        totalPages: Math.ceil(totalCount / pageSizeInt),
      },
    });
  } catch (error) {
    return res.status(500).send({
      status: false,
      message: "Failed to retrieve feedbacks",
      error: error.message,
    });
  }
});

//****************************************//
//***Endpoints for Analytics Dashboard****//
//****************************************//

router.post("/dashboardAnalytics", authUser, saveDashboardAnalyticsData);

router.get(
  "/dashboardAnalytics/:database",
  authUser,
  getDashboardAnalyticsData
);

router.get(
  "/dashboardAnalytics/:id/:database",
  authUser,
  getDashboardAnalyticsDataById
);

router.put("/dashboardAnalytics", authUser, updateDashboardAnalyticsData);

router.delete(
  "/dashboardAnalytics/:id",
  authUser,
  deleteDashboardAnalyticsData
);

export { router };
