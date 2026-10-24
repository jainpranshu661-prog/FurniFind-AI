import pytest
from pydantic import ValidationError

from backend.app.catalog import PRODUCTS
from backend.app.main import semantic_scores
from backend.app.schemas import FirestoreProduct
from backend.app.search import extract_preferences, filter_products, rank_products


def test_natural_language_query_matches_actual_catalog_details():
    results = rank_products(PRODUCTS, "a compact wooden desk for a small bedroom")
    assert results[0][0].id == "linea-desk"
    assert len(results) == 1
    assert "product type: Linea Writing Desk" in results[0][1]
    assert "wood material: Oak veneer, steel" in results[0][1]
    assert "compact" in results[0][1]


def test_budget_constraints_are_extracted_and_applied():
    results = rank_products(PRODUCTS, "a desk under ₹700")
    assert [product.id for product, _ in results] == ["linea-desk"]
    assert "within budget" in results[0][1]
    assert rank_products(PRODUCTS, "a desk under ₹600") == []


def test_price_range_and_explicit_material_are_respected():
    results = rank_products(PRODUCTS, "a wooden desk between ₹600 and ₹700")
    assert [product.id for product, _ in results] == ["linea-desk"]
    assert rank_products(PRODUCTS, "a leather chair under ₹1000") == []


def test_dimensions_and_rooms_are_available_as_search_metadata():
    results = rank_products(PRODUCTS, "a desk with a 60 cm dimension")
    assert [product.id for product, _ in results] == ["linea-desk"]
    assert "dimensions: W 120 × D 60 × H 75 cm" in results[0][1]


def test_preference_parser_distinguishes_dimensions_from_budget():
    preferences = extract_preferences("a compact desk for a small bedroom under ₹700 with a 60 cm dimension")
    assert preferences.max_price == 700
    assert preferences.item_type == "desk"
    assert preferences.rooms == ("bedroom",)
    assert preferences.sizes == ("compact", "small")
    assert preferences.dimensions_cm == (60,)
    dimension_limit = extract_preferences("a desk under 60 cm")
    assert dimension_limit.max_price is None
    assert dimension_limit.max_dimension_cm == 60
    assert rank_products(PRODUCTS, "a desk under 60 cm") == []
    assert [product.id for product, _ in rank_products(PRODUCTS, "a desk up to 130 cm")] == ["linea-desk"]


def test_room_and_style_preferences_rank_matching_catalog_metadata():
    results = rank_products(PRODUCTS, "minimal living room furniture")
    assert results[0][0].id == "marlow-coffee-table"


def test_keyword_search_survives_embedding_runtime_failure(monkeypatch, caplog):
    class BrokenEmbeddingModel:
        def encode(self, value):
            raise RuntimeError(f"embedding service unavailable for {type(value).__name__}")

    monkeypatch.setattr("backend.app.main.embedding_model", BrokenEmbeddingModel())
    scores = semantic_scores("compact desk", PRODUCTS)

    assert scores == {}
    assert rank_products(PRODUCTS, "compact desk", scores)[0][0].id == "linea-desk"
    assert "Embedding search failed; using keyword search" in caplog.text


def test_unmatched_query_does_not_invent_results():
    assert rank_products(PRODUCTS, "blue leather recliner") == []


def test_filter_composes_category_and_price():
    results = filter_products(PRODUCTS, category="Living room", max_price=500)
    assert {product.id for product in results} == {"arc-lounge-chair", "woven-storage-bench"}


def test_firestore_product_schema_requires_numeric_inr_price_and_image_urls():
    with pytest.raises(ValidationError):
        FirestoreProduct(
            title="Invalid price",
            description="A product",
            category="Office",
            price="400",
            material="Wood",
            color="Natural",
            imageUrls=["https://example.com/image.png"],
            sellerId="seller-1",
        )

    with pytest.raises(ValidationError):
        FirestoreProduct(
            title="Invalid image",
            description="A product",
            category="Office",
            price=400,
            material="Wood",
            color="Natural",
            imageUrls=["not-a-url"],
            sellerId="seller-1",
        )

    valid_integer_price = FirestoreProduct(
        title="Numeric price",
        description="A product",
        category="Office",
        price=400,
        material="Wood",
        color="Natural",
        imageUrls=["https://example.com/image.png"],
        sellerId="seller-1",
    )
    assert valid_integer_price.price == 400
    assert valid_integer_price.currency == "INR"
