import mongoose from 'mongoose';
const { Schema } = mongoose;

const FeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    rating:{type: String,required:true},
    feedback: { type: String, required: true },
    image: { type: String },
  },
  { timestamps: true }
);

const Feedback =   mongoose.model('Feedback', FeedbackSchema);

export{Feedback}