const jwt = require("jsonwebtoken");
const User = require("../schema/user.schema.js");
const { verifyPassword } = require("../services/password");
const {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    clearRefreshToken,
} = require("../services/tokenServices.js");

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res
                .status(400)
                .json({ message: "Email and password are required" });
        }
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }
        if (user.isActive === false) {
            return res.status(403).json({
                message: `Sorry! you're now not part of the orgainzion contact your admin.`,
            });
        }
        const isPasswordMatch = await verifyPassword(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Invalid password or email" });
        }
        const payload = {
            id: String(user._id),
            role: user.role,
        };
        const refreshTokenPayload = {
            id: String(user._id),
            role: user.role,
        };
        const accessToken = generateAccessToken(payload);
        const refreshToken = await generateRefreshToken(refreshTokenPayload);
        res.clearCookie("json-ref", {
            domain: "localhost",
            path: "/",
            httpOnly: false,
            secure: false,
            sameSite: "lax",
        });
        res.clearCookie("json-access", {
            domain: "localhost",
            path: "/",
            httpOnly: false,
            secure: false,
            sameSite: "lax",
        });
        res.cookie("json-access", accessToken, {
            path: "/",
            domain: "localhost",
            httpOnly: false,
            secure: false,
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000,
        });
        res.cookie("json-ref", refreshToken, {
            path: "/",
            domain: "localhost",
            httpOnly: false,
            secure: false,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            user: {
                id: user.id,
                role: user.role,
            },
        });
    } catch (e) {
        res.status(500).json({ message: `Internal Server Error ${e}` });
    }
};
exports.me = async (req, res) => {
    try {
        const { id } = req.user;
        const user = await User.findById(id).select("-password -refreshToken");
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json({ success: true, user });
    } catch (e) {
        res.status(500).json({ message: `Internal Server Error ${e}` });
    }
};
exports.refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies["json-ref"];
        if (!refreshToken) {
            return res.status(401).json("No Refresh Token found");
        }

        const tokenData = await verifyRefreshToken(refreshToken);
        if (!tokenData) {
            return res
                .status(401)
                .json({ message: `Access token is expired or user not found` });
        }
        const foundUser = await User.findById(tokenData.id);
        if (!foundUser) return res.status(404).json({ message: "User not found" });

        const payload = {
            id: String(foundUser._id),
            role: foundUser.role,
        };
        const refreshTokenPayload = {
            id: String(foundUser._id),
            role: foundUser.role,
        };
        const newAccessToken = generateAccessToken(payload);
        const newRefreshToken = await generateRefreshToken(refreshTokenPayload);

        res.cookie("json-ref", newRefreshToken, {
            path: "/",
            domain: "localhost",
            httpOnly: false,
            secure: false,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: { id: foundUser.id, role: foundUser.role },
        });
    } catch (error) {
        res.status(500).json({ message: `Internal Server Error ${error}` });
    }
};
exports.logout = async (req, res) => {
    try {
        const refreshToken = req.cookies?.["json-ref"];
        if (!refreshToken) {
            return res.status(400).json({ message: "No refresh token found" });
        }
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESHTOKEN_SECRET);
        } catch (err) {
            return res
                .status(401)
                .json({ message: "Invalid or expired refresh token" });
        }
        await clearRefreshToken(decoded.id);
        res.clearCookie("json-ref", {
            domain: "localhost",
            httpOnly: true,
            secure: true,
            sameSite: "None",
        });
        res.clearCookie("json-access", {
            domain: "localhost",
            httpOnly: true,
            secure: true,
            sameSite: "None",
        });

        return res.status(200).json({ message: "User logged out successfully" });
    } catch (error) {
        console.error("Logout error:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};