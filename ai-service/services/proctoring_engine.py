"""Proctoring signal adapters wired to local draft model weights with raw payload inference."""

from __future__ import annotations

import base64
import binascii
import importlib
import os
from pathlib import Path
from typing import Any

import numpy as np

from config import settings
from services.futurproctor.facial_detections import detect_faces as _fp_detect_faces
from services.futurproctor.audio_detection import detect_speech as _fp_detect_speech


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _severity_from_risk(risk: float) -> str:
    if risk >= 0.75:
        return "high"
    if risk >= 0.45:
        return "medium"
    return "low"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _drafts_root() -> Path:
    configured = os.getenv("PROCTORING_DRAFTS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    default_from_settings = getattr(settings, "PROCTORING_DRAFTS_DIR", "../gp-assessment-env-drafts")
    return (_repo_root() / default_from_settings).resolve()


def _ensure_model_downloaded(local_path: Path, s3_key: str) -> bool:
    """Download model from S3 if it doesn't exist locally."""
    if local_path.exists():
        return True
        
    s3_bucket = getattr(settings, "PROCTORING_MODELS_S3_BUCKET", "")
    if not s3_bucket:
        return False
        
    try:
        import boto3
        from botocore.exceptions import NoCredentialsError, ClientError
        
        local_path.parent.mkdir(parents=True, exist_ok=True)
        s3 = boto3.client("s3", region_name=getattr(settings, "PROCTORING_MODELS_S3_REGION", "us-east-1"))
        print(f"Downloading {s3_key} from s3://{s3_bucket} to {local_path}...")
        s3.download_file(s3_bucket, s3_key, str(local_path))
        return True
    except Exception as e:
        print(f"Failed to download model {s3_key}: {e}")
        return False


class _ModelRegistry:
    def __init__(self) -> None:
        root = _drafts_root()
        self.root = root
        self.emotion_model_file = root / "Emotion classification" / "model_keras.h5"
        self.emotion_weights_file = root / "Emotion classification" / "model_weights.h5"
        self.face_tflite_file = root / "Eye monitoring" / "facenet_512.tflite"
        self.gaze_weights_file = root / "Eye monitoring" / "Eye gaze" / "gaze_model_final.pth"
        self.speaker_profiles_dir = root / "Speaker Identification" / "speaker_profiles"
        self.yolo_model_file = root / "yolo11s.pt"

        self._speaker_profiles: dict[str, np.ndarray] | None = None
        self._emotion_loader_error: str | None = None
        self._voice_loader_error: str | None = None
        self._face_loader_error: str | None = None
        self._gaze_loader_error: str | None = None
        self._yolo_loader_error: str | None = None
        self._emotion_model: Any | None = None
        self._emotion_labels = [
            "anger",
            "contempt",
            "disgust",
            "fear",
            "happy",
            "sadness",
            "surprise",
        ]
        self._face_cascade: Any | None = None
        self._eye_cascade: Any | None = None
        self._face_tflite_interpreter: Any | None = None
        self._face_tflite_input_details: list[dict[str, Any]] | None = None
        self._face_tflite_output_details: list[dict[str, Any]] | None = None
        self._voice_feature_extractor: Any | None = None
        self._voice_model: Any | None = None
        self._gaze_model: Any | None = None
        self._mp_face_mesh: Any | None = None
        self._yolo_model: Any | None = None

    def wired_status(self) -> dict[str, Any]:
        return {
            "drafts_root": str(self.root),
            "emotion_model_present": self.emotion_model_file.exists(),
            "emotion_weights_present": self.emotion_weights_file.exists(),
            "face_weights_present": self.face_tflite_file.exists(),
            "gaze_weights_present": self.gaze_weights_file.exists(),
            "speaker_profiles_present": self.speaker_profiles_dir.exists(),
            "yolo_weights_present": self.yolo_model_file.exists(),
            "emotion_loader_error": self._emotion_loader_error,
            "voice_loader_error": self._voice_loader_error,
            "face_loader_error": self._face_loader_error,
            "gaze_loader_error": self._gaze_loader_error,
            "yolo_loader_error": self._yolo_loader_error,
        }

    def get_face_cascade(self) -> Any | None:
        cv2 = _get_cv2()
        if cv2 is None:
            return None
        if self._face_cascade is None:
            self._face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
        if self._face_cascade.empty():
            return None
        return self._face_cascade

    def get_eye_cascade(self) -> Any | None:
        cv2 = _get_cv2()
        if cv2 is None:
            return None
        if self._eye_cascade is None:
            self._eye_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_eye_tree_eyeglasses.xml"
            )
        if self._eye_cascade.empty():
            return None
        return self._eye_cascade

    def get_emotion_model(self) -> Any | None:
        if self._emotion_model is not None:
            return self._emotion_model

        _ensure_model_downloaded(self.emotion_model_file, "models/emotion/model_keras.h5")
        model_path = self.emotion_model_file if self.emotion_model_file.exists() else None
        if model_path is None:
            self._emotion_loader_error = "emotion_model_file_not_found"
            return None

        try:
            tf_models = importlib.import_module("tensorflow.keras.models")
            self._emotion_model = tf_models.load_model(str(model_path), compile=False)
            self._emotion_loader_error = None
            return self._emotion_model
        except Exception as exc:
            self._emotion_loader_error = str(exc)
            return None

    def get_voice_embedder(self) -> tuple[Any, Any] | None:
        if self._voice_feature_extractor is not None and self._voice_model is not None:
            return self._voice_feature_extractor, self._voice_model

        try:
            transformers = importlib.import_module("transformers")

            self._voice_feature_extractor = transformers.AutoFeatureExtractor.from_pretrained(
                "microsoft/wavlm-base-plus"
            )
            self._voice_model = transformers.WavLMModel.from_pretrained("microsoft/wavlm-base-plus")
            self._voice_model.eval()
            self._voice_loader_error = None
            return self._voice_feature_extractor, self._voice_model
        except Exception as exc:
            self._voice_loader_error = str(exc)
            return None

    def get_face_embedder(self) -> tuple[Any, list[dict[str, Any]], list[dict[str, Any]]] | None:
        if (
            self._face_tflite_interpreter is not None
            and self._face_tflite_input_details is not None
            and self._face_tflite_output_details is not None
        ):
            return (
                self._face_tflite_interpreter,
                self._face_tflite_input_details,
                self._face_tflite_output_details,
            )

        _ensure_model_downloaded(self.face_tflite_file, "models/face/facenet_512.tflite")
        if not self.face_tflite_file.exists():
            self._face_loader_error = "face_tflite_file_not_found"
            return None

        try:
            interpreter = None
            # Try lightweight runtimes before full TensorFlow
            for mod_path, attr_path in [
                ("tflite_runtime.interpreter", "Interpreter"),
                ("ai_edge_litert.interpreter", "Interpreter"),
            ]:
                try:
                    mod = importlib.import_module(mod_path)
                    Interpreter = getattr(mod, attr_path)
                    interpreter = Interpreter(model_path=str(self.face_tflite_file))
                    break
                except Exception:
                    continue
            if interpreter is None:
                tf = importlib.import_module("tensorflow")
                interpreter = tf.lite.Interpreter(model_path=str(self.face_tflite_file))
            interpreter.allocate_tensors()
            self._face_tflite_interpreter = interpreter
            self._face_tflite_input_details = interpreter.get_input_details()
            self._face_tflite_output_details = interpreter.get_output_details()
            self._face_loader_error = None
            return (
                interpreter,
                self._face_tflite_input_details,
                self._face_tflite_output_details,
            )
        except Exception as exc:
            self._face_loader_error = str(exc)
            return None

    def get_gaze_model(self) -> Any | None:
        if self._gaze_model is not None:
            return self._gaze_model

        _ensure_model_downloaded(self.gaze_weights_file, "models/gaze/gaze_model_final.pth")
        if not self.gaze_weights_file.exists():
            self._gaze_loader_error = "gaze_weights_file_not_found"
            return None

        try:
            torch = importlib.import_module("torch")
            nn = importlib.import_module("torch.nn")

            class GazeNet(nn.Module):
                def __init__(self) -> None:
                    super().__init__()
                    self.conv1 = nn.Conv2d(2, 32, kernel_size=3, padding=1)
                    self.pool1 = nn.MaxPool2d(kernel_size=2, stride=2)
                    self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
                    self.pool2 = nn.MaxPool2d(kernel_size=2, stride=2)
                    self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
                    self.pool3 = nn.MaxPool2d(kernel_size=2, stride=2)
                    self.fc_eye = nn.Linear(128 * 4 * 7, 256)
                    self.fc_combined = nn.Linear(256 + 3, 128)
                    self.fc_out = nn.Linear(128, 3)
                    self.dropout = nn.Dropout(0.2)
                    self.relu = nn.ReLU()

                def forward(self, eye_input: Any, head_pose: Any) -> Any:
                    x = self.relu(self.conv1(eye_input))
                    x = self.pool1(x)
                    x = self.relu(self.conv2(x))
                    x = self.pool2(x)
                    x = self.relu(self.conv3(x))
                    x = self.pool3(x)
                    x = x.view(x.size(0), -1)
                    x = self.relu(self.fc_eye(x))
                    x = self.dropout(x)
                    x = torch.cat([x, head_pose], dim=1)
                    x = self.relu(self.fc_combined(x))
                    x = self.dropout(x)
                    gaze = self.fc_out(x)
                    gaze = gaze / torch.norm(gaze, dim=1, keepdim=True)
                    return gaze

            model = GazeNet()
            checkpoint = torch.load(str(self.gaze_weights_file), map_location=torch.device("cpu"), weights_only=False)
            state = checkpoint.get("model_state_dict") if isinstance(checkpoint, dict) else checkpoint
            if state is None:
                raise ValueError("Invalid gaze checkpoint format")

            model.load_state_dict(state, strict=False)
            model.eval()
            self._gaze_model = model
            self._gaze_loader_error = None
            return self._gaze_model
        except Exception as exc:
            self._gaze_loader_error = str(exc)
            return None

    def get_speaker_profile(self, profile_id: str | None) -> np.ndarray | None:
        profile_key = (profile_id or "yousef_said_wavlm").strip().lower()
        if self._speaker_profiles is None:
            self._speaker_profiles = {}
            if self.speaker_profiles_dir.exists():
                for npy_path in self.speaker_profiles_dir.glob("*.npy"):
                    self._speaker_profiles[npy_path.stem.lower()] = np.load(npy_path)
        return self._speaker_profiles.get(profile_key)

    def get_yolo_model(self) -> Any | None:
        if self._yolo_model is not None:
            return self._yolo_model

        _ensure_model_downloaded(self.yolo_model_file, "models/yolo/yolo11s.pt")
        if not self.yolo_model_file.exists():
            self._yolo_loader_error = "yolo_weights_file_not_found"
            return None

        try:
            ultralytics = importlib.import_module("ultralytics")
            self._yolo_model = ultralytics.YOLO(str(self.yolo_model_file))
            self._yolo_loader_error = None
            return self._yolo_model
        except Exception as exc:
            self._yolo_loader_error = str(exc)
            return None

    def get_mp_face_mesh(self) -> Any | None:
        if self._mp_face_mesh is not None:
            return self._mp_face_mesh
        try:
            mp = importlib.import_module("mediapipe")
            mp_face_mesh = mp.solutions.face_mesh
            self._mp_face_mesh = mp_face_mesh.FaceMesh(refine_landmarks=True)
            return self._mp_face_mesh
        except Exception:
            return None


REGISTRY = _ModelRegistry()


def _dependency_available(module_name: str) -> bool:
    try:
        importlib.import_module(module_name)
        return True
    except Exception:
        return False


def _get_cv2() -> Any | None:
    try:
        return importlib.import_module("cv2")
    except Exception:
        return None


def _strip_data_url_prefix(blob: str) -> str:
    if "," in blob and blob.startswith("data:"):
        return blob.split(",", 1)[1]
    return blob


def _decode_image(frame_b64: str | None) -> np.ndarray | None:
    if not frame_b64:
        return None
    cv2 = _get_cv2()
    if cv2 is None:
        return None
    try:
        decoded = base64.b64decode(_strip_data_url_prefix(frame_b64), validate=False)
    except (binascii.Error, ValueError):
        return None
    arr = np.frombuffer(decoded, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return frame


def _to_float_waveform(
    audio_waveform: list[float] | None,
    audio_sample_rate: int | None,
) -> tuple[np.ndarray, int] | tuple[None, None]:
    if not audio_waveform:
        return None, None
    raw = np.asarray(audio_waveform, dtype=np.float32).flatten()
    if raw.size == 0:
        return None, None

    sr = int(audio_sample_rate or 16000)
    sr = max(8000, min(96000, sr))

    if sr != 16000:
        # Lightweight linear interpolation resampling to avoid heavy audio deps.
        duration = raw.shape[0] / sr
        target_len = max(1, int(duration * 16000))
        src_x = np.linspace(0.0, duration, num=raw.shape[0], endpoint=False)
        dst_x = np.linspace(0.0, duration, num=target_len, endpoint=False)
        raw = np.interp(dst_x, src_x, raw).astype(np.float32)
        sr = 16000

    raw = np.clip(raw, -1.0, 1.0)
    return raw, sr


def _emotion_from_frame(frame_bgr: np.ndarray | None) -> tuple[float | None, str | None, dict[str, float]]:
    cv2 = _get_cv2()
    if cv2 is None:
        return None, None, {}

    if frame_bgr is None:
        return None, None, {}

    model = REGISTRY.get_emotion_model()
    cascade = REGISTRY.get_face_cascade()
    if model is None or cascade is None:
        return None, None, {}

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.3, 5)
    if len(faces) == 0:
        return None, None, {}

    # Use the largest face as primary subject.
    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    roi_gray = gray[y : y + h, x : x + w]
    if roi_gray.size == 0:
        return None, None, {}

    roi = cv2.resize(roi_gray, (48, 48), interpolation=cv2.INTER_AREA)
    roi_rgb = cv2.cvtColor(roi, cv2.COLOR_GRAY2RGB).astype("float32") / 255.0
    roi_input = np.expand_dims(roi_rgb, axis=0)

    prediction = model.predict(roi_input, verbose=0)
    probs = np.asarray(prediction[0], dtype=np.float32)
    if probs.ndim != 1 or probs.size != len(REGISTRY._emotion_labels):
        return None, None, {}

    max_idx = int(np.argmax(probs))
    dominant = REGISTRY._emotion_labels[max_idx]
    distribution = {
        label: float(probs[idx]) for idx, label in enumerate(REGISTRY._emotion_labels)
    }
    stress = float(
        distribution.get("anger", 0.0)
        + distribution.get("fear", 0.0)
        + distribution.get("disgust", 0.0)
        + distribution.get("sadness", 0.0)
        + distribution.get("contempt", 0.0)
    )
    return _clamp(stress), dominant, distribution


def _face_embedding_from_frame(
    frame_bgr: np.ndarray | None,
    reference_embedding: np.ndarray | None = None,
) -> tuple[np.ndarray | None, float | None, np.ndarray | None]:
    cv2 = _get_cv2()
    if cv2 is None or frame_bgr is None:
        return None, None, reference_embedding

    face_embedder = REGISTRY.get_face_embedder()
    cascade = REGISTRY.get_face_cascade()
    if face_embedder is None or cascade is None:
        return None, None, reference_embedding

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.2, 5)
    if len(faces) == 0:
        return None, None, reference_embedding

    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    face = frame_bgr[y : y + h, x : x + w]
    if face.size == 0:
        return None, None, reference_embedding

    interpreter, input_details, output_details = face_embedder
    input_shape = input_details[0].get("shape", [1, 112, 112, 3])
    target_h = int(input_shape[1]) if len(input_shape) > 2 else 112
    target_w = int(input_shape[2]) if len(input_shape) > 2 else 112

    prepared = cv2.resize(face, (target_w, target_h)).astype(np.float32)
    prepared = (prepared - 127.5) / 128.0
    prepared = np.expand_dims(prepared, axis=0)

    interpreter.set_tensor(input_details[0]["index"], prepared)
    interpreter.invoke()
    embedding = interpreter.get_tensor(output_details[0]["index"])[0]
    embedding = np.asarray(embedding, dtype=np.float32)

    norm = float(np.linalg.norm(embedding))
    if norm <= 0:
        return None, None, reference_embedding

    embedding = embedding / norm

    if reference_embedding is None:
        new_reference = embedding
        similarity = 1.0
    else:
        similarity = _clamp((_cosine_similarity(embedding, reference_embedding) + 1) / 2)
        ref = (reference_embedding * 0.92) + (embedding * 0.08)
        ref_norm = float(np.linalg.norm(ref))
        if ref_norm > 0:
            new_reference = ref / ref_norm
        else:
            new_reference = reference_embedding

    return embedding, similarity, new_reference


def _gaze_offscreen_score_from_frame(frame_bgr: np.ndarray | None) -> float | None:
    cv2 = _get_cv2()
    if cv2 is None or frame_bgr is None:
        return None

    gaze_model = REGISTRY.get_gaze_model()
    if gaze_model is None:
        return None

    try:
        torch = importlib.import_module("torch")
    except Exception as exc:
        REGISTRY._gaze_loader_error = str(exc)
        return None

    cascade = REGISTRY.get_face_cascade()
    if cascade is None:
        return None

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.2, 5)
    if len(faces) == 0:
        return 1.0

    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    face_gray = gray[y : y + h, x : x + w]
    if face_gray.size == 0:
        return None

    mid = max(1, face_gray.shape[1] // 2)
    left_eye = face_gray[:, :mid]
    right_eye = face_gray[:, mid:]

    left_eye = cv2.resize(left_eye, (60, 36), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    right_eye = cv2.resize(right_eye, (60, 36), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0

    eye_stack = np.expand_dims(np.stack([left_eye, right_eye]), axis=0)
    eye_input = torch.from_numpy(eye_stack)
    pose_input = torch.zeros((1, 3), dtype=torch.float32)

    with torch.no_grad():
        gaze_vec = gaze_model(eye_input, pose_input).squeeze().cpu().numpy()

    gaze_vec = np.asarray(gaze_vec, dtype=np.float32).flatten()
    if gaze_vec.size < 2:
        return None

    off_axis = float(np.linalg.norm(gaze_vec[:2]))
    return _clamp(off_axis)


def _blink_from_frame(frame_bgr: np.ndarray | None) -> tuple[float | None, bool | None, int | None]:
    cv2 = _get_cv2()
    if cv2 is None or frame_bgr is None:
        return None, None, None

    face_cascade = REGISTRY.get_face_cascade()
    eye_cascade = REGISTRY.get_eye_cascade()
    if face_cascade is None or eye_cascade is None:
        return None, None, None

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.2, 5)
    if len(faces) == 0:
        return None, None, 0

    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    roi = gray[y : y + h, x : x + w]
    if roi.size == 0:
        return None, None, 0

    eyes = eye_cascade.detectMultiScale(roi, scaleFactor=1.1, minNeighbors=6, minSize=(18, 12))
    eye_count = int(len(eyes))
    if eye_count == 0:
        # No visible eyes can indicate a blink or strong occlusion.
        return 1.0, True, 0

    openness = []
    for _, _, ew, eh in eyes:
        if ew > 0:
            openness.append(float(eh) / float(ew))

    if not openness:
        return None, None, eye_count

    mean_openness = float(np.mean(openness))
    # Typical open eye ratio is roughly >= 0.22 on this detector; lower implies blink/closed eyes.
    blink_score = _clamp((0.23 - mean_openness) / 0.23)
    blink_detected = bool(blink_score >= 0.55)
    return blink_score, blink_detected, eye_count


def _voice_embedding_from_waveform(
    audio_waveform: list[float] | None,
    audio_sample_rate: int | None,
) -> np.ndarray | None:
    waveform, sample_rate = _to_float_waveform(audio_waveform, audio_sample_rate)
    if waveform is None:
        return None

    embedder = REGISTRY.get_voice_embedder()
    if embedder is None:
        return None

    try:
        torch = importlib.import_module("torch")
    except Exception as exc:
        REGISTRY._voice_loader_error = str(exc)
        return None

    feature_extractor, voice_model = embedder
    inputs = feature_extractor(waveform, sampling_rate=sample_rate, return_tensors="pt")
    with torch.no_grad():
        outputs = voice_model(**inputs)
    emb = outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy()
    if emb.ndim == 0:
        return None
    return emb.astype(np.float32)


def _objects_from_frame(frame_bgr: np.ndarray | None) -> tuple[int, list[str]]:
    cv2 = _get_cv2()
    if cv2 is None or frame_bgr is None:
        return 1, []
    
    model = REGISTRY.get_yolo_model()
    if model is None:
        return 1, []

    height, width = frame_bgr.shape[:2]
    resize_width = 640
    if width > resize_width:
        aspect_ratio = height / width
        frame_bgr = cv2.resize(frame_bgr, (resize_width, int(resize_width * aspect_ratio)))

    try:
        results = model.predict(frame_bgr, conf=0.25, imgsz=1280, verbose=False)
        person_count = 0
        detected_objects = []
        for result in results:
            for box in result.boxes.data.cpu().numpy():
                score = float(box[4])
                class_id = int(box[5])
                if score >= 0.25:
                    label = model.names[class_id].lower()
                    if label == "person":
                        person_count += 1
                        detected_objects.append("person")
                    elif label in {"cell phone", "cellphone", "mobile phone"}:
                        detected_objects.append("cell phone")
                    elif label == "book":
                        detected_objects.append("book")
        return person_count, detected_objects
    except Exception as exc:
        REGISTRY._yolo_loader_error = str(exc)
        return 1, []


def _gaze_direction_from_frame(frame_bgr: np.ndarray | None) -> str | None:
    cv2 = _get_cv2()
    if cv2 is None or frame_bgr is None:
        return None
    
    face_mesh = REGISTRY.get_mp_face_mesh()
    if face_mesh is None:
        return None
    
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(frame_rgb)
    
    if results.multi_face_landmarks:
        for landmarks in results.multi_face_landmarks:
            eye_left_outer = landmarks.landmark[33]
            eye_left_inner = landmarks.landmark[133]
            eye_right_inner = landmarks.landmark[362]
            eye_right_outer = landmarks.landmark[263]
            
            left_iris = np.mean([(landmarks.landmark[i].x, landmarks.landmark[i].y) for i in [468, 469, 470, 471]], axis=0)
            right_iris = np.mean([(landmarks.landmark[i].x, landmarks.landmark[i].y) for i in [472, 473, 474, 475]], axis=0)
            
            left_ratio = (left_iris[0] - eye_left_outer.x) / max(eye_left_inner.x - eye_left_outer.x, 1e-6)
            right_ratio = (right_iris[0] - eye_right_inner.x) / max(eye_right_outer.x - eye_right_inner.x, 1e-6)
            avg_x_ratio = (left_ratio + right_ratio) / 2.0
            
            eye_left_top = landmarks.landmark[159]
            eye_left_bottom = landmarks.landmark[145]
            eye_right_top = landmarks.landmark[386]
            eye_right_bottom = landmarks.landmark[374]
            
            left_y_ratio = (left_iris[1] - eye_left_top.y) / max(eye_left_bottom.y - eye_left_top.y, 1e-6)
            right_y_ratio = (right_iris[1] - eye_right_top.y) / max(eye_right_bottom.y - eye_right_top.y, 1e-6)
            avg_y_ratio = (left_y_ratio + right_y_ratio) / 2.0
            
            if avg_y_ratio > 0.75: return "down"
            if avg_y_ratio < 0.25: return "up"
            if avg_x_ratio < 0.35: return "right"
            if avg_x_ratio > 0.65: return "left"
            return "center"
    return "away"


def _frame_face_observations(
    frame_b64: str | None,
    reference_embedding: np.ndarray | None = None,
) -> tuple[dict[str, float | int | bool | None] | None, np.ndarray | None]:
    cv2 = _get_cv2()
    if cv2 is None:
        return None, reference_embedding
    frame = _decode_image(frame_b64)
    cascade = REGISTRY.get_face_cascade()
    if frame is None or cascade is None:
        return None, reference_embedding

    # Primary: MediaPipe FaceDetection (more accurate than Haar for webcam frames).
    # Falls back to Haar cascade if MediaPipe is unavailable.
    mp_result = _fp_detect_faces(frame)
    if mp_result["face_count"] > 0 or mp_result["has_face"] is not None:
        faces_detected = mp_result["face_count"]
    else:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        haar_faces = cascade.detectMultiScale(gray, 1.2, 5)
        faces_detected = int(len(haar_faces))

    liveness_score = 0.0
    face_model_score = None
    blink_score = None
    blink_detected = None
    eyes_detected = None
    if faces_detected > 0:
        x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
        roi = gray[y : y + h, x : x + w]
        if roi.size > 0:
            # Blur/laplacian-based sharpness proxy for liveness texture confidence.
            variance = float(cv2.Laplacian(roi, cv2.CV_64F).var())
            liveness_score = _clamp(variance / 220.0)

    _, face_model_score, new_ref = _face_embedding_from_frame(frame, reference_embedding)
    blink_score, blink_detected, eyes_detected = _blink_from_frame(frame)

    return {
        "faces_detected": faces_detected,
        "multiple_faces": faces_detected > 1,
        "liveness_score": liveness_score,
        "face_model_score": face_model_score,
        "blink_score": blink_score,
        "blink_detected": blink_detected,
        "eyes_detected": eyes_detected,
    }, new_ref


def inference_readiness() -> dict[str, Any]:
    wiring = REGISTRY.wired_status()

    cv2_available = _dependency_available("cv2")
    torch_available = _dependency_available("torch")
    transformers_available = _dependency_available("transformers")
    tensorflow_available = _dependency_available("tensorflow")

    eye_blink_ready = bool(cv2_available and REGISTRY.get_eye_cascade() is not None)
    face_ready = bool(
        cv2_available
        and tensorflow_available
        and wiring["face_weights_present"]
        and not wiring.get("face_loader_error")
    )
    gaze_ready = bool(
        cv2_available
        and torch_available
        and wiring["gaze_weights_present"]
        and not wiring.get("gaze_loader_error")
    )
    emotion_ready = bool(
        cv2_available
        and tensorflow_available
        and wiring["emotion_model_present"]
        and wiring["emotion_weights_present"]
        and not wiring.get("emotion_loader_error")
    )
    voice_ready = bool(
        torch_available
        and transformers_available
        and wiring["speaker_profiles_present"]
        and not wiring.get("voice_loader_error")
    )
    yolo_ready = bool(
        _dependency_available("ultralytics")
        and wiring.get("yolo_weights_present")
        and not wiring.get("yolo_loader_error")
    )
    mp_ready = _dependency_available("mediapipe")

    return {
        "ready": face_ready and gaze_ready and emotion_ready and voice_ready and eye_blink_ready,
        "dependencies": {
            "cv2": cv2_available,
            "tensorflow": tensorflow_available,
            "torch": torch_available,
            "transformers": transformers_available,
        },
        "models": {
            "face": {
                "ready": face_ready,
                "weights_present": wiring["face_weights_present"],
            },
            "eye_blink": {
                "ready": eye_blink_ready,
            },
            "gaze": {
                "ready": gaze_ready,
                "weights_present": wiring["gaze_weights_present"],
            },
            "emotion": {
                "ready": emotion_ready,
                "model_present": wiring["emotion_model_present"],
                "weights_present": wiring["emotion_weights_present"],
                "loader_error": wiring.get("emotion_loader_error"),
            },
            "voice": {
                "ready": voice_ready,
                "speaker_profiles_present": wiring["speaker_profiles_present"],
                "loader_error": wiring.get("voice_loader_error"),
            },
            "environment": {
                "ready": yolo_ready,
                "weights_present": wiring.get("yolo_weights_present", False),
                "loader_error": wiring.get("yolo_loader_error"),
            },
            "gaze_direction": {
                "ready": mp_ready,
            }
        },
        "wiring": wiring,
    }


def _cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    denom = float(np.linalg.norm(vec1) * np.linalg.norm(vec2))
    if denom == 0:
        return 0.0
    return float(np.dot(vec1, vec2) / denom)


def evaluate_face_signal(
    faces_detected: int,
    multiple_faces: bool,
    face_match_score: float | None,
    liveness_score: float | None,
    face_model_score: float | None = None,
    frame_b64: str | None = None,
    reference_embedding: list[float] | np.ndarray | None = None,
) -> dict:
    risk = 0.0
    event_type = "face_ok"
    used_weighted_input = False

    resolved_face_match = face_match_score
    resolved_faces_detected = faces_detected
    resolved_multiple_faces = multiple_faces
    resolved_liveness = liveness_score
    resolved_blink_score: float | None = None
    resolved_blink_detected: bool | None = None
    resolved_eyes_detected: int | None = None

    if reference_embedding is not None and not isinstance(reference_embedding, np.ndarray):
        reference_embedding = np.asarray(reference_embedding, dtype=np.float32)

    new_ref = reference_embedding
    inferred, new_ref = _frame_face_observations(frame_b64, reference_embedding)
    if inferred is not None:
        resolved_faces_detected = int(inferred["faces_detected"])
        resolved_multiple_faces = bool(inferred["multiple_faces"])
        resolved_liveness = float(inferred["liveness_score"])
        inferred_face_model = inferred.get("face_model_score")
        if inferred_face_model is not None:
            resolved_face_match = float(inferred_face_model)
        inferred_blink_score = inferred.get("blink_score")
        if inferred_blink_score is not None:
            resolved_blink_score = float(inferred_blink_score)
        inferred_blink_detected = inferred.get("blink_detected")
        if inferred_blink_detected is not None:
            resolved_blink_detected = bool(inferred_blink_detected)
        inferred_eyes_detected = inferred.get("eyes_detected")
        if inferred_eyes_detected is not None:
            resolved_eyes_detected = int(inferred_eyes_detected)
        used_weighted_input = True

    if face_model_score is not None:
        resolved_face_match = face_model_score
        used_weighted_input = True

    if resolved_multiple_faces:
        risk += 0.85
        event_type = "multi_face_detected"
    elif resolved_faces_detected <= 0:
        risk += 0.75
        event_type = "face_absent"

    if resolved_face_match is not None and resolved_face_match < 0.55:
        risk += 0.55
        event_type = "face_mismatch"

    if resolved_liveness is not None and resolved_liveness < 0.5:
        risk += 0.35
        if event_type == "face_ok":
            event_type = "low_liveness"

    if (
        resolved_liveness is not None
        and resolved_liveness < 0.5
        and resolved_blink_score is not None
        and resolved_blink_score < 0.2
        and (resolved_eyes_detected is None or resolved_eyes_detected >= 1)
    ):
        risk += 0.2
        if event_type in {"face_ok", "low_liveness"}:
            event_type = "eye_blink_irregular"

    risk = _clamp(risk)
    confidence = _clamp(0.58 + (risk * 0.38))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "faces_detected": resolved_faces_detected,
            "multiple_faces": resolved_multiple_faces,
            "liveness_score": resolved_liveness,
            "face_match_score": resolved_face_match,
            "blink_score": resolved_blink_score,
            "blink_detected": resolved_blink_detected,
            "eyes_detected": resolved_eyes_detected,
            "used_frame_inference": inferred is not None,
            "reference_embedding": new_ref.tolist() if new_ref is not None else None,
        },
    }


def evaluate_voice_signal(
    speaker_match_score: float | None,
    voice_switch_detected: bool,
    silence_ratio: float,
    background_speaker_count: int,
    voice_embedding: list[float] | None = None,
    speaker_profile_id: str | None = None,
    audio_waveform: list[float] | None = None,
    audio_sample_rate: int | None = None,
) -> dict:
    risk = 0.0
    event_type = "voice_ok"
    used_weighted_input = False

    resolved_speaker_match = speaker_match_score
    resolved_embedding: np.ndarray | None = None

    if audio_waveform:
        resolved_embedding = _voice_embedding_from_waveform(audio_waveform, audio_sample_rate)
        if resolved_embedding is not None:
            used_weighted_input = True

    if voice_embedding:
        resolved_embedding = np.asarray(voice_embedding, dtype=np.float32)
        used_weighted_input = True

    if resolved_embedding is not None:
        profile = REGISTRY.get_speaker_profile(speaker_profile_id)
        if profile is not None and resolved_embedding.shape == profile.shape:
            resolved_speaker_match = _clamp((_cosine_similarity(resolved_embedding, profile) + 1) / 2)

    if voice_switch_detected:
        risk += 0.85
        event_type = "voice_mismatch"

    if resolved_speaker_match is not None and resolved_speaker_match < 0.6:
        risk += 0.55
        event_type = "speaker_mismatch"

    if background_speaker_count > 0:
        risk += min(0.4, 0.15 * background_speaker_count)
        if event_type == "voice_ok":
            event_type = "background_speakers_detected"

    if silence_ratio > 0.7:
        risk += 0.2
        if event_type == "voice_ok":
            event_type = "excessive_silence"

    risk = _clamp(risk)
    confidence = _clamp(0.58 + (risk * 0.38))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "speaker_match_score": resolved_speaker_match,
            "used_raw_audio_inference": bool(audio_waveform) and resolved_embedding is not None,
            "used_voice_embedding": resolved_embedding is not None,
        },
    }


def evaluate_gaze_signal(
    off_screen_ratio: float,
    away_duration_seconds: float,
    rapid_shift_count: int,
    gaze_model_score: float | None = None,
    frame_b64: str | None = None,
    active_challenge: str | None = None,
    challenge_elapsed_seconds: float | None = None,
) -> dict:
    risk = 0.0
    event_type = "gaze_ok"
    used_weighted_input = False

    resolved_off_screen_ratio = off_screen_ratio
    inferred_gaze_offscreen_score = None
    inferred_gaze_direction = None
    if frame_b64:
        frame = _decode_image(frame_b64)
        if gaze_model_score is None:
            inferred_gaze_offscreen_score = _gaze_offscreen_score_from_frame(frame)
            if inferred_gaze_offscreen_score is not None:
                resolved_off_screen_ratio = _clamp((resolved_off_screen_ratio * 0.5) + (inferred_gaze_offscreen_score * 0.5))
                used_weighted_input = True
        
        inferred_gaze_direction = _gaze_direction_from_frame(frame)
        if inferred_gaze_direction is not None:
            used_weighted_input = True

    if active_challenge and challenge_elapsed_seconds is not None:
        if challenge_elapsed_seconds > 15 and inferred_gaze_direction != active_challenge:
            risk += 0.95
            event_type = "liveness_failed"
    elif inferred_gaze_direction and inferred_gaze_direction != "center":
        if inferred_gaze_direction == "down":
            risk += 0.6  # Lap phone trick
            event_type = "gaze_detected_down"
        else:
            risk += 0.4
            event_type = "gaze_detected_off_center"

    if resolved_off_screen_ratio >= 0.6:
        risk += 0.7
        if event_type == "gaze_ok":
            event_type = "gaze_off_screen"
    elif resolved_off_screen_ratio >= 0.35:
        risk += 0.4
        if event_type == "gaze_ok":
            event_type = "gaze_often_off_screen"

    if away_duration_seconds >= 10:
        risk += 0.35

    if rapid_shift_count >= 8:
        risk += 0.2

    if gaze_model_score is not None:
        used_weighted_input = True
        risk = _clamp((risk * 0.7) + (_clamp(gaze_model_score) * 0.3))

    risk = _clamp(risk)
    confidence = _clamp(0.52 + (risk * 0.43))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "off_screen_ratio": resolved_off_screen_ratio,
            "away_duration_seconds": away_duration_seconds,
            "rapid_shift_count": rapid_shift_count,
            "used_frame_inference": frame_b64 is not None,
            "inferred_gaze_offscreen_score": inferred_gaze_offscreen_score,
            "inferred_gaze_direction": inferred_gaze_direction,
        },
    }


def evaluate_environment_signal(frame_b64: str | None = None, screen_frame_b64: str | None = None) -> dict:
    risk = 0.0
    event_type = "environment_ok"
    used_weighted_input = False
    
    person_count = 1
    detected_objects = []
    
    if frame_b64:
        frame = _decode_image(frame_b64)
        if frame is not None:
            person_count, detected_objects = _objects_from_frame(frame)
            used_weighted_input = True
            
    if screen_frame_b64:
        screen_frame = _decode_image(screen_frame_b64)
        if screen_frame is not None:
            _, screen_objects = _objects_from_frame(screen_frame)
            detected_objects.extend(screen_objects)
            used_weighted_input = True
            
    if "cell phone" in detected_objects or "book" in detected_objects:
        risk += 0.95
        if "cell phone" in detected_objects:
            event_type = "cell_phone_detected"
        else:
            event_type = "book_detected"
    elif person_count > 1:
        risk += 0.85
        event_type = "multiple_persons"
    elif person_count == 0:
        risk += 0.75
        event_type = "missing_person"
        
    risk = _clamp(risk)
    confidence = _clamp(0.6 + (risk * 0.3))
    
    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "person_count": person_count,
            "detected_objects": detected_objects,
            "used_frame_inference": frame_b64 is not None,
        },
    }


def evaluate_emotion_signal(
    stress_score: float,
    negative_ratio: float,
    dominant_emotion: str | None,
    emotion_model_score: float | None = None,
    frame_b64: str | None = None,
) -> dict:
    risk = 0.0
    event_type = "emotion_ok"
    used_weighted_input = False

    resolved_stress = stress_score
    resolved_negative_ratio = negative_ratio
    resolved_dominant_emotion = dominant_emotion

    model_stress_score, model_dominant, model_distribution = _emotion_from_frame(_decode_image(frame_b64))
    if model_stress_score is not None:
        resolved_stress = model_stress_score
        resolved_dominant_emotion = model_dominant
        resolved_negative_ratio = _clamp(
            model_distribution.get("fear", 0.0)
            + model_distribution.get("disgust", 0.0)
            + model_distribution.get("sadness", 0.0)
            + model_distribution.get("anger", 0.0)
            + model_distribution.get("contempt", 0.0)
        )
        used_weighted_input = True

    if emotion_model_score is not None:
        resolved_stress = _clamp((resolved_stress * 0.6) + (_clamp(emotion_model_score) * 0.4))
        used_weighted_input = True

    if resolved_stress >= 0.8:
        risk += 0.55
        event_type = "emotion_stress_spike"
    elif resolved_stress >= 0.6:
        risk += 0.3
        event_type = "emotion_stress_rising"

    if resolved_negative_ratio >= 0.75:
        risk += 0.35
        if event_type == "emotion_ok":
            event_type = "emotion_negative_pattern"

    if resolved_dominant_emotion and resolved_dominant_emotion.lower() in {"fear", "disgust", "anger", "sadness", "contempt"}:
        risk += 0.15

    risk = _clamp(risk)
    confidence = _clamp(0.48 + (risk * 0.4))

    return {
        "event_type": event_type,
        "risk_score": risk,
        "confidence": confidence,
        "severity": _severity_from_risk(risk),
        "adapter_mode": "weighted_local_v1" if used_weighted_input else "weighted_rules_fallback",
        "model_wiring": REGISTRY.wired_status(),
        "resolved_inputs": {
            "stress_score": resolved_stress,
            "negative_ratio": resolved_negative_ratio,
            "dominant_emotion": resolved_dominant_emotion,
            "distribution": model_distribution,
            "used_frame_inference": model_stress_score is not None,
        },
    }


# =============================================================================
# PORTED FROM LEGACY: FuturProctor Cheating Prevention System
# Source: Cheating PRevention/futurproctor/proctoring/
# All Django dependencies removed. Pure Python logic only.
# =============================================================================

import logging as _logging
import time as _time
import random as _random
import io as _io
import wave as _wave

_logger = _logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Face Encoding Extraction (multi-strategy with Haar cascade fallback)
# Ported from: views.py:183-261
# ---------------------------------------------------------------------------

def extract_face_encoding(image: np.ndarray) -> list[float] | None:
    """
    Extract a 512-d face embedding from a BGR image.

    Strategy 1: FaceNet 512 TFLite — same pipeline used by live proctoring analysis,
                so reference and live embeddings are always dimensionally compatible.
    Strategy 2: face_recognition library (128-d) — fallback when TFLite unavailable.
    """
    if image is None or not isinstance(image, np.ndarray) or image.ndim < 2:
        return None

    cv2 = _get_cv2()

    # Strategy 1: FaceNet 512 TFLite (matches _face_embedding_from_frame)
    face_embedder = REGISTRY.get_face_embedder()
    if cv2 is not None and face_embedder is not None:
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
            cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(40, 40))
            if len(faces) > 0:
                x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
                face_crop = image[y : y + h, x : x + w]
                if face_crop.size > 0:
                    interpreter, input_details, output_details = face_embedder
                    input_shape = input_details[0].get("shape", [1, 160, 160, 3])
                    target_h = int(input_shape[1]) if len(input_shape) > 2 else 160
                    target_w = int(input_shape[2]) if len(input_shape) > 2 else 160
                    prepared = cv2.resize(face_crop, (target_w, target_h)).astype(np.float32)
                    prepared = (prepared - 127.5) / 128.0
                    prepared = np.expand_dims(prepared, axis=0)
                    interpreter.set_tensor(input_details[0]["index"], prepared)
                    interpreter.invoke()
                    embedding = interpreter.get_tensor(output_details[0]["index"])[0]
                    embedding = np.asarray(embedding, dtype=np.float32)
                    norm = float(np.linalg.norm(embedding))
                    if norm > 0:
                        return (embedding / norm).tolist()
        except Exception:
            pass

    # Strategy 2: face_recognition library (128-d fallback)
    try:
        rgb_image = image[:, :, ::-1] if image.ndim == 3 and image.shape[2] == 3 else image
        face_recognition = importlib.import_module("face_recognition")
        for attempt in [
            {"number_of_times_to_upsample": 1, "model": "hog"},
            {"number_of_times_to_upsample": 2, "model": "hog"},
        ]:
            face_locations = face_recognition.face_locations(rgb_image, **attempt)
            encodings = face_recognition.face_encodings(rgb_image, face_locations)
            if encodings:
                enc = encodings[0]
                return enc.tolist() if hasattr(enc, "tolist") else list(enc)
    except Exception:
        pass

    return None


def extract_face_encoding_b64(frame_b64: str | None) -> list[float] | None:
    """Convenience: extract face encoding from a base64-encoded image."""
    frame = _decode_image(frame_b64)
    if frame is None:
        return None
    return extract_face_encoding(frame)


# ---------------------------------------------------------------------------
# Face Encoding Matching
# Ported from: views.py:264-284
# ---------------------------------------------------------------------------

def match_face_encodings(
    captured_encoding: list[float] | np.ndarray,
    stored_encoding: list[float] | np.ndarray,
    threshold: float = 0.9,
) -> tuple[bool, float]:
    """
    Compare two face encodings and return (is_match, distance).

    Both encodings are expected to be L2-normalised (unit vectors) from FaceNet 512,
    so we use L2 distance directly. threshold=0.9 is appropriate for 512-d unit vectors
    (equivalent to cosine similarity > 0.595).

    Falls back to face_recognition.compare_faces only when both are 128-d (legacy).
    """
    try:
        a = np.array(captured_encoding, dtype=np.float32)
        b = np.array(stored_encoding, dtype=np.float32)
        if a.size != b.size:
            return False, float("inf")
        # For 128-d vectors from face_recognition, delegate to its built-in comparator.
        if a.size == 128:
            try:
                face_recognition = importlib.import_module("face_recognition")
                match = face_recognition.compare_faces([b], a, tolerance=threshold)[0]
                dist = float(np.linalg.norm(a - b))
                return bool(match), dist
            except Exception:
                pass
        dist = float(np.linalg.norm(a - b))
        return dist < threshold, dist
    except Exception:
        return False, float("inf")


# ---------------------------------------------------------------------------
# Audio Amplitude Detection (framework-agnostic)
# Ported from: ml_models/audio_detection.py
# ---------------------------------------------------------------------------

# Audio detection constants
AUDIO_THRESHOLD = 500
AUDIO_CHUNK_SIZE = 2048
AUDIO_SAMPLE_RATE = 48000
AUDIO_SILENCE_DELAY = 4  # seconds after last sound to consider "stopped"


def detect_audio_amplitude(
    audio_chunk: bytes | np.ndarray,
    threshold: int = AUDIO_THRESHOLD,
) -> dict:
    """
    Analyze a chunk of raw PCM audio (int16) for speech/noise detection.

    Args:
        audio_chunk: Raw PCM bytes or numpy int16 array.
        threshold: Amplitude threshold above which speech is considered detected.

    Returns:
        dict with keys: audio_detected (bool), max_amplitude (int), exceeds_threshold (bool)
    """
    if isinstance(audio_chunk, bytes):
        audio_data = np.frombuffer(audio_chunk, dtype=np.int16)
    elif isinstance(audio_chunk, np.ndarray):
        audio_data = audio_chunk.astype(np.int16)
    else:
        return {"audio_detected": False, "max_amplitude": 0, "exceeds_threshold": False}

    if audio_data.size == 0:
        return {"audio_detected": False, "max_amplitude": 0, "exceeds_threshold": False}

    # Use futurproctor amplitude analysis for richer signal (adds rms, speech_detected).
    fp_result = _fp_detect_speech(audio_data, threshold=threshold)
    max_amp = int(fp_result["peak_amplitude"])
    exceeds = fp_result["speech_detected"]

    return {
        "audio_detected": exceeds,
        "max_amplitude": max_amp,
        "exceeds_threshold": exceeds,
        "rms": fp_result["rms"],
        "speech_detected": exceeds,
    }


def create_wav_bytes(
    raw_audio: bytes,
    channels: int = 1,
    sample_width: int = 2,
    framerate: int = AUDIO_SAMPLE_RATE,
) -> bytes:
    """
    Wrap raw PCM audio bytes with a WAV header.

    Returns complete WAV file as bytes.
    """
    wav_buffer = _io.BytesIO()
    with _wave.open(wav_buffer, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(framerate)
        wf.writeframes(raw_audio)
    return wav_buffer.getvalue()


# ---------------------------------------------------------------------------
# Liveness Challenge State Machine
# Ported from: views.py:584-608
# ---------------------------------------------------------------------------

class LivenessChallenge:
    """
    Issues random gaze-direction challenges and validates completion.

    Usage:
        challenge = LivenessChallenge(interval_seconds=45, timeout_seconds=15)

        # On every frame tick:
        result = challenge.tick(current_gaze_direction)
        if result["status"] == "challenge_active":
            # Tell the candidate to look in result["direction"]
        elif result["status"] == "challenge_failed":
            # Flag as liveness failure
        elif result["status"] == "challenge_passed":
            # Candidate complied
    """

    DIRECTIONS = ["right", "left", "up", "down"]

    def __init__(self, interval_seconds: float = 45.0, timeout_seconds: float = 15.0) -> None:
        self.interval_seconds = interval_seconds
        self.timeout_seconds = timeout_seconds
        self._active_direction: str | None = None
        self._challenge_start_time: float = 0.0
        self._last_issue_time: float = _time.time()
        self._challenges_issued: int = 0
        self._challenges_passed: int = 0
        self._challenges_failed: int = 0

    @property
    def active_challenge(self) -> str | None:
        return self._active_direction

    @property
    def stats(self) -> dict:
        return {
            "issued": self._challenges_issued,
            "passed": self._challenges_passed,
            "failed": self._challenges_failed,
        }

    def tick(self, current_gaze_direction: str | None) -> dict:
        """
        Call on every frame analysis tick with the detected gaze direction.

        Returns:
            dict with "status" (idle|challenge_active|challenge_passed|challenge_failed),
            "direction" (the required direction, if active), and timing info.
        """
        now = _time.time()

        # Issue a new challenge if interval elapsed and none active
        if self._active_direction is None and (now - self._last_issue_time) > self.interval_seconds:
            self._active_direction = _random.choice(self.DIRECTIONS)
            self._challenge_start_time = now
            self._last_issue_time = now
            self._challenges_issued += 1
            return {
                "status": "challenge_active",
                "direction": self._active_direction,
                "elapsed_seconds": 0.0,
                "timeout_seconds": self.timeout_seconds,
            }

        # Check active challenge
        if self._active_direction is not None:
            elapsed = now - self._challenge_start_time

            # Check if candidate looked in the required direction
            if current_gaze_direction and current_gaze_direction == self._active_direction:
                self._challenges_passed += 1
                direction = self._active_direction
                self._active_direction = None
                return {
                    "status": "challenge_passed",
                    "direction": direction,
                    "elapsed_seconds": elapsed,
                    "timeout_seconds": self.timeout_seconds,
                }

            # Check if timed out
            if elapsed > self.timeout_seconds:
                self._challenges_failed += 1
                direction = self._active_direction
                self._active_direction = None
                return {
                    "status": "challenge_failed",
                    "direction": direction,
                    "elapsed_seconds": elapsed,
                    "timeout_seconds": self.timeout_seconds,
                }

            return {
                "status": "challenge_active",
                "direction": self._active_direction,
                "elapsed_seconds": elapsed,
                "timeout_seconds": self.timeout_seconds,
            }

        return {"status": "idle", "direction": None, "elapsed_seconds": 0.0, "timeout_seconds": self.timeout_seconds}

    def reset(self) -> None:
        """Reset the challenge state (e.g., when a new exam starts)."""
        self._active_direction = None
        self._challenge_start_time = 0.0
        self._last_issue_time = _time.time()


# ---------------------------------------------------------------------------
# Unified Frame Processor
# Ported from: views.py:520-617
# Orchestrates all detection in a single frame pass.
# ---------------------------------------------------------------------------

def process_frame(
    frame_bgr: np.ndarray,
    stored_face_encoding: list[float] | np.ndarray | None = None,
    liveness_challenge: LivenessChallenge | None = None,
    face_check_interval: float = 10.0,
    last_face_check_time: float = 0.0,
) -> dict:
    """
    Unified frame analysis: chains object detection → face identity → gaze → liveness.

    This is the main per-frame processing function extracted from the legacy system.
    All Django/ORM references removed. Returns a pure data dict.

    Args:
        frame_bgr: BGR image numpy array from webcam/video.
        stored_face_encoding: The known face encoding for identity verification.
        liveness_challenge: Optional LivenessChallenge instance for challenge tracking.
        face_check_interval: Seconds between identity re-checks.
        last_face_check_time: Timestamp of last identity check.

    Returns:
        dict with keys:
            violations: list[dict] — each violation has {type, description, severity}
            gaze_direction: str — "center", "left", "right", "up", "down", "away"
            person_count: int
            detected_objects: list[str]
            identity_match: bool | None
            identity_distance: float | None
            liveness_result: dict | None
            last_face_check_time: float — updated timestamp
    """
    violations: list[dict] = []
    identity_match: bool | None = None
    identity_distance: float | None = None
    updated_face_check_time = last_face_check_time

    # --- Step 1: Object Detection ---
    person_count, detected_objects = _objects_from_frame(frame_bgr)

    # Check for prohibited objects
    for obj in detected_objects:
        if obj in ("cell phone", "book"):
            violations.append({
                "type": "object_detected",
                "description": f"Prohibited object detected: {obj}",
                "severity": "high",
                "object": obj,
            })

    # Check person count
    if person_count > 1:
        violations.append({
            "type": "multiple_persons",
            "description": f"Multiple persons detected: {person_count}",
            "severity": "high",
        })
    elif person_count == 0:
        violations.append({
            "type": "missing_person",
            "description": "No person detected at the desk",
            "severity": "high",
        })

    # --- Step 2: Identity Verification (throttled) ---
    now = _time.time()
    if person_count == 1 and stored_face_encoding is not None:
        if (now - last_face_check_time) > face_check_interval:
            updated_face_check_time = now
            captured_encoding = extract_face_encoding(frame_bgr)
            if captured_encoding is not None:
                identity_match, identity_distance = match_face_encodings(
                    captured_encoding, stored_face_encoding
                )
                if not identity_match:
                    violations.append({
                        "type": "identity_mismatch",
                        "description": "Unrecognized person detected (face mismatch)",
                        "severity": "high",
                        "distance": identity_distance,
                    })

    # --- Step 3: Gaze Tracking ---
    gaze_direction = _gaze_direction_from_frame(frame_bgr) or "unknown"

    # --- Step 4: Liveness Challenge ---
    liveness_result: dict | None = None
    if liveness_challenge is not None:
        liveness_result = liveness_challenge.tick(gaze_direction)

        if liveness_result["status"] == "challenge_failed":
            violations.append({
                "type": "liveness_failed",
                "description": f"Liveness challenge failed: did not look {liveness_result['direction']}",
                "severity": "high",
            })
    else:
        # Without challenge system, flag non-center gaze as low-priority
        if gaze_direction not in ("center", "unknown"):
            violations.append({
                "type": "gaze_detected",
                "description": f"Candidate not looking at the screen: {gaze_direction}",
                "severity": "medium" if gaze_direction == "down" else "low",
            })

    return {
        "violations": violations,
        "gaze_direction": gaze_direction,
        "person_count": person_count,
        "detected_objects": detected_objects,
        "identity_match": identity_match,
        "identity_distance": identity_distance,
        "liveness_result": liveness_result,
        "last_face_check_time": updated_face_check_time,
    }


def process_frame_b64(
    frame_b64: str,
    stored_face_encoding: list[float] | np.ndarray | None = None,
    liveness_challenge: LivenessChallenge | None = None,
    face_check_interval: float = 10.0,
    last_face_check_time: float = 0.0,
) -> dict:
    """Convenience: process a base64-encoded frame."""
    frame = _decode_image(frame_b64)
    if frame is None:
        return {
            "violations": [{"type": "invalid_frame", "description": "Could not decode frame", "severity": "low"}],
            "gaze_direction": "unknown",
            "person_count": 0,
            "detected_objects": [],
            "identity_match": None,
            "identity_distance": None,
            "liveness_result": None,
            "last_face_check_time": last_face_check_time,
        }
    return process_frame(
        frame,
        stored_face_encoding=stored_face_encoding,
        liveness_challenge=liveness_challenge,
        face_check_interval=face_check_interval,
        last_face_check_time=last_face_check_time,
    )


# ---------------------------------------------------------------------------
# Trust Score Calculator
# Ported from: views.py:984-985
# ---------------------------------------------------------------------------

def compute_trust_score(
    cheating_event_count: int,
    penalty_per_event: int = 10,
    max_score: int = 100,
) -> int:
    """
    Compute a candidate trust score based on cheating event count.

    Formula: max(0, max_score - (cheating_event_count * penalty_per_event))
    """
    return max(0, max_score - (cheating_event_count * penalty_per_event))


# ---------------------------------------------------------------------------
# Browser Event Validators (server-side validation of client-reported events)
# Ported from: exam.html:177-250
# ---------------------------------------------------------------------------

def validate_tab_switch_event(
    current_count: int,
    max_allowed: int = 5,
) -> dict:
    """
    Validate a tab-switch event reported by the browser.

    Returns:
        dict with keys:
            new_count: int — incremented count
            is_violation: bool — True if count >= 1
            is_terminated: bool — True if max exceeded
            message: str
    """
    new_count = current_count + 1
    is_terminated = new_count > max_allowed

    if is_terminated:
        return {
            "new_count": new_count,
            "is_violation": True,
            "is_terminated": True,
            "message": f"Exam terminated: {new_count} tab switches exceeded the limit of {max_allowed}.",
        }

    return {
        "new_count": new_count,
        "is_violation": new_count >= 1,
        "is_terminated": False,
        "message": f"Tab switch detected. Total switches: {new_count}/{max_allowed}.",
    }


# Browser event types that should be flagged
BROWSER_PREVENTION_EVENTS = frozenset({
    "tab_switch",          # Document visibility changed to hidden
    "window_blur",         # Window lost focus (second monitor, alt-tab)
    "fullscreen_exit",     # Exited fullscreen mode
    "right_click",         # Context menu invoked
    "copy_attempt",        # Ctrl+C / Cmd+C
    "paste_attempt",       # Ctrl+V / Cmd+V
    "devtools_open",       # Developer tools detected
    "screen_capture",      # Screen capture API detected
})


def validate_browser_event(
    event_type: str,
    session_events: list[dict] | None = None,
) -> dict:
    """
    Validate a browser prevention event reported by the client.

    Args:
        event_type: One of BROWSER_PREVENTION_EVENTS
        session_events: Previous events in the session (for pattern analysis)

    Returns:
        dict with: is_violation, severity, event_type, description
    """
    is_known = event_type in BROWSER_PREVENTION_EVENTS

    # Severity mapping
    severity_map = {
        "tab_switch": "high",
        "window_blur": "high",
        "fullscreen_exit": "high",
        "right_click": "low",
        "copy_attempt": "medium",
        "paste_attempt": "medium",
        "devtools_open": "high",
        "screen_capture": "high",
    }

    description_map = {
        "tab_switch": "Candidate switched away from the exam tab",
        "window_blur": "Exam window lost focus (possible second monitor or alt-tab)",
        "fullscreen_exit": "Candidate exited fullscreen mode",
        "right_click": "Right-click context menu invoked",
        "copy_attempt": "Copy action detected during exam",
        "paste_attempt": "Paste action detected during exam",
        "devtools_open": "Browser developer tools opened",
        "screen_capture": "Screen capture API usage detected",
    }

    return {
        "is_violation": is_known,
        "severity": severity_map.get(event_type, "low"),
        "event_type": event_type,
        "description": description_map.get(event_type, f"Unknown browser event: {event_type}"),
    }
