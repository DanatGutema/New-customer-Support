import { Router } from "express";
import * as category from "./productCategory.controller";
import { authenticateToken } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";

const router = Router();

router.use(authenticateToken);

router.get(
  "/categories/getAll",
  category.fetchAllCategories
);
router.get("/categories/get/:id",requirePermission("SERVICE_MANAGE"),  category.fetchCategoryById);
router.post(
  "/categories/create", requirePermission("SERVICE_MANAGE"),
  category.createCategory,
);
router.patch(
  "/categories/update/:id", requirePermission("SERVICE_MANAGE"),
  category.updateCategory,
);
router.patch(
  "/categories/:id/status",requirePermission("SERVICE_MANAGE"),
  category.toggleCategoryActive,
);

router.get(
  "/subcategories/getAll",
  category.fetchAllSubcategories
);
router.get("/subcategories/get/:id",requirePermission("SERVICE_MANAGE"),  category.fetchSubcategoryById);
router.post(
  "/subcategories/create", requirePermission("SERVICE_MANAGE"),
  category.createSubcategory,
);
router.patch(
  "/subcategories/update/:id", requirePermission("SERVICE_MANAGE"),
  category.updateSubcategory,
);
router.patch(
  "/subcategories/:id/status", requirePermission("SERVICE_MANAGE"),
  category.toggleSubcategoryActive,
);

export const ProductRouter = router;
