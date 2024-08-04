// models/session.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const sessionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  psid: { type: String, required: true },
  startTime: {
    type: Date,
    default: Date.now,
    required: true
  },
  endTime: {
    type: Date
  },
  context: {
    type: Schema.Types.Mixed,
    default: {}
  },
  isActive : {
    type : Boolean,
    default:true
  },
  chat_history:{
    type:Array,
    default : []
  }

});

const Session = mongoose.model('Session', sessionSchema);

export {Session} ;
