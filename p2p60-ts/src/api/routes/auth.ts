import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { createUser, findUserByEmail, verifyPassword } from "../../services/userService.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/auth.js";
import { HttpError, wrapAsync } from "../../utils/errors.js";
import speakeasy from "speakeasy";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../../config.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
});

router.post(
  "/register",
  wrapAsync(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    const exists = await findUserByEmail(db, payload.email);
    if (exists) throw new HttpError(400, "Email already exists");
    const userId = await createUser(db, payload);
    const accessToken = signAccessToken({ userId });
    const refreshToken = signRefreshToken({ userId });
    res.json({ accessToken, refreshToken });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  twofaCode: z.string().optional(),
});

router.post(
  "/login",
  wrapAsync(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const user = await findUserByEmail(db, payload.email);
    if (!user) throw new HttpError(401, "Invalid credentials");
    const ok = await verifyPassword(payload.password, user.password_hash);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    if (user.twofa_enabled) {
      const verified = speakeasy.totp.verify({
        secret: user.twofa_secret,
        encoding: "base32",
        token: payload.twofaCode ?? "",
      });
      if (!verified) throw new HttpError(401, "Invalid 2FA code");
    }

    const accessToken = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });
    res.json({ accessToken, refreshToken });
  })
);

router.post(
  "/refresh",
  wrapAsync(async (req, res) => {
    const token = req.body.refreshToken;
    if (!token) throw new HttpError(401, "Missing refresh token");
    const payload = verifyRefreshToken(token);
    const accessToken = signAccessToken({ userId: payload.userId });
    res.json({ accessToken });
  })
);

router.post(
  "/2fa/setup",
  requireAuth,
  wrapAsync(async (req, res) => {
    const userId = req.user.userId;
    const secret = speakeasy.generateSecret({ name: `${config.twofaIssuer} (${userId})` });
    await db.query("UPDATE users SET twofa_secret=$1 WHERE id=$2", [secret.base32, userId]);
    res.json({ secret: secret.base32, otpauthUrl: secret.otpauth_url });
  })
);

router.post(
  "/2fa/enable",
  requireAuth,
  wrapAsync(async (req, res) => {
    const userId = req.user.userId;
    const code = req.body.code as string;
    const user = (await db.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
    if (!user?.twofa_secret) throw new HttpError(400, "2FA not initialized");
    const verified = speakeasy.totp.verify({
      secret: user.twofa_secret,
      encoding: "base32",
      token: code,
    });
    if (!verified) throw new HttpError(401, "Invalid 2FA code");
    await db.query("UPDATE users SET twofa_enabled=true WHERE id=$1", [userId]);
    res.json({ ok: true });
  })
);

export default router;
