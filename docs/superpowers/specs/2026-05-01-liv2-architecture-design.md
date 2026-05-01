# LiV2 Architecture and UX Documentation Design Spec

## Goal
Create a comprehensive architecture and UX documentation file for the Live Interview V2 (LiV2) feature to serve as a single source of truth for technical and non-technical stakeholders.

## Stakeholders
- Senior Engineering Team (Technical details, API, Pipeline)
- Product Managers (UX flows, Business logic)
- Technical Recruiters (Scoring, Verdicts, Configuration)

## Content Strategy
1. **Accessibility**: Use professional but accessible language. Use ASCII diagrams for complex flows.
2. **Accuracy**: Cross-reference all details with the current implementation in `backend/app/api/v1/live_interview_v2.py`, `judge.py`, and relevant React components.
3. **Completeness**: Cover the full lifecycle from configuration to evaluation.

## Proposed Sections
1. **System Architecture Overview**: High-level component map and session lifecycle.
2. **Data Flow & Lifecycle**: Detailed sequence from rubric creation to evaluation persistence.
3. **Judging & Scoring Methodology**: Deep dive into the 5-phase pipeline and scoring algorithms.
4. **Recruiter UX**: Walkthrough of the Config Wizard and Results/Comparison views.
5. **Candidate UX**: Onboarding and Room experience.
6. **API Reference**: Key endpoints for developers.

## Success Criteria
- All 13 API endpoints documented.
- 5 phases of the judge pipeline explained in detail.
- Scoring thresholds and verdict logic accurately reflected.
- All recruiter config wizard steps explained.
- ASCII diagrams successfully illustrating the architecture.
