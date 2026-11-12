import { Router } from "express";
import * as MessageController from "./case.message.controller";
import { authenticateToken } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";
import { PERMISSIONS } from "../../config/default.permission";

const router = Router();

router.use(authenticateToken);

// Any authenticated staff can read canned replies
router.get("/", MessageController.getCannedReplies);

// Only staff with CASE_READ_HIERARCHY or higher can manage canned replies
router.post(  "/", requirePermission(PERMISSIONS.CASE_ASSIGN), MessageController.createCannedReply);
router.patch( "/:id", requirePermission(PERMISSIONS.CASE_ASSIGN), MessageController.updateCannedReply);
router.delete("/:id", requirePermission(PERMISSIONS.CASE_ASSIGN), MessageController.deleteCannedReply);

export const CannedReplyRouter = router;
