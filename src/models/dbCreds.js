// models/databaseCreds.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const databaseCredentialsSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dbtype: {
    type: String,
    required: true
  },
  host: {
    type: String
  },
  server: {
    type: String
  },
  database: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  schema:{
    type:Object,
    default:{}
  },
  aliasName: {
    type: String,
    required: true
  },
  isPincone:{
    type: Boolean,
    default: false
  },
  indexName:{
    type: String
  }
},{ timestamps: true });

const DatabaseCredentials = mongoose.model('DatabaseCredentials', databaseCredentialsSchema);

export  {DatabaseCredentials};
