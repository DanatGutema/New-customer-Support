import { useState } from "react";
import { Play, Square, Clock, PlusCircle, AlertCircle } from "lucide-react";
import useCaseTimer from "../../hooks/useCaseTimer";
import LogTimeModal from "./LogTimeModal";

function formatSeconds(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return "0m";
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export default function CaseTimeTracker({ caseId, isAssignedAgent, caseStatus }) {
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const {
    loading,
    totalSeconds,
    activeSession,
    liveElapsed,
    isRunning,
    canTrack,
    isIdle,
    showIdlePrompt,
    showStillWorkingPrompt,
    startTimer,
    stopTimer,
    stayActive,
    dismissStillWorkingPrompt,
    fetchCaseTime,
  } = useCaseTimer(caseId, { isAssignedAgent, caseStatus });

  const handleStartWork = async () => {
    if (!canTrack) return;
    try {
      setActionLoading(true);
      await startTimer("DESK");
    } catch (err) {
      console.error("Error starting work timer:", err);
      alert(err?.response?.data?.message || err?.message || "Failed to start timer.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopWork = async () => {
    try {
      setActionLoading(true);
      await stopTimer(undefined, "MANUAL_STOP");
    } catch (err) {
      console.error("Error stopping work timer:", err);
      alert(err?.response?.data?.message || err?.message || "Failed to stop timer.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Worked Total Chip */}
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 shadow-2xs">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-[11px] font-medium text-slate-500">Worked:</span>
          <span className="font-mono font-bold text-slate-900">
            {formatSeconds(totalSeconds + (activeSession ? liveElapsed : 0))}
          </span>
        </div>

        {/* Live Active Timer Badge if Running */}
        {activeSession && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-mono font-semibold">
              Live: {formatSeconds(liveElapsed)}
            </span>
            {isIdle && (
              <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                Idle
              </span>
            )}
          </div>
        )}

        {/* Start / Stop Controls for Assigned Agent */}
        {canTrack && (
          <>
            {isRunning ? (
              <button
                type="button"
                onClick={handleStopWork}
                disabled={actionLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 transition shadow-2xs disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5 fill-red-600 text-red-600" />
                Stop work
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartWork}
                disabled={actionLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                Start work
              </button>
            )}

            {/* Manual Log Time Modal Button */}
            <button
              type="button"
              onClick={() => setIsLogModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs"
            >
              <PlusCircle className="h-3.5 w-3.5 text-slate-500" />
              Log time
            </button>
          </>
        )}
      </div>

      {/* Still Working 4-hour alert modal */}
      {showStillWorkingPrompt && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-900">Still working on this case?</h4>
              <p className="text-[11px] text-amber-800">
                You have been tracking time on this case for over 4 hours. Keep timer running or stop now?
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={dismissStillWorkingPrompt}
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                >
                  Yes, keep running
                </button>
                <button
                  type="button"
                  onClick={handleStopWork}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Stop timer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4-minute Inactivity warning modal */}
      {showIdlePrompt && (
        <div className="fixed bottom-6 left-6 z-50 max-w-sm rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-xl animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-blue-900">Are you still there?</h4>
              <p className="text-[11px] text-blue-800">
                You have been inactive for 4 minutes. Automatic tracking pauses after 5 minutes of inactivity.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={stayActive}
                  className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                >
                  I'm still working
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Time Modal */}
      <LogTimeModal
        caseId={caseId}
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onSuccess={() => fetchCaseTime()}
      />
    </>
  );
}
