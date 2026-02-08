# AI Inference Service

Separate FastAPI microservice for AI/ML inference operations.

## Purpose
- Isolate AI models from main backend
- Support multiple model providers (Ollama Cloud, HuggingFace, custom)
- Easy to containerize and deploy independently
- Swap models without affecting main app

## Structure
```
ai-service/
├── main.py              # FastAPI app
├── config.py            # Settings and env vars
├── routers/
│   ├── llm.py           # LLM inference endpoints
│   └── custom.py        # Custom model endpoints
└── services/
    ├── ollama.py        # Ollama Cloud client
    └── huggingface.py   # HuggingFace models
```

## Running
```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --port 8001
```

## Environment Variables
```bash
OLLAMA_API_KEY=your-ollama-cloud-key
OLLAMA_MODEL=gpt-oss:120b
HUGGINGFACE_TOKEN=your-hf-token
```
