"""
Trial C — NB-B3: Frozen TrialCResNet backbone + 2-layer Pre-LN Transformer
for temporal behavioural scoring across 8-frame clips.

Ported from the behavioural project (trial_c/model_nbb.py); the only change is
the relative import of TrialCResNet.

References:
  Vaswani et al. (2017) Attention Is All You Need, NeurIPS.
  Xiong et al. (2020) On Layer Normalisation in Transformer, ICML.
"""

from pathlib import Path
from typing import Optional, Tuple, Union

import torch
import torch.nn as nn

from services.behavioral.model_nba import TrialCResNet

# Named constants
_BACKBONE_DIM: int = 512    # TrialCResNet feature vector size
_PROJ_DIM: int = 256        # Transformer d_model
_NUM_FRAMES: int = 8        # fixed temporal sequence length
_NHEAD: int = 4
_DIM_FEEDFORWARD: int = 512
_NUM_LAYERS: int = 2
_REG_OUTPUTS: int = 5       # confidence, anxiety, engagement, stability, composed
_TREND_CLASSES: int = 3     # 0=rising, 1=flat, 2=declining


class TrialCTemporalModel(nn.Module):
    """
    NB-B3: Temporal model on a frozen TrialCResNet backbone with a
    2-layer Pre-LN Transformer aggregating 8 frame-level features.

    Architecture::

        Input (B, 8, 3, 224, 224) ─ OR ─ pre-extracted (B, 8, 512)
          ↓  [frozen backbone when full video input]
        Frame features  (B, 8, 512)
          ↓  Linear(512 → 256)
          ↓  + nn.Embedding(8, 256) learnable positional encoding
          ↓  Pre-LN TransformerEncoder (2 layers, 4 heads, FFN=512)
          ↓  mean over sequence dimension
        Pooled          (B, 256)
          ├─ Linear(256→128)→ReLU→Dropout→Linear(128→5)→Sigmoid  →  (B, 5) regression
          └─ Linear(256→64)→ReLU→Linear(64→3)                    →  (B, 3) trend logits

    Args:
        backbone_path: Optional path to a saved TrialCResNet checkpoint.
        dropout:       Dropout probability in the regression head (default 0.2).
    """

    def __init__(
        self,
        backbone_path: Optional[Union[Path, str]] = None,
        dropout: float = 0.2,
    ) -> None:
        super().__init__()

        # pretrained=False: backbone weights always come from the NB-A3
        # checkpoint (here) or from the full NB-B state dict loaded by the
        # service — never from a redundant ImageNet download.
        self.backbone = TrialCResNet(pretrained=False)
        if backbone_path is not None:
            state = torch.load(Path(backbone_path), map_location="cpu")
            self.backbone.load_state_dict(state)

        for param in self.backbone.parameters():
            param.requires_grad = False

        # ── Temporal processing ──────────────────────────────────────────────
        self.project = nn.Linear(_BACKBONE_DIM, _PROJ_DIM)
        self.pos_encoding = nn.Embedding(_NUM_FRAMES, _PROJ_DIM)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=_PROJ_DIM,
            nhead=_NHEAD,
            dim_feedforward=_DIM_FEEDFORWARD,
            norm_first=True,        # Pre-LN — Xiong et al. (2020)
            batch_first=True,
            dropout=0.1,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=_NUM_LAYERS)

        # ── Heads ────────────────────────────────────────────────────────────
        self.regression_head = nn.Sequential(
            nn.Linear(_PROJ_DIM, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout),
            nn.Linear(128, _REG_OUTPUTS),
            nn.Sigmoid(),
        )
        # Trend head: raw logits — use CrossEntropyLoss during training
        self.trend_head = nn.Sequential(
            nn.Linear(_PROJ_DIM, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, _TREND_CLASSES),
        )

    def _encode_frames(self, x: torch.Tensor) -> torch.Tensor:
        """
        Extract per-frame features from a full video tensor using frozen backbone.

        Args:
            x: Video tensor of shape (B, T, C, H, W).

        Returns:
            Feature tensor of shape (B, T, 512).
        """
        B, T, C, H, W = x.shape
        frames = x.view(B * T, C, H, W)
        feats = self.backbone.extract_features(frames)   # (B*T, 512)
        return feats.view(B, T, _BACKBONE_DIM)

    def forward_from_features(self, feats: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Run the transformer and heads on pre-extracted frame features.

        Args:
            feats: Pre-extracted feature tensor of shape (B, T, 512).

        Returns:
            Tuple (reg_out, trend_out):
              - reg_out   shape (B, 5) with values in [0, 1]
              - trend_out shape (B, 3) logits
        """
        B, T, _ = feats.shape
        projected = self.project(feats)                              # (B, T, 256)
        positions = torch.arange(T, device=feats.device)
        projected = projected + self.pos_encoding(positions)
        encoded = self.transformer(projected)                        # (B, T, 256)
        pooled = encoded.mean(dim=1)                                 # (B, 256)
        return self.regression_head(pooled), self.trend_head(pooled)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Full forward pass accepting either full video or pre-extracted features.

        Shapes accepted:
          - (B, T, C, H, W) — full video; backbone runs internally (frozen)
          - (B, T, 512)     — pre-extracted frame features; backbone skipped

        Returns:
            Tuple (reg_out, trend_out):
              - reg_out   shape (B, 5) with values in [0, 1]
              - trend_out shape (B, 3) logits

        Raises:
            ValueError: If input dimensionality is not 3 (features) or 5 (video).
        """
        if x.ndim == 5:
            feats = self._encode_frames(x)
        elif x.ndim == 3:
            feats = x
        else:
            raise ValueError(
                f"Expected 3-D (B,T,512) or 5-D (B,T,C,H,W) input, got shape {x.shape}"
            )
        return self.forward_from_features(feats)
