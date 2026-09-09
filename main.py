from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.routes.customer_routes import router as customer_router
from app.routes.frontend_compat import router as frontend_router

app = FastAPI(
    title="Creditpulse Backend",
    description="Customer credit risk analysis and decision engine",
    version="1.0.0",
)

app.include_router(customer_router)
app.include_router(frontend_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "Frontend"

app.mount(
    "/static",
    StaticFiles(directory=str(FRONTEND_DIR)),
    name="static"
)


@app.get("/")
def read_root():
    return FileResponse(str(FRONTEND_DIR / "login.html"))


@app.get("/app.html", include_in_schema=False)
def serve_dashboard():
    return FileResponse(str(FRONTEND_DIR / "app.html"))
