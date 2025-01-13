import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: false }, // Optional for Google SSO users
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false }, // Optional for Google SSO users
    googleId: { type: String, unique: true, sparse: true }, // Unique Google ID for SSO users
    llmModel: { type: String, default: "openAI" },
    isVerified: { type: Boolean, default: true },
    isNewUser: { type: Boolean, default: true },
    userPreference: { type: Object, default: {} },
    profile: { type: Object, default: {} },
    phoneNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export { User };
