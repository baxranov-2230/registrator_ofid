from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class HemisLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class HemisTokenRequest(BaseModel):
    hemis_token: str = Field(min_length=10, max_length=2048)


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
