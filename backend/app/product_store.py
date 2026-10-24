from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from typing import Any

from google.api_core.exceptions import AlreadyExists
from google.cloud.firestore import Client as FirestoreClient

from .schemas import FirestoreProduct, Product, SellerProductCreate, SellerProductUpdate, SellerProductView


class FirestoreProductService:
    def __init__(self, client: FirestoreClient, collection_name: str = "products") -> None:
        self._collection = client.collection(collection_name)

    @staticmethod
    def _to_api_product(document_id: str, data: Mapping[str, Any]) -> Product:
        normalized_data = dict(data)
        if "title" not in normalized_data and "name" in normalized_data:
            normalized_data["title"] = normalized_data["name"]
        if "imageUrls" not in normalized_data:
            normalized_data["imageUrls"] = normalized_data.get("images") or [normalized_data.get("image", "")]

        stored = FirestoreProduct.model_validate(normalized_data)
        return Product(
            id=document_id,
            name=stored.title,
            description=stored.description,
            category=stored.category,
            price=stored.price,
            material=stored.material,
            color=stored.color,
            dimensions=stored.dimensions,
            image=stored.image_urls[0],
            images=stored.image_urls,
            tags=stored.tags,
            featured=stored.featured,
            popular=stored.popular,
        )

    @staticmethod
    def _is_active(data: Mapping[str, Any]) -> bool:
        status = data.get("status", "active")
        if status not in {"active", "draft", "archived"}:
            raise ValueError(f"Invalid Firestore product status: {status}")
        return status == "active"

    def list_products(self) -> list[Product]:
        products: list[Product] = []
        for snapshot in self._collection.stream():
            data = snapshot.to_dict()
            if data is None:
                raise ValueError(f"Firestore product {snapshot.id} has no document data")
            if self._is_active(data):
                products.append(self._to_api_product(snapshot.id, data))
        return products

    def get_product(self, product_id: str) -> Product | None:
        snapshot = self._collection.document(product_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict()
        if data is None:
            raise ValueError(f"Firestore product {snapshot.id} has no document data")
        if not self._is_active(data):
            return None
        return self._to_api_product(snapshot.id, data)

    def list_seller_products(self, seller_id: str) -> list[SellerProductView]:
        products: list[SellerProductView] = []
        for snapshot in self._collection.stream():
            data = snapshot.to_dict()
            if data is None:
                raise ValueError(f"Firestore product {snapshot.id} has no document data")
            if data.get("sellerId") != seller_id:
                continue
            products.append(
                SellerProductView(
                    **self._to_api_product(snapshot.id, data).model_dump(),
                    status=data.get("status", "active"),
                )
            )
        return products

    def _owned_document(self, product_id: str, seller_id: str):
        document = self._collection.document(product_id)
        snapshot = document.get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict()
        if data is None:
            raise ValueError(f"Firestore product {snapshot.id} has no document data")
        if data.get("sellerId") != seller_id:
            return None
        return document, data

    def update_seller_product(
        self,
        product_id: str,
        seller_id: str,
        product: SellerProductUpdate,
    ) -> SellerProductView | None:
        owned = self._owned_document(product_id, seller_id)
        if owned is None:
            return None
        document, data = owned
        updates: dict[str, Any] = {}
        for field, value in product.model_dump(exclude_unset=True).items():
            if field == "image_url":
                updates["imageUrls"] = [str(value)]
            elif field == "dimensions":
                updates[field] = value
            else:
                updates[field if field != "status" else "status"] = value
        updates["updatedAt"] = datetime.now(timezone.utc)
        document.update(updates)
        data.update(updates)
        return SellerProductView(
            **self._to_api_product(product_id, data).model_dump(),
            status=data.get("status", "active"),
        )

    def delete_seller_product(self, product_id: str, seller_id: str) -> bool:
        owned = self._owned_document(product_id, seller_id)
        if owned is None:
            return False
        document, _ = owned
        document.delete()
        return True

    def create_seller_product(self, product: SellerProductCreate, seller_id: str) -> Product:
        image_url = str(product.image_url)
        data = FirestoreProduct(
            title=product.title,
            description=product.description,
            category=product.category,
            price=product.price,
            currency=product.currency,
            material=product.material,
            color=product.color,
            dimensions=product.dimensions,
            image_urls=[image_url],
            seller_id=seller_id,
            status="active",
        )
        document = self._collection.document()
        document.create(data.model_dump(by_alias=True))
        return self._to_api_product(document.id, data.model_dump(by_alias=True))

    def seed_product(self, product: Product, seller_id: str = "demo-seller") -> bool:
        data = FirestoreProduct(
            title=product.name,
            description=product.description,
            category=product.category,
            price=product.price,
            currency="INR",
            material=product.material,
            color=product.color,
            dimensions=product.dimensions,
            image_urls=product.images or [product.image],
            seller_id=seller_id,
            status="active",
            tags=product.tags,
            featured=product.featured,
            popular=product.popular,
        )
        try:
            self._collection.document(product.id).create(data.model_dump(by_alias=True))
        except AlreadyExists:
            return False
        return True

    def seed_products(self, products: Iterable[Product], seller_id: str = "demo-seller") -> tuple[int, int]:
        created = skipped = 0
        for product in products:
            if self.seed_product(product, seller_id=seller_id):
                created += 1
            else:
                skipped += 1
        return created, skipped
