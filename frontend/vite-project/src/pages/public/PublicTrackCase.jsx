// frontend/vite-project/src/pages/public/PublicTrackCase.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock, User, Calendar, FileText, ArrowLeft } from "lucide-react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

const statusConfig = {
  OPEN: { label: "Open", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
  IN_PROGRESS: { label: "In Progress", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  PENDING: { label: "Pending", color: "bg-purple-100 text-purple-700 border-purple-200", icon: Clock },
  ESCALATED: { label: "Escalated", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  RESOLVED: { label: "Resolved", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  CLOSED: { label: "Closed", color: "bg-slate-100 text-slate-700 border-slate-200", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelled", color: "bg-slate-100 text-slate-700 border-slate-200", icon: AlertCircle },
};

export default function PublicTrackCase() {
  const { caseNumber } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [caseData, setCaseData] = useState(null);

  useEffect(() => {
    const fetchCase = async () => {
      try {
        setLoading(true);
        setError("");
        // Public endpoint we'll create on backend later
        const res = await axios.get(`${API_BASE}/cases/public/track/${caseNumber}`);
        setCaseData(res.data?.data || res.data);
      } catch (err) {
        setError(err.response?.data?.message || "We couldn't find a case with this number.");
      } finally {
        setLoading(false);
      }
    };

    if (caseNumber) {
      fetchCase();
    }
  }, [caseNumber]);

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading case details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Case Not Found</h1>
          <p className="mt-2 text-slate-600">{error}</p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!caseData) return null;

  const status = caseData.status || "OPEN";
  const StatusIcon = statusConfig[status]?.icon || Clock;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">MOTI Support - Case Tracking</h1>
              <p className="mt-1 text-slate-600">Track your support case progress</p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Case Overview Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm text-slate-600">Case Number</p>
                <p className="text-xl font-semibold text-slate-900 mt-1">#{caseData.caseNumber}</p>
              </div>
              <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${statusConfig[status]?.color}`}>
                <StatusIcon className="h-4 w-4" />
                {statusConfig[status]?.label}
              </span>
            </div>
          </div>

          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-sm text-slate-600">Subject</p>
                <p className="mt-1 text-slate-900">{caseData.subject || "-"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-sm text-slate-600">Assigned To</p>
                <p className="mt-1 text-slate-900">
                  {caseData.assignedSupportName || "Not yet assigned"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-sm text-slate-600">Created</p>
                <p className="mt-1 text-slate-900">{formatDate(caseData.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-sm text-slate-600">Last Updated</p>
                <p className="mt-1 text-slate-900">{formatDate(caseData.updatedAt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Case Timeline</h2>
            <p className="mt-1 text-sm text-slate-600">History of updates on this case</p>
          </div>
          <div className="px-6 py-5">
            {caseData.timeline && caseData.timeline.length > 0 ? (
              <div className="space-y-6">
                {caseData.timeline.map((item, index) => (
                  <div key={item.id || index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-blue-600 mt-2"></div>
                      {index !== caseData.timeline.length - 1 && (
                        <div className="w-px h-full bg-slate-200 mt-2"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <p className="font-medium text-slate-900">
                          {item.title || `Status changed to ${item.toStatus}`}
                        </p>
                        <p className="text-sm text-slate-500">{formatDate(item.createdAt)}</p>
                      </div>
                      {item.note && (
                        <p className="mt-2 text-sm text-slate-600">{item.note}</p>
                      )}
                      {item.actorName && (
                        <p className="mt-1 text-xs text-slate-500">Updated by: {item.actorName}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-600 py-8">No updates yet</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}