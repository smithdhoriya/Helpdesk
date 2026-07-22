import type { Response } from "express";
import type { z } from "zod";

export function sendValidationError(res: Response, error: z.ZodError) {
  res.status(400).json({ error: error.issues[0].message });
}
