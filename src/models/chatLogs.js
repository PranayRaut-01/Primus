// models/chatLog.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const chatLogSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    sender : {
        type : String,
        Enum :["customer", "AIagent"]
    },
    psid: { type: String, required: true },
    sessionId : {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Session'
    },
    message: {
        type: String,
        required: true
    },
    context: {
        type: Schema.Types.Mixed,
        default: {}
    }
});

const ChatLog = mongoose.model('ChatLog', chatLogSchema);

export  {ChatLog};
