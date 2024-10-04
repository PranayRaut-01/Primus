import mongoose from 'mongoose';

const FeedbackSchema = new mongoose.Schema(
  {
    feedback: { type: String, required: true },
    image: { type: String },
  },
  { timestamps: true }
);

const Feedback =   mongoose.model('Feedback', FeedbackSchema);

export{Feedback}