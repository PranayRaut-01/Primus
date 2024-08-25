// models/chatLog.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const chatLogSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    psid: { type: String, required: true },
    sessionId : {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Session'
    },
    message: {
        type: Object,
        required: true
    },
    context: {
        type: Schema.Types.Mixed,
        default: {}
    }
},{ timestamps: true });

const ChatLog = mongoose.model('ChatLog', chatLogSchema);

export  {ChatLog};
