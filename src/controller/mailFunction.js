import nodemailer from "nodemailer";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Create a transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends an email with the given mail details.
 * @param {Object} mailDetails - The email details.
 * @param {string} mailDetails.to - Recipient email address.
 * @param {string} mailDetails.subject - Email subject.
 * @param {string} mailDetails.body - Email body content (can be HTML or plain text).
 * @param {Array<Object>} [mailDetails.attachments] - Optional email attachments.
 * @returns {Promise<string>} - Promise resolving to success message or error.
 */
export const sendMail = async ({ to, subject, body, attachments }) => {
  if (!to || !subject || !body) {
    throw new Error("Missing required fields: to, subject, or body.");
  }

  // Setup mail options
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text: body, // Use `text` for plain text or use `html` for HTML content
    html: body, // If you want to send HTML content, use the `html` property.
    attachments: attachments || [], // Ensure attachments defaults to an empty array if not provided
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return `Email sent: ${info.response}`;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email.");
  }
};
