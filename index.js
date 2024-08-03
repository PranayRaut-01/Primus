// app.mjs

import express from 'express';
import bodyParser from 'body-parser';
import route from './src/routes/routes.js'; // Note the .mjs extension for modules
import mongoose from 'mongoose';

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

///////////////// [ MONGO-DB CONNECTION ] /////////////////
mongoose.connect("mongodb+srv://pranayraut17:Qwe1rty%401@cluster0.cywhhsf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("MongoDb is connected"))
    .catch(err => console.log(err))

///////////////// [ ROOT API ] /////////////////
app.use('/', route);

///////////////// [ SERVER CONNECTION ] /////////////////
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Express app running on port ${PORT}`);
});
