import Axios from "./axios";

export const timeTrackingApi = {
  startSession: async ({ caseId, workType = "DESK", source = "TIMER" }) => {
    const response = await Axios.post("/time/start", {
      caseId,
      workType,
      source,
    });
    return response.data;
  },

  stopSession: async ({ caseId, sessionId, endReason = "MANUAL_STOP", note }) => {
    const response = await Axios.post("/time/stop", {
      caseId,
      sessionId,
      endReason,
      note,
    });
    return response.data;
  },

  logManualTime: async ({ caseId, startedAt, endedAt, workType = "DESK", note }) => {
    const response = await Axios.post("/time/manual", {
      caseId,
      startedAt,
      endedAt,
      workType,
      note,
    });
    return response.data;
  },

  getCaseTime: async (caseId) => {
    const response = await Axios.get(`/time/case/${caseId}`);
    return response.data;
  },

  sendHeartbeat: async ({ caseId, sessionId, source = "AUTO" }) => {
    const response = await Axios.post("/time/heartbeat", {
      caseId,
      sessionId,
      source,
    });
    return response.data;
  },

  getMyDay: async (date) => {
    const response = await Axios.get("/time/my-day", {
      params: date ? { date } : {},
    });
    return response.data;
  },

  updateSession: async (id, data) => {
    const response = await Axios.patch(`/time/${id}`, data);
    return response.data;
  },

  // ─── Manager / Team endpoints ─────────────────────────────────────────────

  getTeamReport: async ({ groupBy = "agent", from, to } = {}) => {
    const params = { groupBy };
    if (from) params.from = from;
    if (to)   params.to   = to;
    const response = await Axios.get("/time/team/report", { params });
    return response.data;
  },

  getPendingApprovals: async () => {
    const response = await Axios.get("/time/team/approvals");
    return response.data;
  },

  approveOrRejectSession: async (sessionId, action, note) => {
    const response = await Axios.patch(`/time/team/approvals/${sessionId}`, { action, note });
    return response.data;
  },
};

export default timeTrackingApi;

