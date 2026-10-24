from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from math import sqrt
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.api_core.exceptions import GoogleAPICallError
from firebase_admin import auth
from firebase_admin.exceptions import FirebaseError
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from .catalog import PRODUCTS, get_product
from .firestore import initialize_firestore
from .models import Base, ProductRecord
from .product_store import FirestoreProductService
from .schemas import AssistantRequest, AssistantResponse, CompareRequest, CompareResponse, Product, ProductResult, SearchResponse, SellerProductCreate, SellerProductUpdate, SellerProductView
from .search import extract_preferences, filter_products, rank_products, tokens
from .settings import CORS_ALLOWED_ORIGINS, DATABASE_URL, ENABLE_EMBEDDINGS, FIREBASE_PROJECT_ID, FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS, GOOGLE_APPLICATION_CREDENTIALS, OPENAI_API_KEY, OPENAI_MODEL

logger = logging.getLogger(__name__)
engine = None
embedding_model = None
firestore_db = None
bearer_scheme = HTTPBearer(auto_error=False)


def _record_values(product: Product) -> dict[str, Any]:
    return product.model_dump()


def _init_database() -> None:
    global engine
    if not DATABASE_URL:
        return
    try:
        engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        with engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            existing = set(session.scalars(select(ProductRecord.id)).all())
            for product in PRODUCTS:
                if product.id not in existing:
                    session.add(ProductRecord(**_record_values(product)))
            session.commit()
        if ENABLE_EMBEDDINGS:
            _initialize_embeddings()
    except Exception:
        logger.exception("Database unavailable; using the bundled read-only catalog")
        engine = None


def _get_embedding_model():
    global embedding_model
    if embedding_model is None and ENABLE_EMBEDDINGS:
        try:
            from sentence_transformers import SentenceTransformer

            embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        except Exception:
            logger.exception("Sentence Transformers could not load; using keyword search")
    return embedding_model


def _embedding_text(product: Product) -> str:
    return " ".join([product.name, product.category, product.description, product.material, product.color, *product.tags])


def _initialize_embeddings() -> None:
    model = _get_embedding_model()
    if model is None or engine is None or ProductRecord.embedding is None:
        return
    with Session(engine) as session:
        records = session.scalars(select(ProductRecord).where(ProductRecord.embedding.is_(None))).all()
        if records:
            vectors = model.encode([_embedding_text(Product.model_validate(row, from_attributes=True)) for row in records])
            for record, vector in zip(records, vectors):
                record.embedding = vector.tolist()
            session.commit()


def semantic_scores(query: str, products: list[Product]) -> dict[str, float]:
    model = _get_embedding_model()
    if model is None or not products:
        return {}
    try:
        query_vector = model.encode(query).tolist()
        if engine is not None and ProductRecord.embedding is not None:
            product_ids = [product.id for product in products]
            distance = ProductRecord.embedding.cosine_distance(query_vector)
            with Session(engine) as session:
                rows = session.execute(select(ProductRecord.id, distance).where(ProductRecord.id.in_(product_ids), ProductRecord.embedding.is_not(None))).all()
            return {product_id: 1.0 - float(value) for product_id, value in rows}
        vectors = model.encode([_embedding_text(product) for product in products])
        query_length = sqrt(sum(value * value for value in query_vector)) or 1.0
        scores: dict[str, float] = {}
        for product, vector in zip(products, vectors):
            product_length = sqrt(sum(float(value) * float(value) for value in vector)) or 1.0
            dot = sum(float(left) * float(right) for left, right in zip(query_vector, vector))
            scores[product.id] = dot / (query_length * product_length)
        return scores
    except Exception:
        logger.exception("Embedding search failed; using keyword search")
        return {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    global firestore_db
    _init_database()
    firestore_db = initialize_firestore(
        FIREBASE_PROJECT_ID,
        GOOGLE_APPLICATION_CREDENTIALS,
        FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS,
    )
    try:
        yield
    finally:
        firestore_db = None
        if engine is not None:
            engine.dispose()


app = FastAPI(title="FurniFind AI API", version="1.0.0", description="Furniture discovery, catalog search, and grounded shopping assistance.", lifespan=lifespan)
cors_origins = [origin.strip() for origin in CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def all_products() -> list[Product]:
    if firestore_db is not None:
        return FirestoreProductService(firestore_db).list_products()
    if engine is not None:
        try:
            with Session(engine) as session:
                rows = session.scalars(select(ProductRecord)).all()
                if rows:
                    return [Product.model_validate(row, from_attributes=True) for row in rows]
        except Exception:
            logger.exception("Catalog read failed; using bundled products")
    return PRODUCTS.copy()


def authenticated_seller(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="A Firebase bearer token is required")
    try:
        claims = auth.verify_id_token(credentials.credentials, check_revoked=True)
    except (FirebaseError, ValueError) as error:
        raise HTTPException(status_code=401, detail="Firebase authentication failed") from error
    seller_id = claims.get("uid")
    if not isinstance(seller_id, str) or not seller_id:
        raise HTTPException(status_code=401, detail="Firebase token has no seller identity")
    if firestore_db is None:
        raise HTTPException(status_code=503, detail="Seller product storage is not configured")
    return seller_id


def ai_completion(system: str, prompt: str) -> str | None:
    if not OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI

        response = OpenAI(api_key=OPENAI_API_KEY, timeout=12.0).chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0.2,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content
    except Exception:
        logger.exception("OpenAI request failed; returning the catalog-based fallback")
        return None


def product_facts(products: list[Product]) -> str:
    return "\n".join(
        f"{p.name} | id={p.id} | ₹{p.price:.2f} INR | category={p.category} | material={p.material} | color={p.color} | dimensions={p.dimensions or 'not listed'} | description={p.description}"
        for p in products
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "catalog": "firestore" if firestore_db is not None else "postgresql" if engine is not None else "bundled",
        "assistant": "openai" if OPENAI_API_KEY else "catalog fallback",
        "firestore": "enabled" if firestore_db is not None else "disabled",
    }


@app.get("/api/categories")
def categories() -> list[str]:
    return sorted({product.category for product in all_products()})


@app.get("/api/catalog-facets")
def catalog_facets() -> dict[str, list[str]]:
    products = all_products()
    return {
        "categories": sorted({product.category for product in products}),
        "materials": sorted({product.material for product in products}),
        "colors": sorted({product.color for product in products}),
    }


@app.get("/api/products", response_model=SearchResponse)
def list_products(
    q: str = "",
    category: str | None = None,
    material: str | None = None,
    color: str | None = None,
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    popular_only: bool = False,
    sort: str = "relevance",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=48),
) -> SearchResponse:
    source = filter_products(all_products(), category=category, material=material, color=color, min_price=min_price, max_price=max_price)
    if popular_only:
        source = [product for product in source if product.popular]
    ranked = rank_products(source, q, semantic_scores(q, source) if q else None)
    if sort == "price-asc":
        ranked.sort(key=lambda item: item[0].price)
    elif sort == "price-desc":
        ranked.sort(key=lambda item: item[0].price, reverse=True)
    elif sort not in {"relevance", "price-asc", "price-desc"}:
        raise HTTPException(status_code=422, detail="sort must be relevance, price-asc, or price-desc")
    total = len(ranked)
    start = (page - 1) * page_size
    items = [ProductResult(**product.model_dump(), match_reason=reason) for product, reason in ranked[start : start + page_size]]
    return SearchResponse(items=items, total=total, page=page, page_size=page_size)


@app.get("/api/products/{product_id}", response_model=Product)
def product_detail(product_id: str) -> Product:
    if firestore_db is not None:
        product = FirestoreProductService(firestore_db).get_product(product_id)
        if product is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return product
    product = next((item for item in all_products() if item.id == product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@app.post("/api/seller/products", response_model=Product, status_code=201)
def create_seller_product(
    product: SellerProductCreate,
    seller_id: str = Depends(authenticated_seller),
) -> Product:
    if firestore_db is None:
        raise HTTPException(status_code=503, detail="Seller product storage is not configured")
    try:
        return FirestoreProductService(firestore_db).create_seller_product(product, seller_id)
    except GoogleAPICallError:
        logger.exception("Could not create Firestore product for seller")
        raise HTTPException(status_code=503, detail="Could not save the product") from None


@app.get("/api/seller/products", response_model=list[SellerProductView])
def seller_products(
    seller_id: str = Depends(authenticated_seller),
) -> list[SellerProductView]:
    try:
        return FirestoreProductService(firestore_db).list_seller_products(seller_id)
    except GoogleAPICallError:
        logger.exception("Could not list seller products")
        raise HTTPException(status_code=503, detail="Could not load seller products") from None


@app.patch("/api/seller/products/{product_id}", response_model=SellerProductView)
def update_seller_product(
    product_id: str,
    product: SellerProductUpdate,
    seller_id: str = Depends(authenticated_seller),
) -> SellerProductView:
    try:
        updated = FirestoreProductService(firestore_db).update_seller_product(product_id, seller_id, product)
    except GoogleAPICallError:
        logger.exception("Could not update seller product")
        raise HTTPException(status_code=503, detail="Could not update the product") from None
    if updated is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return updated


@app.delete("/api/seller/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_seller_product(
    product_id: str,
    seller_id: str = Depends(authenticated_seller),
) -> Response:
    try:
        deleted = FirestoreProductService(firestore_db).delete_seller_product(product_id, seller_id)
    except GoogleAPICallError:
        logger.exception("Could not delete seller product")
        raise HTTPException(status_code=503, detail="Could not delete the product") from None
    if not deleted:
        raise HTTPException(status_code=404, detail="Product not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/products/{product_id}/similar", response_model=list[ProductResult])
def similar_products(product_id: str, limit: int = Query(default=4, ge=1, le=12)) -> list[ProductResult]:
    products = all_products()
    product = next((item for item in products if item.id == product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    query = " ".join([product.category, product.material, product.color, *product.tags])
    ranked = [(item, reason) for item, reason in rank_products(products, query) if item.id != product_id]
    return [ProductResult(**item.model_dump(), match_reason=reason) for item, reason in ranked[:limit]]


@app.get("/api/recommendations", response_model=list[Product])
def recommendations(limit: int = Query(default=8, ge=1, le=24)) -> list[Product]:
    products = all_products()
    sorted_products = sorted(products, key=lambda item: (not item.featured, not item.popular, item.name))
    return sorted_products[:limit]


@app.post("/api/assistant", response_model=AssistantResponse)
def assistant(request: AssistantRequest) -> AssistantResponse:
    products = all_products()
    preferences = extract_preferences(request.question)
    ranked = rank_products(products, request.question)
    context_products = [item for item in products if item.id in request.product_ids]
    if not tokens(request.question) and not preferences.has_hard_constraints:
        ranked = []
        selected = context_products[:3]
        reasons: dict[str, str | None] = {}
    else:
        selected = [item for item, _ in ranked[:3]]
        reasons = {item.id: reason for item, reason in ranked[:3]}

    if not selected:
        answer = "I couldn't find a matching product in the current catalog. Try describing the furniture type, material, color, or a different budget."
        return AssistantResponse(answer=answer, grounded_product_ids=[], mode="catalog")

    answer = ai_completion(
        "You are FurniFind's shopping assistant. Recommend only products present in the supplied catalog facts. Prices are in Indian rupees (INR); use ₹ when mentioning prices. Never invent product features, stock, delivery, or specifications. If the catalog does not answer a question, say what is missing. Be concise.",
        f"Customer question: {request.question}\nCatalog facts:\n{product_facts(selected)}",
    )
    mode = "openai" if answer else "catalog"
    if not answer:
        suggestions = "; ".join(
            f"{item.name} (₹{item.price:.0f}), {item.material}, {item.color}"
            + (f" — {reasons[item.id]}" if reasons.get(item.id) else "")
            for item in selected[:3]
        )
        answer = f"Based on the products in our catalog, you might like {suggestions}. Product dimensions and descriptions are listed on each product page; I don't have verified information beyond those details."
    return AssistantResponse(answer=answer, grounded_product_ids=[item.id for item in selected], mode=mode)


@app.post("/api/compare-summary", response_model=CompareResponse)
def compare_summary(request: CompareRequest) -> CompareResponse:
    catalog = {item.id: item for item in all_products()}
    products = [catalog[item_id] for item_id in request.product_ids if item_id in catalog]
    if len(products) != len(request.product_ids):
        raise HTTPException(status_code=404, detail="One or more products were not found")
    answer = ai_completion(
        "Compare only the supplied product facts. Prices are in Indian rupees (INR); use ₹ when mentioning prices. State differences plainly and do not infer quality, comfort, durability, or features that are not listed. Say when a field is not listed.",
        "Compare these products using only their catalog facts:\n" + product_facts(products),
    )
    if answer:
        return CompareResponse(summary=answer, mode="openai")
    price_span = max(item.price for item in products) - min(item.price for item in products)
    materials = ", ".join(dict.fromkeys(item.material for item in products))
    categories = ", ".join(dict.fromkeys(item.category for item in products))
    summary = f"These {len(products)} items span {categories}. Their listed materials are {materials}. The price difference between the least and most expensive is ₹{price_span:.0f}. Compare dimensions and color above; any detail marked 'Not listed' is absent from the catalog."
    return CompareResponse(summary=summary, mode="catalog")
