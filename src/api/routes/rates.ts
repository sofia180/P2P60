import { Router } from "express";
import { fetchRates } from "../../services/rateService.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const data = await fetchRates();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
