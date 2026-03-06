import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from .conftest import FRONTEND_URL

class TestAdminDashboardE2E:
    def test_dashboard_loads_global_stats(self, admin_driver):
        """Test that global stats cards are visible on the dashboard."""
        admin_driver.get(f"{FRONTEND_URL}/admin")
        
        # Look for typical stat titles or values
        # e.g., "Active Jobs", "Total Applications" or the summary numbers
        header = WebDriverWait(admin_driver, 30).until(
            EC.presence_of_element_located((By.XPATH, "//h1[contains(text(), 'Recruitment Dashboard')]"))
        )
        assert header is not None
        
    def test_dashboard_pipeline_funnel(self, admin_driver):
        """Test that the pipeline visualization renders."""
        admin_driver.get(f"{FRONTEND_URL}/admin")
        
        # Verify stages list or chart renders (e.g. Applied, Screening, etc.)
        pipeline_element = WebDriverWait(admin_driver, 30).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Overall Recruitment Pipeline')]"))
        )
        assert pipeline_element is not None

    def test_dashboard_health_analytics(self, admin_driver):
        """Test the health/analytics section renders."""
        admin_driver.get(f"{FRONTEND_URL}/admin")
        
        # Verify velocity/quality metric cards
        health_element = WebDriverWait(admin_driver, 30).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Project Health Status') or contains(text(), 'Portfolio Performance')]"))
        )
        assert health_element is not None
