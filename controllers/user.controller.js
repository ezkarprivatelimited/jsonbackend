const User = require("../schema/user.schema.js");
const { hashPassword } = require("../services/password");
const mongoose = require("mongoose");
exports.createUser = async (req, res) => {
    try {
        const { email, password, role, name } = req.body;
        if (!email || !password || !role || !name) {
            return res.status(400).json({ message: "Email, password, role and name are required" });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }
        const allowedRoles = ["admin", "user"];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: `Invalid role. Allowed roles: ${allowedRoles.join(", ")}` });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email is already in use" });
        }
        const hashedPassword = await hashPassword(password);
        const user = await User.create({ email, password: hashedPassword, role, name });
        const { password: _, ...safeUser } = user.toObject();
        res.status(201).json({ message: "User created successfully", user: safeUser });
    } catch (error) {
        console.error("User creation error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user ID format" });
        }
        const { email, password, role, subsValid, isActive } = req.body;
        const updateQuery = {};
        if (email) {
            updateQuery.email = email;
        }
        if (password) {
            updateQuery.password = await hashPassword(password);
        }
        if (role) {
            updateQuery.role = role;
        }
        if (subsValid) {
            updateQuery.subsValid = new Date(subsValid);
        }
        if (isActive !== undefined) {
            updateQuery.isActive = isActive;
        }
        const user = await User.findByIdAndUpdate(id, updateQuery, { new: true });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: "User updated successfully", user });
    } catch (error) {
        console.error("User update error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.user;
        const user = await User.findByIdAndDelete(id);
        res.status(200).json({ message: "User deleted successfully", user });
    } catch (error) {
        console.error("User deletion error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error("User retrieval error:", error);
        res.status(500).json({success: false, message: `Internal Server Error ${error}`});
    }
};