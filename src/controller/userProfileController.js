import { User } from "../models/user.js";
import { Feedback } from "../models/Feedback.js";
import mongoose from "mongoose";
const ObjectId = mongoose.Types.ObjectId;

// Fetch all details of a user
const getUserDetails = async (req, res) => {
  try {
    const userId = new ObjectId(req.token);

    if (!userId) {
      return res
        .status(400)
        .json({ status: false, message: "User ID is required" });
    }

    // Fetch user details with selected fields
    const user = await User.findById(userId).select(
      "createdAt updatedAt email username phoneNumber userPreference profile"
    );

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    res.status(200).json({
      status: true,
      message: "User details fetched successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// Update user's name, profile picture, and phone number
const updateUserProfile = async (req, res) => {
  try {
    const userId = new ObjectId(req.token); // Extract userID from route params
    const { username, profilePicture, phoneNumber } = req.body; // Fields to update

    if (!userId) {
      return res
        .status(400)
        .json({ status: false, message: "User ID is required" });
    }

    // Check if user exists and update only if present
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        ...(username && { username }), // Update username if provided
        ...(profilePicture && { "profile.profilePicture": profilePicture }), // Update profile picture if provided
        ...(phoneNumber && { phoneNumber }), // Update phone number if provided
      },
      { new: true } // Return the updated document
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ status: false, message: "User not found, no changes made" });
    }

    res.status(200).json({
      status: true,
      message: "User profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// Fetch all feedbacks submitted by the user
const getUserFeedbacks = async (req, res) => {
  try {
    const userId = new ObjectId(req.token);

    if (!userId) {
      return res
        .status(400)
        .json({ status: false, message: "User ID is required" });
    }

    // Find feedbacks associated with the userID
    const feedbacks = await Feedback.find({ userId }).populate(
      "userId",
      "username email"
    ); // Optional: Populate user details

    res.status(200).json({
      status: true,
      message: "Feedbacks fetched successfully",
      data: feedbacks,
    });
  } catch (error) {
    console.error("Error fetching user feedbacks:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// Combined controller

export { updateUserProfile, getUserFeedbacks, getUserDetails };
