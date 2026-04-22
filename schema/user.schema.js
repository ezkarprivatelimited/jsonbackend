const mongoose = require('mongoose');
const fileSchema = require('./file.schema');
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    subsValid: { type: Date, default: Date.now },
    refreshToken: { type: String },
    files: {
        type: [fileSchema],
        default: []
    }
}, { timestamps: true })
module.exports = mongoose.model('User', userSchema);