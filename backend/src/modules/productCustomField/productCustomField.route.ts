import { Router } from "express";
import * as field from "./productCustomField.controller";
import { authenticateToken } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";

const router = Router();
router.use(authenticateToken);

// All product/custom-field management uses SERVICE_MANAGE — the unified permission
// for managing categories, subcategories, service types, and custom fields.
router.get(   "/customfields/getAll",          requirePermission("SERVICE_MANAGE"), field.getAllCustomFields);
router.get(   "/customfields/get/:id",         requirePermission("SERVICE_MANAGE"), field.getCustomField);
router.post(  "/customfields/create",          requirePermission("SERVICE_MANAGE"), field.createCustomField);
router.patch( "/customfields/update/:id",      requirePermission("SERVICE_MANAGE"), field.updateCustomField);
router.patch( "/customfields/:id/status",      requirePermission("SERVICE_MANAGE"), field.toggleStatus);

export const ProductCustomFieldRouter = router;
