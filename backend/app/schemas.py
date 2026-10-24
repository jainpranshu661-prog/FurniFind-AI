from datetime import datetime, timezone
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator


class Product(BaseModel):
    id: str
    name: str
    category: str
    price: float
    description: str
    material: str
    color: str
    dimensions: str | None = None
    image: str
    images: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    featured: bool = False
    popular: bool = False


class FirestoreProduct(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1)
    category: str = Field(min_length=1, max_length=80)
    price: float = Field(strict=True, gt=0, allow_inf_nan=False)
    currency: Literal["INR"] = "INR"
    material: str = Field(min_length=1, max_length=180)
    color: str = Field(min_length=1, max_length=100)
    dimensions: str | None = None
    image_urls: list[str] = Field(min_length=1, alias="imageUrls")
    seller_id: str = Field(min_length=1, alias="sellerId")
    status: Literal["active", "draft", "archived"] = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), alias="createdAt")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), alias="updatedAt")
    tags: list[str] = Field(default_factory=list)
    featured: bool = False
    popular: bool = False

    @field_validator("image_urls")
    @classmethod
    def validate_image_urls(cls, urls: list[str]) -> list[str]:
        validated_urls = [AnyHttpUrl(url) for url in urls]
        return [str(url) for url in validated_urls]


class SellerProductCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1, max_length=5000)
    category: str = Field(min_length=1, max_length=80)
    price: float = Field(strict=True, gt=0, allow_inf_nan=False)
    currency: Literal["INR"] = "INR"
    material: str = Field(min_length=1, max_length=180)
    color: str = Field(min_length=1, max_length=100)
    dimensions: str | None = Field(default=None, max_length=180)
    image_url: AnyHttpUrl = Field(alias="imageUrl")

    @field_validator("title", "description", "category", "material", "color")
    @classmethod
    def validate_nonblank_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field must not be blank")
        return stripped


class SellerProductUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    price: float | None = Field(default=None, strict=True, gt=0, allow_inf_nan=False)
    material: str | None = Field(default=None, min_length=1, max_length=180)
    color: str | None = Field(default=None, min_length=1, max_length=100)
    dimensions: str | None = Field(default=None, max_length=180)
    image_url: AnyHttpUrl | None = Field(default=None, alias="imageUrl")
    status: Literal["active", "draft", "archived"] | None = None

    @field_validator("title", "description", "category", "material", "color")
    @classmethod
    def validate_nonblank_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field must not be blank")
        return stripped

    @model_validator(mode="after")
    def validate_patch(self) -> "SellerProductUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be updated")
        nullable_fields = {"dimensions"}
        for field in self.model_fields_set - nullable_fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class SellerProductView(Product):
    status: Literal["active", "draft", "archived"]


class ProductResult(Product):
    match_reason: str | None = None


class SearchResponse(BaseModel):
    items: list[ProductResult]
    total: int
    page: int
    page_size: int


class AssistantRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    product_ids: list[str] = Field(default_factory=list, max_length=12)


class AssistantResponse(BaseModel):
    answer: str
    grounded_product_ids: list[str]
    mode: str


class CompareRequest(BaseModel):
    product_ids: list[str] = Field(min_length=2, max_length=3)


class CompareResponse(BaseModel):
    summary: str
    mode: str
