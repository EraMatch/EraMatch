import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from .conftest import FRONTEND_URL

class TestAdminClosedPositionsE2E:
    def test_navigate_to_closed_positions(self, admin_driver):
        """Test navigating to the Closed Positions archive."""
        admin_driver.get(f"{FRONTEND_URL}/admin")
        
        # Some sidebars put it under "Jobs", others as a top-level link
        closed_link = WebDriverWait(admin_driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Closed') or contains(text(), 'Archive')]"))
        )
        closed_link.click()
        
        header = WebDriverWait(admin_driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//h1[contains(text(), 'Closed Positions') or contains(text(), 'Archive')]"))
        )
        assert header is not None

    def test_closed_positions_history_loads(self, admin_driver):
        """Test that the closed positions table/list renders properly."""
        admin_driver.get(f"{FRONTEND_URL}/admin/closed-positions")
        
        # Wait for the table/grid element to populate
        # Looking for generic signs of loaded content like a table row or a card missing the word 'Loading'
        try:
            position_element = WebDriverWait(admin_driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Hired') or contains(text(), 'Closed Date')]"))
            )
            assert position_element is not None
        except:
            # Handle case where list is completely empty gracefully
            no_data_element = WebDriverWait(admin_driver, 5).until(
                EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'No closed positions') or contains(text(), 'No data')]"))
            )
            assert no_data_element is not None

