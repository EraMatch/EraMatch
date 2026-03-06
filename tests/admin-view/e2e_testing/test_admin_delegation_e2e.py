import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from .conftest import FRONTEND_URL

class TestAdminDelegationE2E:
    def test_navigate_to_delegation(self, admin_driver):
        """Test navigating to the Recruiter Delegation page."""
        admin_driver.get(f"{FRONTEND_URL}/admin")
        
        delegation_link = WebDriverWait(admin_driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Delegation') or contains(text(), 'Assignments')]"))
        )
        delegation_link.click()
        
        header = WebDriverWait(admin_driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//h1[contains(text(), 'Delegation') or contains(text(), 'Assignments')]"))
        )
        assert header is not None

    def test_search_for_recruiter_delegation(self, admin_driver):
        """Test searching for a recruiter to manage their assignments."""
        admin_driver.get(f"{FRONTEND_URL}/admin/delegation")
        
        # Look for the recruiter search/select input
        search_input = WebDriverWait(admin_driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//input[@placeholder='Search recruiters...' or contains(@class, 'search')]"))
        )
        search_input.clear()
        search_input.send_keys("demo recruiter")
        
        assert search_input.get_attribute("value") == "demo recruiter"
