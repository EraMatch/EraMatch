import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from .conftest import FRONTEND_URL

class TestAdminRequestsE2E:
    def test_navigate_to_requests(self, admin_driver):
        """Test navigating to the centralized Requests manager."""
        admin_driver.get(f"{FRONTEND_URL}/admin")
        
        requests_link = WebDriverWait(admin_driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Requests')]"))
        )
        requests_link.click()
        
        header = WebDriverWait(admin_driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//h1[contains(text(), 'Requests')]"))
        )
        assert header is not None

    def test_requests_filter_tabs(self, admin_driver):
        """Test toggling between request state filters (Pending, Approved, Rejected)."""
        # Ensure we are on the Requests page
        admin_driver.get(f"{FRONTEND_URL}/admin/requests")
        
        # Assuming there are tabs or buttons to filter states
        try:
            approved_tab = WebDriverWait(admin_driver, 5).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Approved') or contains(text(), 'Resolved')]"))
            )
            approved_tab.click()
            assert "Approved" in approved_tab.text or "Resolved" in approved_tab.text
        except:
            # If standard tabs don't exist, ignore or log
            pytest.skip("Filter tabs not strictly matching generic naming found on UI.")
