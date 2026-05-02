"""
Tests for Recruiter Background Tasks endpoints.
Covers: list tasks, SLO health, task logs, delete, and stop actions.

Backend endpoints:
  GET    /background-tasks
  GET    /background-tasks/slo-health
  GET    /background-tasks/{task_id}/logs
  DELETE /background-tasks/{task_id}
  POST   /background-tasks/stop-video
  POST   /background-tasks/stop-question-import
  POST   /background-tasks/stop-github-analysis
  POST   /background-tasks/stop-qag
  POST   /background-tasks/stop-cv-ingestion
  POST   /background-tasks/stop-video/{task_id}
  POST   /background-tasks/stop-question-import/{task_id}
  POST   /background-tasks/stop-github-analysis/{task_id}
  POST   /background-tasks/stop-qag/{task_id}
  POST   /background-tasks/stop-cv-ingestion/{task_id}
"""
import uuid


class TestBackgroundTaskListing:
    """Tests for background task listing and health."""

    def test_list_background_tasks_returns_200(self, client):
        resp = client.get("/background-tasks")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_slo_health_returns_200(self, client):
        resp = client.get("/background-tasks/slo-health")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_get_task_logs_for_fake_id_returns_200(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/background-tasks/{fake_id}/logs")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )


class TestBackgroundTaskDeletion:
    """Tests for deleting background tasks."""

    def test_delete_task_missing_category_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/background-tasks/{fake_id}")
        assert resp.status_code in (400, 422), (
            f"Expected 400/422, got {resp.status_code}: {resp.text}"
        )


class TestBackgroundTaskStopAll:
    """Tests for stopping all tasks by category."""

    def test_stop_all_video_tasks_returns_200(self, client):
        resp = client.post("/background-tasks/stop-video")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_stop_all_question_import_tasks_returns_200(self, client):
        resp = client.post("/background-tasks/stop-question-import")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_stop_all_github_analysis_tasks_returns_200(self, client):
        resp = client.post("/background-tasks/stop-github-analysis")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_stop_all_qag_tasks_returns_200(self, client):
        resp = client.post("/background-tasks/stop-qag")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_stop_all_cv_ingestion_tasks_returns_200(self, client):
        resp = client.post("/background-tasks/stop-cv-ingestion")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )


class TestBackgroundTaskStopSingle:
    """Tests for stopping a single task by id."""

    def test_stop_video_task_fake_id_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/background-tasks/stop-video/{fake_id}")
        assert resp.status_code in (400, 404, 422), (
            f"Expected 400/404/422, got {resp.status_code}: {resp.text}"
        )

    def test_stop_question_import_task_fake_id_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/background-tasks/stop-question-import/{fake_id}")
        assert resp.status_code in (400, 404, 422), (
            f"Expected 400/404/422, got {resp.status_code}: {resp.text}"
        )

    def test_stop_github_analysis_task_fake_id_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/background-tasks/stop-github-analysis/{fake_id}")
        assert resp.status_code in (400, 404, 422), (
            f"Expected 400/404/422, got {resp.status_code}: {resp.text}"
        )

    def test_stop_qag_task_fake_id_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/background-tasks/stop-qag/{fake_id}")
        assert resp.status_code in (400, 404, 422), (
            f"Expected 400/404/422, got {resp.status_code}: {resp.text}"
        )

    def test_stop_cv_ingestion_task_fake_id_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/background-tasks/stop-cv-ingestion/{fake_id}")
        assert resp.status_code in (400, 404, 422), (
            f"Expected 400/404/422, got {resp.status_code}: {resp.text}"
        )
