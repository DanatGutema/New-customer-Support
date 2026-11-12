import { Router } from "express";
import { authenticateToken } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";
import { PERMISSIONS } from "../../config/default.permission";
import { TimeTrackingController } from "./timeTracking.controller";

const router = Router();

router.use(authenticateToken);

router.post("/start",        TimeTrackingController.start);
router.post("/stop",         TimeTrackingController.stop);
router.post("/heartbeat",    TimeTrackingController.heartbeat);
router.post("/manual",       TimeTrackingController.manual);
router.get("/my-day",        TimeTrackingController.getMyDay);
router.get("/case/:caseId",  TimeTrackingController.getCaseTime);
router.patch("/:id",         TimeTrackingController.updateSession);

// Manager/Admin endpoints — require TIME_READ_TEAM
router.get(
  "/team/report",
  requirePermission(PERMISSIONS.TIME_READ_TEAM),
  TimeTrackingController.getTeamReport
);
router.get(
  "/team/approvals",
  requirePermission(PERMISSIONS.TIME_READ_TEAM),
  TimeTrackingController.getPendingApprovals
);
router.patch(
  "/team/approvals/:id",
  requirePermission(PERMISSIONS.TIME_READ_TEAM),
  TimeTrackingController.approveOrRejectSession
);

export const TimeTrackingRouter = router;

