import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from .conftest import FRONTEND_URL

class TestAdminLoginE2E:
    def test_invalid_login(self, browser):
        """Test that invalid credentials show an error and do not log in."""
        browser.get(f"{FRONTEND_URL}/admin/login")
        
        email_input = WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        )
        email_input.clear()
        email_input.send_keys("wrong_admin@eramatch.com")
        
        password_input = browser.find_element(By.CSS_SELECTOR, "input[type='password']")
        password_input.clear()
        password_input.send_keys("wrongpassword")
        
        submit_button = browser.find_element(By.CSS_SELECTOR, "button[type='submit']")
        submit_button.click()
        
        # Verify an error message appears (assuming toaster or text error)
        error_element = WebDriverWait(browser, 5).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Invalid') or contains(text(), 'error') or contains(text(), 'fail')]"))
        )
        assert error_element is not None

    def test_successful_login(self, browser):
        """Test successful login redirects to the dashboard."""
        browser.get(f"{FRONTEND_URL}/admin/login")
        
        email_input = WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        )
        email_input.clear()
        email_input.send_keys("admin_1@eramatch.com")
        
        password_input = browser.find_element(By.CSS_SELECTOR, "input[type='password']")
        password_input.clear()
        password_input.send_keys("1234567890")
        
        submit_button = browser.find_element(By.CSS_SELECTOR, "button[type='submit']")
        submit_button.click()
        
        dashboard_element = WebDriverWait(browser, 15).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Dashboard') or contains(text(), 'Overview')]"))
        )
        assert dashboard_element is not None
