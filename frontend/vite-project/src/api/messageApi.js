import api from "./axios";

const messageApi = {
  /** Fetch thread messages for a case */
  getMessages(caseId) {
    return api.get(`/cases/${caseId}/messages`);
  },

  /** Post a new message (with optional file attachments) */
  postMessage(caseId, { body, visibility = "PUBLIC", files = [] }) {
    const form = new FormData();
    form.append("body", body);
    form.append("visibility", visibility);
    files.forEach((f) => form.append("attachments", f));
    return api.post(`/cases/${caseId}/messages`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** Delete a message */
  deleteMessage(caseId, messageId) {
    return api.delete(`/cases/${caseId}/messages/${messageId}`);
  },

  /** Fetch all active canned replies */
  getCannedReplies() {
    return api.get("/canned-replies");
  },

  /** Create a canned reply (staff/admin only) */
  createCannedReply(data) {
    return api.post("/canned-replies", data);
  },

  /** Update a canned reply */
  updateCannedReply(id, data) {
    return api.patch(`/canned-replies/${id}`, data);
  },

  /** Delete a canned reply */
  deleteCannedReply(id) {
    return api.delete(`/canned-replies/${id}`);
  },
};

export default messageApi;

export const {
  getMessages,
  postMessage,
  deleteMessage,
  getCannedReplies,
  createCannedReply,
  updateCannedReply,
  deleteCannedReply,
} = messageApi;
