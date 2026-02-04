"""
Local ML Models - placeholder for specialized models that we will need

yolo, tts and so on whatever models we may use 


Usage:
    from app.integrations.models import transcribe_audio, detect_faces
    
    # transcribe audio
    result = await transcribe_audio("path/to/audio.mp3")
    print(result["text"])
    
    # face detection
    faces = await detect_faces(frame_bytes)
"""

import asyncio
from pathlib import Path
from ultralytics import YOLO
import numpy as np
import cv2
    

## ===== stt (whisper model) ==========

async def transcribe_audio(audio_path):

    import whisper # move el importa foo2 please till we flow this in organized way and avoid circulation 

    model = whisper.load_model("base")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, 
        model.transcribe, 
        audio_path
    )
    
    return {
        "text": result["text"],
        "language": result["language"],
        "segments": result["segments"]
    }


# ========================================================= 
# sepertae el paerts with "==="

'''-------------- Write new topic  -----------------------'''

async def detect_faces(frame_bytes):
    """
    Detect faces in video frame for proctoring.
    
    Install: pip install ultralytics
    
    Args:
        frame_bytes: Image bytes (JPEG/PNG)
        
    Returns:
        dict with face_count, violation, confidence
    """

    model = YOLO("yolov8n.pt")  
    
    # Convert bytes to image
    nparr = np.frombuffer(frame_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Run detection
    results = model(img, classes=[0])  # class 0 = person
    
    # Count faces/people
    detections = results[0].boxes
    face_count = len(detections)

    confidence = float(detections[0].conf[0]) if face_count > 0 else 0.0

    violation = face_count != 1 
    
    return {
        "face_count": face_count,
        "violation": violation,
        "confidence": confidence
    }
