import { verifyAccessToken } from "../../utils/auth.js";
import { HttpError } from "../../utils/errors.js";

export const requireAuth = (req: any, _res: any, next: any) => {
  const header = req.headers.authorization;
  if (!header) throw new HttpError(401, "Missing Authorization");
  const token = header.replace("Bearer ", "");
  const payload = verifyAccessToken(token);
  req.user = payload;
  next();
};
