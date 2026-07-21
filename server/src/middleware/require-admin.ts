import type { NextFunction, Request, Response } from "express";

import { UserRole } from "../generated/client/enums";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== UserRole.admin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
