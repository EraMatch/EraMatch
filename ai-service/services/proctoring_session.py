"""Stateful proctoring session manager.

Tracks per-session state for tab switches, violations, liveness challenges,
and face encodings — replicating the Django project's server-side tracking.
"""

from __future__ import annotations

import logging
import time
import json
import redis
from dataclasses import dataclass, field, asdict
from threading import Lock

from services.proctoring_engine import LivenessChallenge
from config import settings

logger = logging.getLogger(__name__)


@dataclass
class ProctoringSession:
    """Server-side state for a single proctoring session (one candidate exam)."""

    session_id: str
    created_at: float = field(default_factory=time.time)

    # Tab switch tracking (mirrors Django CheatingEvent.tab_switch_count)
    tab_switch_count: int = 0
    max_tab_switches: int = 5
    is_terminated: bool = False

    # Browser violation log
    violations: list[dict] = field(default_factory=list)

    # Temporal violation tracking buffer for smoothing out false positives
    violation_buffers: dict[str, list[float]] = field(default_factory=dict)


    # Face identity
    reference_face_encoding: list[float] | None = None
    last_face_check_time: float = 0.0

    # Liveness challenge
    liveness_challenge: LivenessChallenge = field(
        default_factory=lambda: LivenessChallenge(interval_seconds=45.0, timeout_seconds=15.0)
    )

    # Cheating event counts (for trust score)
    cheating_event_count: int = 0

    def record_tab_switch(self) -> dict:
        """Record a tab switch and return status — mirrors Django record_tab_switch view."""
        if self.is_terminated:
            return {
                "status": "terminated",
                "count": self.tab_switch_count,
                "message": "Session already terminated.",
            }

        self.tab_switch_count += 1
        self.cheating_event_count += 1

        violation = {
            "type": "tab_switch",
            "description": f"Tab switch #{self.tab_switch_count}",
            "severity": "high",
            "timestamp": time.time(),
        }
        self.violations.append(violation)

        if self.tab_switch_count > self.max_tab_switches:
            self.is_terminated = True
            logger.info(
                "Session %s terminated: %d tab switches exceeded limit of %d",
                self.session_id, self.tab_switch_count, self.max_tab_switches,
            )
            return {
                "status": "terminated",
                "count": self.tab_switch_count,
                "cheating_flag": True,
                "message": f"Exam terminated: {self.tab_switch_count} tab switches exceeded the limit of {self.max_tab_switches}.",
            }

        logger.info(
            "Session %s: tab switch %d/%d",
            self.session_id, self.tab_switch_count, self.max_tab_switches,
        )
        return {
            "status": "updated",
            "count": self.tab_switch_count,
            "cheating_flag": self.tab_switch_count >= 1,
            "message": f"Tab switch detected! Total switches: {self.tab_switch_count}/{self.max_tab_switches}",
        }

    def record_browser_event(self, event_type: str) -> dict:
        """Record any browser prevention event."""
        if event_type in ("tab_switch", "window_blur"):
            return self.record_tab_switch()

        self.cheating_event_count += 1
        violation = {
            "type": event_type,
            "description": f"Browser event: {event_type}",
            "severity": "high" if event_type in ("devtools_open", "screen_capture", "fullscreen_exit") else "medium",
            "timestamp": time.time(),
        }
        self.violations.append(violation)

        return {
            "status": "recorded",
            "event_type": event_type,
            "cheating_event_count": self.cheating_event_count,
            "message": f"Browser event recorded: {event_type}",
        }

    def process_frame_violations(self, raw_violations: list[dict], persist_seconds: float = 3.0) -> list[dict]:
        """
        Enforce temporal persistence windows to filter out transient frame drops.
        A violation must be consistently observed for `persist_seconds` before it is confirmed.
        """
        now = time.time()
        confirmed_violations = []
        current_types = {v["type"]: v for v in raw_violations}
        
        for v_type, v_data in current_types.items():
            if v_type not in self.violation_buffers:
                self.violation_buffers[v_type] = []
            
            self.violation_buffers[v_type].append(now)
            first_seen = self.violation_buffers[v_type][0]
            
            # If the violation has persisted long enough, confirm it and reset the buffer
            if (now - first_seen) >= persist_seconds:
                confirmed_violations.append(v_data)
                self.violation_buffers[v_type].clear()
                
        # Clear buffers for violations that are NO LONGER present in this frame
        # (e.g. the candidate looked away for 1 second, but then looked back)
        for v_type in list(self.violation_buffers.keys()):
            if v_type not in current_types:
                self.violation_buffers[v_type].clear()
                
        return confirmed_violations

    def get_trust_score(self) -> int:
        return max(0, 100 - (self.cheating_event_count * 10))

    def summary(self) -> dict:
        return {
            "session_id": self.session_id,
            "tab_switch_count": self.tab_switch_count,
            "max_tab_switches": self.max_tab_switches,
            "is_terminated": self.is_terminated,
            "cheating_event_count": self.cheating_event_count,
            "trust_score": self.get_trust_score(),
            "violation_count": len(self.violations),
            "liveness_stats": self.liveness_challenge.stats,
            "has_reference_face": self.reference_face_encoding is not None,
            "created_at": self.created_at,
            "uptime_seconds": round(time.time() - self.created_at, 1),
        }


class SessionManager:
    """Redis-backed session store for proctoring sessions."""

    def __init__(self) -> None:
        self.redis_client = redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)

    def _get_key(self, session_id: str) -> str:
        return f"proctoring_session:{session_id}"

    def _serialize(self, session: ProctoringSession) -> str:
        data = asdict(session)
        return json.dumps(data)

    def _deserialize(self, data_str: str) -> ProctoringSession:
        data = json.loads(data_str)
        liveness_data = data.pop("liveness_challenge", {})
        liveness_challenge = LivenessChallenge(**liveness_data)
        return ProctoringSession(**data, liveness_challenge=liveness_challenge)

    def get_or_create(self, session_id: str) -> ProctoringSession:
        key = self._get_key(session_id)
        data_str = self.redis_client.get(key)
        if data_str:
            return self._deserialize(data_str)
        session = ProctoringSession(session_id=session_id)
        self.save(session)
        logger.info("Created proctoring session: %s", session_id)
        return session

    def get(self, session_id: str) -> ProctoringSession | None:
        key = self._get_key(session_id)
        data_str = self.redis_client.get(key)
        if data_str:
            return self._deserialize(data_str)
        return None

    def save(self, session: ProctoringSession) -> None:
        key = self._get_key(session.session_id)
        self.redis_client.set(key, self._serialize(session), ex=86400)

    def destroy(self, session_id: str) -> bool:
        key = self._get_key(session_id)
        deleted = bool(self.redis_client.delete(key))
        if deleted:
            logger.info("Destroyed proctoring session: %s", session_id)
        return deleted

    def active_count(self) -> int:
        return len(self.redis_client.keys("proctoring_session:*"))

    def list_sessions(self) -> list[dict]:
        keys = self.redis_client.keys("proctoring_session:*")
        sessions = []
        for key in keys:
            data_str = self.redis_client.get(key)
            if data_str:
                session = self._deserialize(data_str)
                sessions.append(session.summary())
        return sessions


# Global singleton — shared across the ai-service process
SESSION_MANAGER = SessionManager()
