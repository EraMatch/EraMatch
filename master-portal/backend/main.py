from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_sqlite
from routers.auth import router as auth_router
from routers.organizations import router as orgs_router
from routers.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_sqlite()
    yield


app = FastAPI(
    title="EraMatch Master Portal",
    version="1.0.0",
    description="System administration portal for managing EraMatch organizations",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(users_router, prefix="/users", tags=["Users"])
app.include_router(orgs_router, prefix="/organizations", tags=["Organizations"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "master-portal"}
