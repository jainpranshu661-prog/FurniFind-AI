from google.cloud.firestore import Client as FirestoreClient
import firebase_admin
from firebase_admin import credentials, firestore


def initialize_firestore(
    project_id: str = "",
    credentials_path: str = "",
    use_application_default_credentials: bool = False,
) -> FirestoreClient | None:
    if not credentials_path and not use_application_default_credentials:
        return None

    try:
        app = firebase_admin.get_app()
    except ValueError:
        credential = (
            credentials.Certificate(credentials_path)
            if credentials_path
            else credentials.ApplicationDefault()
        )
        options = {"projectId": project_id} if project_id else None
        app = firebase_admin.initialize_app(credential, options=options)

    if project_id and app.project_id and app.project_id != project_id:
        raise ValueError("The initialized Firebase app does not match FIREBASE_PROJECT_ID")

    return firestore.client(app=app)
