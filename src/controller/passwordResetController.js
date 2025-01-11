import bcrypt from "bcryptjs";
import moment from "moment";
import { User } from "../models/user.js";
import { TwoFACode } from "../models/TwoFACode.js";
import nodemailer from "nodemailer";

// Helper function to send 2FA email
const send2FACodeEmail = async (email, code) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlBody = `
    <html>
    <head>
        <style>
        body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .email-container {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 30px;
            width: 350px;
            text-align: center;
            background-color: #ffffff;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            margin: 20px;
        }
        h2 {
            font-size: 24px;
            color: #333;
            margin-bottom: 10px;
        }
        h3 {
            font-size: 18px;
            color: #333;
            margin-top: 0;
            font-weight: normal;
        }
        .code {
            font-size: 36px;
            font-weight: bold;
            color: #333;
            letter-spacing: 2px;
            margin: 20px 0;
            padding: 10px 20px;
            background-color: #28a745;
            color: white;
            border-radius: 5px;
        }
        p {
            color: #666;
            font-size: 14px;
            margin-top: 10px;
        }
        .footer {
            font-size: 12px;
            color: #999;
            margin-top: 30px;
        }
        .footer i {
            font-style: italic;
        }
        </style>
    </head>
    <body>
        <div class="email-container">
        <h2>Welcome to <span style="color: #28a745;">Agino</span></h2>
        <h3>Your AI-Driven Data Analyst!</h3>
        <p style="color: #333; font-size: 16px;">To reset your password, use the 2FA code below:</p>
        <div class="code">${code}</div>
        <p>This code will expire in 10 minutes.</p>
        <div class="footer">
                <p>Thank you for choosing Agino!</p>
                <p>If you didn’t request this, please ignore this email.</p>
                <p>Visit us at <a href="https://agino.tech" style="color: #28a745; text-decoration: none; font-weight: bold;">agino.tech</a></p>
                </div>
        </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: '"Experience Agino" <support@agino.com>',
    to: email,
    subject: "Your 2FA Verification Code",
    html: htmlBody,
  });
};

// Controller function to send 2FA code (for password reset)
export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: "Email is required." });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).send({ message: "User not found." });
  }

  // Generate a new 2FA code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = await bcrypt.hash(code, 10);
  const expirationTime = moment().add(10, "minutes").toISOString(); // Code expires in 10 minutes

  // Save the 2FA code and expiration time in the database
  await TwoFACode.findOneAndUpdate(
    { email },
    { codeHash, expiresAt: expirationTime },
    { upsert: true }
  );

  // Send the 2FA code via email
  send2FACodeEmail(email, code);

  return res.status(200).send({ message: "2FA code sent to your email." });
};

// Controller function to verify 2FA code and reset password
export const verify2FACodeAndResetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res
      .status(400)
      .send({ message: "Email, code, and new password are required." });
  }

  // Retrieve the stored 2FA code from the database
  const twoFACode = await TwoFACode.findOne({ email });
  if (!twoFACode) {
    return res
      .status(400)
      .send({ message: "No 2FA code found for this email." });
  }

  // Check if the code has expired
  if (twoFACode.expiresAt < new Date()) {
    return res.status(400).send({ message: "Verification code has expired." });
  }

  // Check if the code matches the stored hash
  const isCodeValid = await bcrypt.compare(code, twoFACode.codeHash);
  if (!isCodeValid) {
    return res.status(400).send({ message: "Invalid verification code." });
  }

  // Hash the new password and update it in the User model
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await User.findOneAndUpdate({ email }, { password: hashedPassword });

  // Optionally, delete the 2FA code after successful verification
  await TwoFACode.findOneAndDelete({ email });

  return res.status(200).send({ message: "Password reset successfully." });
};
