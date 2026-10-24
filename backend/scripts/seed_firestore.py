import logging

from backend.app.catalog import PRODUCTS
from backend.app.firestore import initialize_firestore
from backend.app.product_store import FirestoreProductService
from backend.app.settings import (
    FIREBASE_PROJECT_ID,
    FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS,
    GOOGLE_APPLICATION_CREDENTIALS,
)

logger = logging.getLogger(__name__)


def main() -> None:
    client = initialize_firestore(
        FIREBASE_PROJECT_ID,
        GOOGLE_APPLICATION_CREDENTIALS,
        FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS,
    )
    if client is None:
        raise RuntimeError(
            "Firestore is not configured. Set FIREBASE_PROJECT_ID and "
            "GOOGLE_APPLICATION_CREDENTIALS or use Application Default Credentials."
        )

    created, skipped = FirestoreProductService(client).seed_products(PRODUCTS)
    logger.info("Firestore seed complete: created=%s skipped_existing=%s", created, skipped)
    print(f"Firestore seed complete: created={created}, skipped_existing={skipped}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
