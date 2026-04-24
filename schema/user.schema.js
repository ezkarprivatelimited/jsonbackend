const mongoose = require("mongoose");
const fileSchema = require("./file.schema");
const userSchema = new mongoose.Schema(
	{
		email: { type: String, required: true, unique: true },
		gstin: { type: String },
		password: { type: String, required: true },
		role: {
			type: String,
			enum: ["admin", "trader", "manufacturer"],
			default: "trader",
		},
		phone: { type: String },
		address: { type: String },
		name: { type: String, required: true },
		isActive: { type: Boolean, default: true },
		subsValid: {
			type: Date,
			default: () => Date.now() + 10 * 24 * 60 * 60 * 1000,
		},
		refreshToken: { type: String },
		files: {
			type: [fileSchema],
			default: [],
		},
	},
	{ timestamps: true },
);
module.exports = mongoose.model("User", userSchema);
