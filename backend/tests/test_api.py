import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app.catalog import PRODUCTS
from backend.app.firestore import initialize_firestore
from backend.app.main import app
from backend.app.product_store import FirestoreProductService
from backend.app.settings import Settings


class FakeSnapshot:
    def __init__(self, document_id: str, data: dict | None) -> None:
        self.id = document_id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict | None:
        return self._data.copy() if self._data is not None else None


class FakeDocumentReference:
    def __init__(self, collection: "FakeCollection", document_id: str) -> None:
        self.collection = collection
        self.document_id = document_id
        self.id = document_id

    def get(self) -> FakeSnapshot:
        return FakeSnapshot(self.document_id, self.collection.documents.get(self.document_id))

    def create(self, data: dict) -> None:
        from google.api_core.exceptions import AlreadyExists

        if self.document_id in self.collection.documents:
            raise AlreadyExists("Document already exists")
        self.collection.documents[self.document_id] = data

    def update(self, data: dict) -> None:
        if self.document_id not in self.collection.documents:
            raise KeyError(self.document_id)
        self.collection.documents[self.document_id].update(data)

    def delete(self) -> None:
        self.collection.documents.pop(self.document_id, None)


class FakeCollection:
    def __init__(self) -> None:
        self.documents: dict[str, dict] = {}
        self.generated_id = 0

    def document(self, document_id: str | None = None) -> FakeDocumentReference:
        if document_id is None:
            self.generated_id += 1
            document_id = f"generated-{self.generated_id}"
        return FakeDocumentReference(self, document_id)

    def stream(self):
        return (
            FakeSnapshot(document_id, data)
            for document_id, data in self.documents.items()
        )


class FakeFirestoreClient:
    def __init__(self) -> None:
        self.products = FakeCollection()

    def collection(self, name: str) -> FakeCollection:
        assert name == "products"
        return self.products


def test_catalog_search_and_detail_fallback():
    with TestClient(app) as client:
        response = client.get("/api/products", params={"q": "compact desk", "page_size": 9})
        assert response.status_code == 200
        payload = response.json()
        assert payload["items"][0]["id"] == "linea-desk"
        assert "catalog details" in payload["items"][0]["match_reason"]
        assert client.get("/api/products/unknown").status_code == 404


def test_catalog_endpoints_reject_invalid_pagination_and_sort_and_allow_empty_results():
    with TestClient(app) as client:
        assert client.get("/api/products", params={"page": 0}).status_code == 422
        assert client.get("/api/products", params={"page_size": 49}).status_code == 422
        assert client.get("/api/products", params={"sort": "newest"}).status_code == 422

        empty = client.get("/api/products", params={"category": "No such room"})
        assert empty.status_code == 200
        assert empty.json() == {"items": [], "total": 0, "page": 1, "page_size": 12}


def test_natural_language_search_applies_budget_and_product_type():
    with TestClient(app) as client:
        response = client.get("/api/products", params={"q": "a wooden desk under ₹700"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["items"][0]["id"] == "linea-desk"
        assert "within budget" in payload["items"][0]["match_reason"]


def test_assistant_uses_catalog_without_openai_key(monkeypatch):
    monkeypatch.setattr("backend.app.main.OPENAI_API_KEY", "")
    with TestClient(app) as client:
        response = client.post("/api/assistant", json={"question": "Find a compact desk"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["mode"] == "catalog"
        assert "Linea Writing Desk" in payload["answer"]
        assert "linea-desk" in payload["grounded_product_ids"]


def test_assistant_returns_no_unrelated_products_when_query_has_no_match(monkeypatch):
    monkeypatch.setattr("backend.app.main.OPENAI_API_KEY", "")
    with TestClient(app) as client:
        response = client.post("/api/assistant", json={"question": "blue leather recliner"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["mode"] == "catalog"
        assert payload["grounded_product_ids"] == []
        assert "couldn't find a matching product" in payload["answer"]


def test_firestore_is_optional_without_firebase_configuration():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["firestore"] == "disabled"


def test_cors_allows_configured_origins_without_wildcard_access():
    with TestClient(app) as client:
        allowed = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        denied = client.options(
            "/api/health",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers


def test_cors_settings_reject_wildcard_origins():
    with pytest.raises(ValidationError):
        Settings(cors_allowed_origins="https://shop.example,*")


def test_firestore_project_id_alone_does_not_attempt_credentials():
    assert initialize_firestore(project_id="furnifind-e730d") is None


def test_firestore_product_api_filters_sorts_and_paginates(monkeypatch):
    client = FakeFirestoreClient()
    service = FirestoreProductService(client)
    service.seed_products(PRODUCTS)
    monkeypatch.setattr("backend.app.main.initialize_firestore", lambda *_: client)

    with TestClient(app) as test_client:
        response = test_client.get(
            "/api/products",
            params={
                "category": "Office",
                "min_price": 400,
                "max_price": 700,
                "sort": "price-asc",
                "page": 1,
                "page_size": 1,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 2
        assert payload["items"][0]["id"] == "task-chair"
        assert payload["items"][0]["name"] == "Form Task Chair"

        second_page = test_client.get(
            "/api/products",
            params={
                "category": "Office",
                "sort": "price-asc",
                "page": 2,
                "page_size": 1,
            },
        )
        assert second_page.status_code == 200
        assert second_page.json()["items"][0]["id"] == "linea-desk"

        filtered = test_client.get(
            "/api/products",
            params={"material": "aluminium", "color": "charcoal"},
        )
        assert filtered.status_code == 200
        assert [item["id"] for item in filtered.json()["items"]] == ["task-chair"]


def test_catalog_facets_reflect_active_firestore_products(monkeypatch):
    client = FakeFirestoreClient()
    service = FirestoreProductService(client)
    service.seed_products(PRODUCTS)
    client.products.document("arc-lounge-chair").update({"status": "draft"})
    monkeypatch.setattr("backend.app.main.initialize_firestore", lambda *_: client)

    with TestClient(app) as test_client:
        response = test_client.get("/api/catalog-facets")

    assert response.status_code == 200
    payload = response.json()
    active_products = [item for item in PRODUCTS if item.id != "arc-lounge-chair"]
    assert payload["categories"] == sorted({item.category for item in active_products})
    assert payload["materials"] == sorted({item.material for item in active_products})
    assert payload["colors"] == sorted({item.color for item in active_products})
    assert "Solid oak, linen" not in payload["materials"]


def test_firestore_product_detail_uses_document_and_hides_inactive_products(monkeypatch):
    client = FakeFirestoreClient()
    service = FirestoreProductService(client)
    service.seed_product(PRODUCTS[0])
    client.products.documents["draft-chair"] = {"status": "draft"}
    monkeypatch.setattr("backend.app.main.initialize_firestore", lambda *_: client)

    with TestClient(app) as test_client:
        response = test_client.get(f"/api/products/{PRODUCTS[0].id}")
        assert response.status_code == 200
        assert response.json()["name"] == PRODUCTS[0].name
        assert test_client.get("/api/products/draft-chair").status_code == 404
        assert test_client.get("/api/products").json()["total"] == 1


def test_firestore_seed_is_repeatable_and_preserves_existing_document():
    client = FakeFirestoreClient()
    service = FirestoreProductService(client)
    original = PRODUCTS[0].model_copy()
    changed = original.model_copy(update={"name": "Do not overwrite"})

    assert service.seed_product(original) is True
    assert service.seed_product(changed) is False
    assert client.products.documents[original.id]["title"] == original.name
    assert client.products.documents[original.id]["currency"] == "INR"
    assert client.products.documents[original.id]["sellerId"] == "demo-seller"
    assert isinstance(client.products.documents[original.id]["price"], float)
    assert client.products.documents[original.id]["imageUrls"] == original.images
    assert client.products.documents[original.id]["status"] == "active"
    assert client.products.documents[original.id]["createdAt"].tzinfo is not None
    assert client.products.documents[original.id]["updatedAt"].tzinfo is not None


def test_seller_product_creation_requires_verified_token_and_assigns_owner(monkeypatch):
    from backend.app import main

    client = FakeFirestoreClient()
    monkeypatch.setattr(main, "initialize_firestore", lambda *_: client)

    def verify_token(token, check_revoked):
        assert token == "test-id-token"
        assert check_revoked is True
        return {"uid": "verified-seller"}

    monkeypatch.setattr(main.auth, "verify_id_token", verify_token)
    product_payload = {
        "title": "Seller's Chair",
        "description": "A carefully made chair.",
        "category": "Living room",
        "price": 1500,
        "currency": "INR",
        "material": "Oak",
        "color": "Natural",
        "dimensions": "70 x 80 cm",
        "imageUrl": "https://example.com/chair.jpg",
    }

    with TestClient(app) as test_client:
        unauthorized = test_client.post("/api/seller/products", json=product_payload)
        assert unauthorized.status_code == 401

        response = test_client.post(
            "/api/seller/products",
            json=product_payload,
            headers={"Authorization": "Bearer test-id-token"},
        )
        assert response.status_code == 201
        created = response.json()
        assert created["id"] == "generated-1"
        assert created["name"] == "Seller's Chair"
        stored = client.products.documents[created["id"]]
        assert stored["sellerId"] == "verified-seller"
        assert stored["price"] == 1500.0
        assert stored["currency"] == "INR"

        spoofed = test_client.post(
            "/api/seller/products",
            json={**product_payload, "sellerId": "attacker"},
            headers={"Authorization": "Bearer test-id-token"},
        )
        assert spoofed.status_code == 422

        listed = test_client.get("/api/products")
        assert listed.status_code == 200
        public_items = listed.json()["items"]
        public_product = next(item for item in public_items if item["id"] == created["id"])
        assert "sellerId" not in public_product
        assert "seller_id" not in public_product
        assert "status" not in public_product
        public_detail = test_client.get(f"/api/products/{created['id']}")
        assert public_detail.status_code == 200
        assert "sellerId" not in public_detail.json()
        assert "status" not in public_detail.json()


def test_seller_product_creation_rejects_invalid_firebase_token(monkeypatch):
    from backend.app import main

    client = FakeFirestoreClient()
    monkeypatch.setattr(main, "initialize_firestore", lambda *_: client)

    def reject_token(token, check_revoked):
        raise ValueError("Invalid token")

    monkeypatch.setattr(main.auth, "verify_id_token", reject_token)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/seller/products",
            json={
                "title": "Chair",
                "description": "A chair.",
                "category": "Living room",
                "price": 1500,
                "material": "Oak",
                "color": "Natural",
                "imageUrl": "https://example.com/chair.jpg",
            },
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response.status_code == 401
        assert client.products.documents == {}


def test_seller_product_creation_validates_price_and_image_url(monkeypatch):
    from backend.app import main

    client = FakeFirestoreClient()
    monkeypatch.setattr(main, "initialize_firestore", lambda *_: client)
    monkeypatch.setattr(
        main.auth,
        "verify_id_token",
        lambda token, check_revoked: {"uid": "verified-seller"},
    )
    with TestClient(app) as test_client:
        base_payload = {
            "title": "Chair",
            "description": "A chair.",
            "category": "Living room",
            "price": 1500,
            "material": "Oak",
            "color": "Natural",
            "imageUrl": "https://example.com/chair.jpg",
        }
        assert test_client.post(
            "/api/seller/products",
            json={**base_payload, "price": -1},
            headers={"Authorization": "Bearer invalid"},
        ).status_code == 422


def test_seller_product_creation_rejects_invalid_image_url(monkeypatch):
    from backend.app import main

    client = FakeFirestoreClient()
    monkeypatch.setattr(main, "initialize_firestore", lambda *_: client)
    monkeypatch.setattr(
        main.auth,
        "verify_id_token",
        lambda token, check_revoked: {"uid": "verified-seller"},
    )
    payload = {
        "title": "Chair",
        "description": "A chair.",
        "category": "Living room",
        "price": 1500,
        "material": "Oak",
        "color": "Natural",
        "imageUrl": "javascript:alert(1)",
    }
    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/seller/products",
            json=payload,
            headers={"Authorization": "Bearer test-token"},
        )
    assert response.status_code == 422


def test_sellers_can_manage_only_their_own_products(monkeypatch):
    from backend.app import main

    client = FakeFirestoreClient()
    service = FirestoreProductService(client)
    service.seed_products(PRODUCTS)
    monkeypatch.setattr(main, "initialize_firestore", lambda *_: client)

    def verify_token(token, check_revoked):
        assert check_revoked is True
        return {"uid": token}

    monkeypatch.setattr(main.auth, "verify_id_token", verify_token)
    product_payload = {
        "title": "Owner's Chair",
        "description": "A chair owned by one seller.",
        "category": "Living room",
        "price": 850,
        "material": "Oak",
        "color": "Natural",
        "imageUrl": "https://example.com/owners-chair.jpg",
    }

    with TestClient(app) as test_client:
        created_response = test_client.post(
            "/api/seller/products",
            json=product_payload,
            headers={"Authorization": "Bearer seller-one"},
        )
        assert created_response.status_code == 201
        product_id = created_response.json()["id"]

        owner_headers = {"Authorization": "Bearer seller-one"}
        other_headers = {"Authorization": "Bearer seller-two"}
        assert test_client.get("/api/seller/products", headers=owner_headers).json()[0]["id"] == product_id
        assert product_id not in {item["id"] for item in test_client.get("/api/seller/products", headers=other_headers).json()}

        assert test_client.patch(
            f"/api/seller/products/{product_id}",
            json={"title": "Updated chair", "price": 900},
            headers=other_headers,
        ).status_code == 404
        assert test_client.delete(f"/api/seller/products/{product_id}", headers=other_headers).status_code == 404

        updated = test_client.patch(
            f"/api/seller/products/{product_id}",
            json={"title": "Updated chair", "price": 900, "status": "draft"},
            headers=owner_headers,
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Updated chair"
        assert updated.json()["status"] == "draft"
        assert product_id not in {item["id"] for item in test_client.get("/api/products").json()["items"]}

        activated = test_client.patch(
            f"/api/seller/products/{product_id}",
            json={"status": "active"},
            headers=owner_headers,
        )
        assert activated.status_code == 200
        public_catalog = test_client.get("/api/products", params={"page_size": 48}).json()
        assert public_catalog["total"] == len(PRODUCTS) + 1
        assert product_id in {item["id"] for item in public_catalog["items"]}

        assert test_client.patch(
            f"/api/seller/products/{product_id}",
            json={"imageUrl": "javascript:alert(1)"},
            headers=owner_headers,
        ).status_code == 422
        assert test_client.patch(
            f"/api/seller/products/{product_id}",
            json={"sellerId": "seller-two"},
            headers=owner_headers,
        ).status_code == 422
        assert test_client.delete(f"/api/seller/products/{product_id}", headers=owner_headers).status_code == 204
        assert test_client.get(f"/api/products/{product_id}").status_code == 404


def test_seller_product_management_requires_valid_token(monkeypatch):
    from backend.app import main

    client = FakeFirestoreClient()
    monkeypatch.setattr(main, "initialize_firestore", lambda *_: client)
    monkeypatch.setattr(main.auth, "verify_id_token", lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("invalid")))

    base_payload = {
        "title": "Chair",
        "description": "A chair.",
        "category": "Living room",
        "price": 1500,
        "material": "Oak",
        "color": "Natural",
        "imageUrl": "https://example.com/chair.jpg",
    }
    with TestClient(app) as test_client:
        for method, path in (
            ("get", "/api/seller/products"),
            ("patch", "/api/seller/products/missing"),
            ("delete", "/api/seller/products/missing"),
        ):
            if method == "patch":
                response = test_client.patch(path, json={}, headers={"Authorization": "Bearer invalid"})
            else:
                response = getattr(test_client, method)(path, headers={"Authorization": "Bearer invalid"})
            assert response.status_code == 401
        assert test_client.post("/api/seller/products", json=base_payload, headers={"Authorization": "Bearer invalid-token"}).status_code == 401
