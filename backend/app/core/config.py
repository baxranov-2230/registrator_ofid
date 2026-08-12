from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values that ship in .env.example / docker-compose defaults. They must never
# survive into a non-dev deployment.
_INSECURE_SECRETS = {
    "dev-secret-change-me",
    "dev-secret-change-me-to-32-chars-pls",
    "dev-only-not-for-production-use-long-random-string-here-please",
    "change-me",
}
_INSECURE_DB_PASSWORDS = ("royd_dev_pw", "postgres", "password", "changeme", "")


def _db_password(url: str) -> str:
    """Password component of a SQLAlchemy URL, or '' if it cannot be parsed."""
    try:
        return urlsplit(url).password or ""
    except ValueError:
        return ""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "dev"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://royd:royd_dev_pw@localhost:5432/royd"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 7

    # Sessions die from inactivity, not from token expiry. Every authenticated
    # request bumps a per-session "last seen" key in Redis; a refresh whose
    # session has gone quiet for longer than this is rejected, so a user who is
    # actively working never gets logged out while an idle tab does.
    session_idle_timeout_minutes: int = 30

    # Refresh tokens ride in an httpOnly cookie so XSS cannot read them. Secure
    # is forced on outside dev; dev runs over plain http://localhost.
    refresh_cookie_name: str = "royd_refresh"
    refresh_cookie_path: str = "/api/v1/auth"
    refresh_cookie_samesite: str = "lax"
    refresh_cookie_domain: str = ""

    @property
    def refresh_cookie_secure(self) -> bool:
        return not self.is_dev

    hemis_base_url: str = "https://student.ndki.uz"
    hemis_login_path: str = "/rest/v1/auth/login"
    hemis_me_path: str = "/rest/v1/account/me"
    # Default OFF: the mock accepts any password for any username, so an
    # environment that forgets to set this must fail closed, not open (B-02).
    hemis_use_mock: bool = False

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@royd.uz"
    smtp_tls: bool = False
    email_max_retries: int = 3

    storage_dir: str = "./storage/uploads"
    max_upload_mb: int = 20

    cors_origins: str = "http://localhost:5173"

    rate_limit_per_minute: int = 120
    login_max_attempts_per_user: int = 5
    login_max_attempts_per_ip: int = 20
    login_window_seconds: int = 900

    sla_check_interval_minutes: int = 15

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def database_url_sync(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg2")

    @property
    def is_dev(self) -> bool:
        return self.env == "dev"

    @model_validator(mode="after")
    def _enforce_production_safety(self) -> "Settings":
        """Refuse to boot a non-dev environment with development defaults.

        Failing at startup is far safer than serving traffic with a publicly
        known signing key or an authentication bypass enabled (B-02, B-03, B-04).
        """
        if self.is_dev:
            return self

        problems: list[str] = []

        if self.jwt_secret in _INSECURE_SECRETS:
            problems.append("JWT_SECRET is still a known development value")
        if len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be at least 32 characters")
        if self.hemis_use_mock:
            problems.append("HEMIS_USE_MOCK must be false outside dev — it bypasses authentication")
        if "*" in self.cors_origins_list:
            problems.append("CORS_ORIGINS must list explicit origins, not '*'")
        if not self.cors_origins_list:
            problems.append("CORS_ORIGINS must not be empty")
        # Compare the password component only — matching against the whole URL
        # would flag the "postgres" inside the "postgresql+asyncpg" scheme.
        if _db_password(self.database_url) in _INSECURE_DB_PASSWORDS:
            problems.append("DATABASE_URL still uses a default password")

        if problems:
            raise ValueError(
                f"Refusing to start with ENV={self.env!r}:\n  - " + "\n  - ".join(problems)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
