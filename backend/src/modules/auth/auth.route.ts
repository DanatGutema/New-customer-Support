import { Router } from "express";
import { AccountLockoutGuard } from "../../middleware/rateLimiter";
import { authenticateToken } from "../../middleware/auth.middleware";
import { forgotPassword, login, logout, logoutAll, refresh, resetPassword, requestSigninHelp } from "./auth.controller";
import rateLimit from "express-rate-limit";


const router = Router();


const refreshLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.post("/refresh", refreshLimiter, refresh);
router.post("/logout-all", authenticateToken, logoutAll);


router.post("/login", AccountLockoutGuard, login);
router.post("/signin-help", requestSigninHelp);
router.post("/logout", logout);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword", resetPassword);

export const AuthRoutes = router;
