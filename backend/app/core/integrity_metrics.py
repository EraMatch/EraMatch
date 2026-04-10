"""Integrity metrics collection and Prometheus-style exposition."""

from __future__ import annotations

from collections import defaultdict
from threading import Lock


class IntegrityMetricsCollector:
    def __init__(self) -> None:
        self._lock = Lock()
        self._events: dict[tuple[str, str, str], int] = defaultdict(int)

    def inc(self, stage: str, outcome: str, reason: str = "none") -> None:
        stage_label = (stage or "unknown").strip().lower()
        outcome_label = (outcome or "unknown").strip().lower()
        reason_label = (reason or "none").strip().lower()
        with self._lock:
            self._events[(stage_label, outcome_label, reason_label)] += 1

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            rows = [
                {
                    "stage": stage,
                    "outcome": outcome,
                    "reason": reason,
                    "count": count,
                }
                for (stage, outcome, reason), count in sorted(self._events.items())
            ]

        totals = {
            "accepted": sum(r["count"] for r in rows if r["outcome"] == "accepted"),
            "dropped": sum(r["count"] for r in rows if r["outcome"] == "dropped"),
            "dropped_rate_limited": sum(
                r["count"] for r in rows if r["outcome"] == "dropped" and r["reason"] == "rate_limited"
            ),
            "dropped_duplicate": sum(
                r["count"] for r in rows if r["outcome"] == "dropped" and r["reason"] == "duplicate_recent_window"
            ),
        }
        return {
            "rows": rows,
            "totals": totals,
        }

    def as_prometheus_text(self) -> str:
        lines = [
            "# HELP eramatch_integrity_events_total Integrity events processed by outcome and reason.",
            "# TYPE eramatch_integrity_events_total counter",
        ]
        with self._lock:
            for (stage, outcome, reason), count in sorted(self._events.items()):
                lines.append(
                    f'eramatch_integrity_events_total{{stage="{stage}",outcome="{outcome}",reason="{reason}"}} {count}'
                )
        return "\n".join(lines) + "\n"


integrity_metrics = IntegrityMetricsCollector()
