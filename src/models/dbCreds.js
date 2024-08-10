// models/databaseCreds.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const databaseCredentialsSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  databaseType: {
    type: String,
    enum: ['mysql', 'mongodb'], // Add more types as needed
    required: true
  },
  host: {
    type: String,
    required: true
  },
  port: {
    type: Number
  },
  serverIp: {
    type: Number,
    required:true
  },
  databaseName: {
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
  }
});

const DatabaseCredentials = mongoose.model('DatabaseCredentials', databaseCredentialsSchema);

export  {DatabaseCredentials};
