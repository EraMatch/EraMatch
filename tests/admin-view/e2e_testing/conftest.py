import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

FRONTEND_URL = "http://localhost:5173"

@pytest.fixture(scope="session")
def browser():
    """Provides a Selenium WebDriver instance for the entire session."""
    options = webdriver.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    # For headless execution (e.g., in CI), uncomment the line below
    # options.add_argument("--headless")
    
    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(30)
    yield driver
    driver.quit()

@pytest.fixture(scope="session")
def admin_driver(browser):
    """
    Provides a browser instance that is already logged in as an Admin.
    Reused across multiple tests to save time.
    """
    browser.get(f"{FRONTEND_URL}/admin/login")
    
    # Wait for the login form
    email_input = WebDriverWait(browser, 30).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
    )
    email_input.clear()
    email_input.send_keys("admin_1@eramatch.com")
    
    password_input = browser.find_element(By.CSS_SELECTOR, "input[type='password']")
    password_input.clear()
    password_input.send_keys("1234567890")
    
    submit_button = browser.find_element(By.CSS_SELECTOR, "button[type='submit']")
    submit_button.click()
    
    # Wait until dashboard is loaded to confirm login success
    WebDriverWait(browser, 30).until(
        EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Dashboard') or contains(text(), 'Overview')]"))
    )
    
    return browser
