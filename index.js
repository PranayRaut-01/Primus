// app.mjs

import express from 'express';
import bodyParser from 'body-parser';
import { router } from './src/routes/routes.js'; // Note the .mjs extension for modules
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
dotenv.config();

import { dbConfigStr } from './src/models/dbConfigStr.js'

const app = express();
// app.use(cors());

// app.use(cors({
//     origin: 'https://app.agino.tech', // Update to your frontend URL
//     methods: 'GET,POST', // specify allowed methods
//     allowedHeaders: 'Content-Type,Authorization', // specify allowed headers
//     credentials: true, // enable cookies
// }));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

///////////////// [ MONGO-DB CONNECTION ] /////////////////
mongoose.connect(process.env.MONGODB_URI)
    .then(async() => {
        console.log("MongoDb is connected")
    })
    .catch(err => console.log(err))

///////////////// [ ROOT API ] /////////////////
app.use('/', router);



///////////////// [ SERVER CONNECTION ] /////////////////
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Express app running on port ${PORT}`);
});
