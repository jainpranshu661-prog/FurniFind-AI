from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

	database_url: str = ""
	firebase_project_id: str = ""
	google_application_credentials: str = ""
	firebase_use_application_default_credentials: bool = False
	cors_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
	openai_api_key: str = ""
	openai_model: str = "gpt-4o-mini"
	enable_embeddings: bool = False

	@field_validator("cors_allowed_origins")
	@classmethod
	def validate_cors_allowed_origins(cls, value: str) -> str:
		origins = [origin.strip() for origin in value.split(",")]
		if "*" in origins:
			raise ValueError("CORS_ALLOWED_ORIGINS must contain exact origins, not a wildcard")
		return ",".join(origin for origin in origins if origin)


settings = Settings()
DATABASE_URL = settings.database_url
FIREBASE_PROJECT_ID = settings.firebase_project_id
GOOGLE_APPLICATION_CREDENTIALS = settings.google_application_credentials
FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS = settings.firebase_use_application_default_credentials
CORS_ALLOWED_ORIGINS = settings.cors_allowed_origins
OPENAI_API_KEY = settings.openai_api_key
OPENAI_MODEL = settings.openai_model
ENABLE_EMBEDDINGS = settings.enable_embeddings
