"""Safe defaults for backend tests; never use these placeholders in deployment."""
import os

# The settings module validates required production credentials at import time.
# Unit tests use non-routable placeholder credentials and replace the DB clients
# with fakes, so importing the application never needs real Supabase secrets.
_TEST_SETTINGS = {
    "DB1_URL": "https://db1-test.invalid",
    "DB1_ANON_KEY": "test-anon-key-not-a-secret",
    "DB1_SERVICE_KEY": "test-service-key-not-a-secret",
    "DB2_URL": "https://db2-test.invalid",
    "DB2_SERVICE_KEY": "test-service-key-not-a-secret",
    "DB3_URL": "https://db3-test.invalid",
    "DB3_SERVICE_KEY": "test-service-key-not-a-secret",
    "DB4_URL": "https://db4-test.invalid",
    "DB4_SERVICE_KEY": "test-service-key-not-a-secret",
}
for _name, _value in _TEST_SETTINGS.items():
    os.environ.setdefault(_name, _value)
