// models/databaseCreds.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const notesSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title:{
    type: String,
    required: true
  },
  content:{
    type: String,
    required: true
  },
  discription:{
    type: String
  }
},{ timestamps: true });

const Notes = mongoose.model('Notes', notesSchema);

export  {
    Notes
}
