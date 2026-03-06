import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from .conftest import FRONTEND_URL
import time

class TestAdminOrgMembersE2E:
    def test_navigate_to_org_members(self, admin_driver):
        """Test that we can navigate to the Organization Members tab."""
        admin_driver.get(f"{FRONTEND_URL}/admin")
        
        # Find and click the Organization Members link in the sidebar
        members_link = WebDriverWait(admin_driver, 30).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "a[title='Organization Members']"))
        )
        members_link.click()
        
        # Verify the page header
        header = WebDriverWait(admin_driver, 30).until(
            EC.presence_of_element_located((By.XPATH, "//h1[contains(text(), 'Organization Members')]"))
        )
        assert header is not None

    def test_search_members(self, admin_driver):
        """Test the search functionality for members."""
        admin_driver.get(f"{FRONTEND_URL}/admin/members") # adjust the URL if the route differs
        
        # Look for a search input box
        search_input = WebDriverWait(admin_driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[placeholder*='Search']"))
        )
        search_input.clear()
        search_input.send_keys("recruiter")
        
        assert search_input.get_attribute("value") == "recruiter"
