const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
	filename: { type: String, required: true },
	originalname: { type: String },
	path: { type: String, required: true },
	size: { type: Number },
	mimetype: { type: String },
},{timestamps: true});

module.exports = fileSchema;
