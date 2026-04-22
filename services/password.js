const argon2 = require("argon2");

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 4,   
  parallelism: 2,
};
async function hashPassword(password) {
  if (!password) throw new Error("Password is required");

  try {
    const hash = await argon2.hash(password, ARGON2_OPTIONS);
    return hash;
  } catch (error) {
    console.error("Failed to hash password:", error);
    return null;
  }
}
async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  try {
    return await argon2.verify(storedHash, password);
  } catch (error) {
    console.error("Failed to verify password:", error);
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
};
