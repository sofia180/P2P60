import jwt from "jsonwebtoken";
import { config } from "../config.js";

export type JwtPayload = { userId: string };

export const signAccessToken = (payload: JwtPayload, expiresIn = "15m") =>
  jwt.sign(payload, config.jwtSecret, { expiresIn });

export const signRefreshToken = (payload: JwtPayload, expiresIn = "7d") =>
  jwt.sign(payload, config.jwtRefreshSecret, { expiresIn });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, config.jwtSecret) as JwtPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, config.jwtRefreshSecret) as JwtPayload;
