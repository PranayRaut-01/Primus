import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import crypto from "crypto"; // Importing crypto
import moment from "moment"; // Importing moment
import { TwoFACode } from "../models/TwoFACode.js"; // Import the 2FA model
import { User } from "../models/user.js"; // Import the User model

dotenv.config();

// Helper function to send an email with the 2FA code
const send2FACodeEmail = async (email, code) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Define the fallback HTML body with placeholders for the code and expiration time
  const fallbackHtml = ` <html>
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
                  .container {
                  background-color: #ffffff;
                  border-radius: 8px;
                  padding: 30px;
                  width: 350px;
                  text-align: center;
                  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                  }
                  h2 {
                  font-size: 28px;
                  color: #333;
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
                  }
                  .footer {
                  font-size: 12px;
                  color: #999;
                  margin-top: 30px;
                  }
                  .highlight {
                  color: #28a745;
                  font-weight: bold;
                  }
              </style>
              </head>
              <body>
              <div class="container">
                  <h2>🎉 Welcome to Agino! 🎉</h2>
                  <p>You're just one step away from accessing your account!</p>
                  <p>To complete your verification, please use the following 2FA code:</p>
                  <div class="code">${code}</div>
                  <p>This code will expire at <strong class="highlight">{{expirationTime}}</strong>.</p>
                  <p>Enter it quickly to finish setting up your account!</p>
                <div class="footer">
                <p>Thank you for choosing Agino!</p>
                <p>If you didn’t request this, please ignore this email.</p>
                <p>Visit us at <a href="https://agino.tech" style="color: #28a745; text-decoration: none; font-weight: bold;">agino.tech</a></p>
                </div>
              </div>
              </body>
          </html>`;

  // Replace the placeholder {{expirationTime}} with the actual expiration time
  const emailBody = fallbackHtml.replace(
    /{{expirationTime}}/g,
    moment().add(5, "minutes").format("HH:mm, YYYY-MM-DD")
  );

  try {
    await transporter.sendMail({
      from: '"Experience Agino" <support@agino.com>',
      to: email,
      subject: "Your 2FA Verification Code",
      html: emailBody, // Send the email with the updated content
    });
    console.log("2FA email sent successfully!");
  } catch (err) {
    console.error("Error sending email:", err);
  }
};

// Controller function to send the 2FA code to the user's email
export const sendTwoFactorAuthEmail = async (req, res) => {
  const { email } = req.body;

  try {
    // Generate a random 6-digit verification code
    const code = crypto.randomInt(100000, 999999).toString();

    // Set the expiration time (e.g., 5 minutes)
    const expirationTime = moment().add(5, "minutes").toISOString();

    // Hash the code before storing it
    const hashedCode = await bcrypt.hash(code, 10);

    // Delete any existing 2FA code for this email address
    await TwoFACode.findOneAndDelete({ email });

    // Save the new 2FA code and expiration time in the database
    const twoFACode = new TwoFACode({
      email,
      codeHash: hashedCode,
      expiresAt: expirationTime,
    });

    await twoFACode.save();

    // Send the email with the verification code
    await send2FACodeEmail(email, code);

    // Respond back with success message
    res
      .status(200)
      .send({ status: true, message: "2FA email sent successfully." });
  } catch (error) {
    console.error("Error sending email:", error);
    res
      .status(500)
      .send({ status: false, message: "Failed to send 2FA email." });
  }
};

export const verify2FACode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).send({ message: "Email and code are required." });
  }

  try {
    const twoFACode = await TwoFACode.findOne({ email });

    if (!twoFACode) {
      return res
        .status(400)
        .send({ message: "No 2FA code found for this email." });
    }

    if (twoFACode.expiresAt < new Date()) {
      return res
        .status(400)
        .send({ message: "Verification code has expired." });
    }

    const isCodeValid = await bcrypt.compare(code, twoFACode.codeHash);

    if (isCodeValid) {
      // Update the user's isVerified field to true
      const user = await User.findOne({ email });
      if (user) {
        user.isVerified = true;
        await user.save(); // Save the updated user document
      }

      // Optionally delete the 2FA code after successful verification
      await TwoFACode.findOneAndDelete({ email });

      return res.status(200).send({
        message: "2FA code verified successfully. User is now verified.",
      });
    } else {
      return res.status(400).send({ message: "Invalid verification code." });
    }
  } catch (error) {
    console.error("Error verifying 2FA code:", error);
    res.status(500).send({ message: "Failed to verify the code." });
  }
};
