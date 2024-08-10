import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // encrypted password
    //dbType : {type:String},
    llmModel:{type:String,default : 'openAI'}
  },
  { timestamps: true }
);

const User =   mongoose.model('User', userSchema);
export{User}