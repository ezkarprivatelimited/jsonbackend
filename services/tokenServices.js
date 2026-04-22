const jwt = require("jsonwebtoken");
const User = require("../schema/user.schema.js");
const bcrypt = require("bcrypt");
const JWT_ACCESSTOKEN_SECRET = process.env.JWT_ACCESSTOKEN_SECRET;
const JWT_REFRESHTOKEN_SECRET = process.env.JWT_REFRESHTOKEN_SECRET;
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN;

const generateAccessToken = (payload) => {
  return jwt.sign(payload , JWT_ACCESSTOKEN_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  });
};
const generateRefreshToken = async (payload) => {
  const refreshToken = jwt.sign(payload, JWT_REFRESHTOKEN_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
  const hashToken = await bcrypt.hash(refreshToken, 10);
  await User.findByIdAndUpdate(payload.id, { refreshToken: hashToken });
  return refreshToken;
};
const verifyRefreshToken = async (refreshToken) => {
  if (!refreshToken) return false;
  try {
    let decode;
    try {
      decode =jwt.verify(refreshToken, JWT_REFRESHTOKEN_SECRET);
    } catch (e) {
      return false;
    }
    // console.log(decode)
    const user = await User.findById(decode.id);
    const ismatch = bcrypt.compare(refreshToken, user.refreshToken);
    if (!ismatch) return false;
    return user;
  } catch (e) {
    return false;
  }
};
const clearRefreshToken = async (id) => {
  await User.findByIdAndUpdate(id, { refreshToken: null });
};
module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  clearRefreshToken,
};
