import mongoose from "mongoose";

const twoFACodeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

const TwoFACode = mongoose.model("TwoFACode", twoFACodeSchema);

export { TwoFACode };
