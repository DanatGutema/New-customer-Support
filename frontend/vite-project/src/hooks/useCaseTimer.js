import { useState, useEffect, useRef, useCallback } from "react";
import timeTrackingApi from "../api/timeTrackingApi";

const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const IDLE_PROMPT_MS = 4 * 60 * 1000;     // 4 minutes
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;    // 5 minutes
const STILL_WORKING_SECONDS = 4 * 3600;   // 4 hours

export function useCaseTimer(caseId, options = {}) {
  const { isAssignedAgent = false, caseStatus = "OPEN" } = options;

  const [loading, setLoading] = useState(true);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [activeSession, setActiveSession] = useState(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [serverAssigned, setServerAssigned] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [showIdlePrompt, setShowIdlePrompt] = useState(false);
  const [showStillWorkingPrompt, setShowStillWorkingPrompt] = useState(false);
  const [isActiveTab, setIsActiveTab] = useState(true);

  const tabIdRef = useRef(Math.random().toString(36).slice(2, 9));
  const channelRef = useRef(null);
  const lastActiveRef = useRef(Date.now());
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const isTerminal = ["RESOLVED", "CLOSED", "CANCELLED"].includes(caseStatus);
  const canTrack = (isAssignedAgent || serverAssigned) && !isTerminal;

  // ─── Fetch case time details ──────────────────────────────────────────────
  const fetchCaseTime = useCallback(async () => {
    if (!caseId) return;
    try {
      const res = await timeTrackingApi.getCaseTime(caseId);
      if (res?.success && res.data) {
        setTotalSeconds(res.data.totalActiveSeconds || 0);
        setActiveSession(res.data.activeSession || null);
        setServerAssigned(Boolean(res.data.isAssignedAgent));

        if (res.data.activeSession?.startedAt) {
          const startedAt = new Date(res.data.activeSession.startedAt).getTime();
          setLiveElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        } else {
          setLiveElapsed(0);
        }
      }
    } catch (err) {
      console.error("Failed to fetch case time:", err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchCaseTime();
  }, [fetchCaseTime]);

  // ─── BroadcastChannel: ensure only one tab counts ────────────────────────
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channelName = `case_timer_${caseId}`;
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    // Claim active status on load
    channel.postMessage({
      type: "CLAIM_TAB",
      tabId: tabIdRef.current,
      timestamp: Date.now(),
    });

    channel.onmessage = (event) => {
      const { type, tabId: senderTabId, timestamp } = event.data || {};
      if (type === "CLAIM_TAB" && senderTabId !== tabIdRef.current) {
        // If another tab became active, yield tracking
        setIsActiveTab(false);
      } else if (type === "YIELD_TAB" && senderTabId !== tabIdRef.current) {
        // If the other tab closed or yielded, re-claim if visible
        if (!document.hidden) {
          setIsActiveTab(true);
        }
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        setIsActiveTab(true);
        channel.postMessage({
          type: "CLAIM_TAB",
          tabId: tabIdRef.current,
          timestamp: Date.now(),
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      channel.postMessage({
        type: "YIELD_TAB",
        tabId: tabIdRef.current,
      });
      channel.close();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [caseId]);

  // ─── User activity & idle tracking ───────────────────────────────────────
  const markUserActive = useCallback(() => {
    lastActiveRef.current = Date.now();
    if (isIdle) {
      setIsIdle(false);
      setShowIdlePrompt(false);
      // Send immediate heartbeat on waking from idle
      if (canTrack && isActiveTab && !document.hidden && caseId) {
        timeTrackingApi
          .sendHeartbeat({
            caseId,
            sessionId: activeSessionRef.current?.id,
            source: activeSessionRef.current?.source || "AUTO",
          })
          .catch(() => {});
      }
    } else if (showIdlePrompt) {
      setShowIdlePrompt(false);
    }
  }, [isIdle, showIdlePrompt, canTrack, isActiveTab, caseId]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handler = () => markUserActive();

    events.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handler));
    };
  }, [markUserActive]);

  // ─── Timer tick & Idle check (every 1s) ──────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const inactiveMs = now - lastActiveRef.current;

      // Check idle prompt (at 4 min) and idle timeout (at 5 min)
      if (inactiveMs >= IDLE_TIMEOUT_MS) {
        if (!isIdle) {
          setIsIdle(true);
          setShowIdlePrompt(false);
        }
      } else if (inactiveMs >= IDLE_PROMPT_MS) {
        if (!showIdlePrompt) {
          setShowIdlePrompt(true);
        }
      }

      // Update liveElapsed if a session is currently running
      if (activeSession?.startedAt) {
        const startedAt = new Date(activeSession.startedAt).getTime();
        const elapsedSecs = Math.max(0, Math.floor((now - startedAt) / 1000));
        setLiveElapsed(elapsedSecs);

        // Prompt "Still working?" after 4 hours on TIMER
        if (
          activeSession.source === "TIMER" &&
          elapsedSecs >= STILL_WORKING_SECONDS &&
          !showStillWorkingPrompt
        ) {
          setShowStillWorkingPrompt(true);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, isIdle, showIdlePrompt, showStillWorkingPrompt]);

  // ─── Heartbeat interval (every 30s, initial after 10s visit) ──────────────
  useEffect(() => {
    if (!caseId || !canTrack) return;

    const sendBeat = async () => {
      if (document.hidden || isIdle || !isActiveTab) return;
      try {
        const res = await timeTrackingApi.sendHeartbeat({
          caseId,
          sessionId: activeSessionRef.current?.id,
          source: activeSessionRef.current?.source || "AUTO",
        });

        if (res?.success && res.data) {
          if (!activeSessionRef.current) {
            setActiveSession(res.data);
          }
        }
      } catch (err) {
        console.error("Heartbeat error:", err);
      }
    };

    // Ignore visits under 10 seconds: wait 10s before firing first AUTO heartbeat
    const initialTimer = setTimeout(() => {
      sendBeat();
    }, 10 * 1000);

    const interval = setInterval(() => {
      sendBeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [caseId, canTrack, isIdle, isActiveTab]);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const startTimer = useCallback(
    async (workType = "DESK") => {
      if (!canTrack) return null;
      const res = await timeTrackingApi.startSession({
        caseId,
        source: "TIMER",
        workType,
      });
      if (res?.success) {
        setActiveSession(res.data);
        setLiveElapsed(0);
        setShowStillWorkingPrompt(false);
        fetchCaseTime();
        return res.data;
      }
    },
    [caseId, canTrack, fetchCaseTime]
  );

  const stopTimer = useCallback(
    async (note, endReason = "MANUAL_STOP") => {
      const res = await timeTrackingApi.stopSession({
        caseId,
        sessionId: activeSessionRef.current?.id,
        note,
        endReason,
      });
      if (res?.success) {
        setActiveSession(null);
        setLiveElapsed(0);
        setShowStillWorkingPrompt(false);
        fetchCaseTime();
        return res.data;
      }
    },
    [caseId, fetchCaseTime]
  );

  const stayActive = useCallback(() => {
    markUserActive();
    setShowIdlePrompt(false);
    setIsIdle(false);
  }, [markUserActive]);

  const dismissStillWorkingPrompt = useCallback(() => {
    setShowStillWorkingPrompt(false);
  }, []);

  return {
    loading,
    totalSeconds,
    activeSession,
    liveElapsed,
    isRunning: Boolean(activeSession && !activeSession.endedAt),
    canTrack,
    isIdle,
    showIdlePrompt,
    showStillWorkingPrompt,
    isActiveTab,
    startTimer,
    stopTimer,
    stayActive,
    dismissStillWorkingPrompt,
    fetchCaseTime,
  };
}

export default useCaseTimer;
