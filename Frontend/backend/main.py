from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from routers import admin, recruiter, candidate

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "EraMatch API is running"}

# --- Auth Endpoints ---

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/auth/login")
def login(request: LoginRequest):
    # In a real app, check against database. Here we use hardcoded check for demo as requested,
    # but now it's server-side.
    if request.email == "admin@eramatch.com" and request.password == "admin123":
        return {
            "token": "mock-jwt-token-admin",
            "user": {
                "name": "Admin User",
                "role": "Admin",
                "email": request.email
            }
        }
    raise HTTPException(status_code=401, detail="Invalid credentials")

# Include Routers
app.include_router(admin.router)
app.include_router(recruiter.router)
app.include_router(candidate.router)
