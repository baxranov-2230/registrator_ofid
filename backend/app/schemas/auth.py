from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import check_password_strength


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    # Optional: the refresh token normally arrives in the httpOnly cookie, and
    # the browser posts an empty body. Requiring it here made a page reload
    # fail with 422 before the cookie was ever consulted. Non-browser clients
    # may still send it explicitly.
    refresh_token: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    """Either a token pair, or — for an account with 2FA on — a short-lived
    `mfa_token` to present together with the authenticator code at
    `/auth/login/2fa`. The tokens are absent in the second case."""

    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    mfa_required: bool = False
    mfa_token: str | None = None


class MfaLoginRequest(BaseModel):
    mfa_token: str = Field(min_length=10, max_length=2048)
    code: str = Field(min_length=6, max_length=10)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(max_length=128)

    _strength = field_validator("new_password")(check_password_strength)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(max_length=128)

    _strength = field_validator("new_password")(check_password_strength)


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_url: str
    #: The otpauth URL as a scannable QR code (SVG data URI).
    qr_svg: str


class TotpCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class TotpDisableRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=10)
