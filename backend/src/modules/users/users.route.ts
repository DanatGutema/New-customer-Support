import { Router } from "express";
import {
  updateMyProfile,
  adminUpdateUserEmail,
  getAllApprovedUsers,
  getUserById,
  updateUserByAdmin,
  getUserPermissions,
} from "./users.controller";

import { authenticateToken } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";
import { PERMISSIONS } from "../../config/default.permission";

const router = Router();

router.use(authenticateToken);

router.patch(
  "/own/updateProfile",
  updateMyProfile
);

router.patch(
  "/update/:id",
  requirePermission(PERMISSIONS.USER_UPDATE_ANY),
  adminUpdateUserEmail
);

// FIXED: USER_READ_ALL does not exist — replaced with real permissions.
// Admin (STAFF_READ_ALL + CUSTOMER_READ_ALL), managers/directors (STAFF_READ_ALL) all work.
router.get(
  "/all-approved",
  requirePermission(PERMISSIONS.STAFF_READ_ALL, PERMISSIONS.CUSTOMER_READ_ALL),
  getAllApprovedUsers
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.STAFF_READ_ALL, PERMISSIONS.CUSTOMER_READ_ALL, PERMISSIONS.ACCESS_USER_DETAIL),
  getUserById
);

router.put(
  "/:id",
  requirePermission(PERMISSIONS.USER_UPDATE_ANY),
  updateUserByAdmin
);

router.get(
  "/:id/permissions",
  requirePermission(PERMISSIONS.PERMISSION_DELEGATE),
  getUserPermissions
);

export const UserProfile = router;