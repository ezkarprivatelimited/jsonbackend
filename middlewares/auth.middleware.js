const jwt = require("jsonwebtoken");
exports.authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    } else if (req.cookies?.["json-access"]) {
        token = req.cookies["json-access"];
    }
    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }
    jwt.verify(token, process.env.JWT_ACCESSTOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.error("JWT error:", err.message);
            return res.status(403).json({ message: "Invalid or expired token" });
        }
        req.user = decoded;
        next();
    });
};
exports.authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!allowedRoles || allowedRoles.length === 0) {
                return res.status(403).json({ message: "Forbidden: No roles configured for this route." });
            }
            if (!req.user) {
                return res.status(401).json({ message: "Authentication required. Please login." });
            }
            const userRole = req.user.role?.toLowerCase();
            const normalizedRoles = allowedRoles.map((r) => r.toLowerCase());
            if (!normalizedRoles.includes(userRole)) {
                return res.status(403).json({
                    message: "Forbidden: You do not have access.",
                });
            }
            next();
        } catch (error) {
            console.error(`Auth Error [${req.ip}]:`, error.message);
            return res.status(401).json({ message: "Authorization failed." });
        }
    };
};