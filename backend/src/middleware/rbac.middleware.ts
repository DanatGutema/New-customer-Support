import { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/error";

export const requirePermission = (...requiredPermissions: string[]) => {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError(
          "Authentication token context unavailable."
        );
      }

      // System admins bypass all permission checks
      if (req.user.partyType === "STAFF" && req.user.isSAdmin) {
        return next();
      }

      const userPermissions = (req.user.permissions || []).map(
        (p: string) => String(p).trim().toUpperCase()
      );

      const hasPermission = requiredPermissions.some((perm) =>
        userPermissions.includes(String(perm).trim().toUpperCase())
      );

      if (!hasPermission) {
        throw new ForbiddenError(
          "Access Denied: Missing required permission clearance."
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};