"""
Trial C — NB-A3: ImageNet-pretrained ResNet-18 with head surgery for
single-frame behavioural scoring.

Ported verbatim from the behavioural project (trial_c/model_nba.py).

  - ResNet-18 ImageNet backbone, two-phase fine-tune
  - regression head + auxiliary 7-class emotion head with class-weighted CE
    and inference-time prior correction
  - trained and served on the same Haar face-crop preprocessing
  - 512-d features feed a Pre-LN transformer temporal model (NB-B3)

ImageNet normalisation is applied INSIDE the model (registered buffers) so the
service pipeline can keep feeding [0, 1] tensors to the model unchanged.

At inference we instantiate with pretrained=False and load the trained weights
from the .pth checkpoint, so no ImageNet download happens.

References:
  He et al. (2016) Deep Residual Learning for Image Recognition, CVPR.
"""

from typing import Tuple

import torch
import torch.nn as nn
from torchvision.models import ResNet18_Weights, resnet18

# Named constants
_FEATURE_DIM: int = 512   # ResNet-18 penultimate (avgpool) width
_HEAD_HIDDEN: int = 128
_NUM_OUTPUTS: int = 6     # confidence, anxiety, engagement, stability, composed, interview
_NUM_EMOTIONS: int = 7    # RAF-DB classes: surprise, fear, disgust, happy, sad, angry, neutral

# ImageNet statistics — inputs to this model are [0, 1] RGB tensors
_IMAGENET_MEAN = (0.485, 0.456, 0.406)
_IMAGENET_STD = (0.229, 0.224, 0.225)


class TrialCResNet(nn.Module):
    """
    NB-A3: ImageNet-pretrained ResNet-18 mapping a single RGB frame to
    6 behavioural scores plus auxiliary 7-class emotion logits.

    Architecture::

        Input (B, 3, 224, 224) in [0, 1]
          ↓  internal ImageNet normalisation (buffers)
        ResNet-18 conv stem + layers 1-4 + global avgpool → (B, 512)
          ├─ Linear(512→128)→ReLU→Dropout→Linear(128→6)→Sigmoid  (B, 6) scores
          └─ Linear(512→128)→ReLU→Dropout→Linear(128→7)          (B, 7) emotion logits

    Args:
        dropout:    Dropout probability in both heads (default 0.3).
        pretrained: Load ImageNet weights (default True). Set False for
                    inference where weights are loaded from a checkpoint.
    """

    def __init__(self, dropout: float = 0.3, pretrained: bool = True) -> None:
        super().__init__()
        weights = ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        backbone = resnet18(weights=weights)
        backbone.fc = nn.Identity()   # expose the 512-d pooled features
        self.backbone = backbone

        self.register_buffer(
            "_norm_mean", torch.tensor(_IMAGENET_MEAN).view(1, 3, 1, 1)
        )
        self.register_buffer(
            "_norm_std", torch.tensor(_IMAGENET_STD).view(1, 3, 1, 1)
        )

        self.head = nn.Sequential(
            nn.Linear(_FEATURE_DIM, _HEAD_HIDDEN),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout),
            nn.Linear(_HEAD_HIDDEN, _NUM_OUTPUTS),
            nn.Sigmoid(),
        )
        # Auxiliary 7-class emotion head (raw logits — use CrossEntropyLoss)
        self.emotion_head = nn.Sequential(
            nn.Linear(_FEATURE_DIM, _HEAD_HIDDEN),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout),
            nn.Linear(_HEAD_HIDDEN, _NUM_EMOTIONS),
        )

    def set_backbone_trainable(self, stages: Tuple[str, ...] = ("layer4",)) -> None:
        """
        Freeze the whole backbone, then unfreeze the named children.

        Args:
            stages: Names of backbone children to unfreeze (e.g. ("layer4",)).
        """
        for param in self.backbone.parameters():
            param.requires_grad = False
        for name in stages:
            for param in getattr(self.backbone, name).parameters():
                param.requires_grad = True

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        """
        Return the 512-d pooled backbone features for [0, 1] inputs.

        Args:
            x: RGB image tensor of shape (B, 3, 224, 224) with values in [0, 1].

        Returns:
            Feature tensor of shape (B, 512).
        """
        x = (x - self._norm_mean) / self._norm_std
        return self.backbone(x)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Full forward pass: image → 6 behavioural floats.

        Args:
            x: RGB image tensor of shape (B, 3, 224, 224) with values in [0, 1].

        Returns:
            Regression output of shape (B, 6) with all values in [0, 1].
        """
        return self.head(self.extract_features(x))

    def forward_with_emotion(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass returning both behavioural scores and emotion logits.

        Args:
            x: RGB image tensor of shape (B, 3, 224, 224) with values in [0, 1].

        Returns:
            Tuple (scores, emotion_logits):
              - scores         shape (B, 6), values in [0, 1]
              - emotion_logits shape (B, 7), raw logits in EMOTION_CLASSES order
        """
        feats = self.extract_features(x)
        return self.head(feats), self.emotion_head(feats)
