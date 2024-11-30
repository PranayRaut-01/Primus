import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
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
 * @param {string} mailDetails.text - Email text content.
 * @returns {Promise<string>} - Promise resolving to success message or error.
 */
export const sendMail = async ({ to, subject, text ,attachments }) => {
  if (!to || !subject || !text) {
    throw new Error('Missing required fields: to, subject, or text.');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    attachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return `Email sent: ${info.response}`;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email.');
  }
};
