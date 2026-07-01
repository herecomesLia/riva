from fastapi import FastAPI

from riva.api import router


def create_app() -> FastAPI:
    app = FastAPI(title="RIVA Server")
    app.include_router(router, prefix="/api")
    return app
