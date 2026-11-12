import { Router } from "express";
import { authenticateToken } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";
import {
  createField,
  updateField,
  toggleStatus,
  getBySubcategory,
  deleteField,
} from "./productField.controller";

const router = Router();
router.use(authenticateToken);

// All product field management uses SERVICE_MANAGE — the unified permission
// for managing categories, subcategories, service types, and custom fields.
router.post("/subcategories/:id/fields", requirePermission("SERVICE_MANAGE"), createField);
router.get("/subcategories/:id/fields",  requirePermission("SERVICE_MANAGE"), getBySubcategory);
router.patch("/fields/:id",              requirePermission("SERVICE_MANAGE"), updateField);
router.patch("/fields/:id/status",       requirePermission("SERVICE_MANAGE"), toggleStatus);
router.delete("/fields/:id",             requirePermission("SERVICE_MANAGE"), deleteField);

export const ProductFieldRouter = router;
