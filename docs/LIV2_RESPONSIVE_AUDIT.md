# Live Interview V2 Responsive Audit
**Date**: May 01, 2026
**Scope**: 5 key LiV2 components across Candidate and Recruiter portals.

## 1. LiveInterviewRoom.tsx (Candidate Portal)
**Path**: `Frontend/candidate-portal/src/components/live-interview-v2/LiveInterviewRoom.tsx`

- **Responsive Tailwind Classes**: Extensive use of `md:` breakpoint (e.g., `md:grid-cols-2`, `md:p-6`, `md:text-xs`, `md:flex-row`).
- **Fixed Widths**: None observed that cause horizontal scrolling. The `max-w-[200px]` constraint on the visualizer scales down naturally.
- **Touch Targets**: Bottom control buttons are `w-12 h-12 md:w-14 md:h-14` (48px to 56px), which exceeds the 44px minimum touch target requirement. The End button is even larger.
- **Layout Patterns**: Uses `flex-col md:flex-row` and `grid-cols-1 md:grid-cols-2` perfectly to adapt from mobile to desktop.
- **Overflow Containers**: Appropriate use of `overflow-hidden` on parent container and `overflow-y-auto` on the transcript.

**Verdict**: Good responsive coverage.

## 2. LiveInterviewFlow.tsx (Candidate Portal)
**Path**: `Frontend/candidate-portal/src/components/LiveInterviewFlow.tsx`

- **Responsive Tailwind Classes**: Largely absent. The layout relies heavily on `max-w-3xl` and `mx-auto` without adapting inner padding for smaller screens.
- **Fixed Widths**: The progress bar has hardcoded widths (`w-24` and `px-12`) that will likely overflow on mobile screens (< 375px). 
- **Touch Targets**: Standard buttons used, generally sufficient (40px-44px default from shadcn/ui).
- **Layout Patterns**: Uses `px-12 p-12 p-8` which are too large for mobile devices. It lacks `flex-col` adjustments on inner elements.
- **Overflow Containers**: No specific overflow wrappers in the progress bar causing potential horizontal cutoff.

**Verdict**: Needs significant improvements. Should swap `p-12` to `p-6 md:p-12` and allow progress step lines to wrap or scale down `w-24 md:w-auto`.

## 3. LiveInterviewMonitor.tsx (Recruiter Portal)
**Path**: `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/LiveInterviewMonitor.tsx`

- **Responsive Tailwind Classes**: Very few breakpoint prefixes are utilized. 
- **Fixed Widths**: The top summary stats card container `flex gap-3 px-6 py-4` lacks `flex-wrap` and will squash or overflow. Time labels have fixed widths (`w-[84px]`).
- **Touch Targets**: `p-1.5` on the header buttons (`X`, `RefreshCw`) creates very small touch targets (~28px), below the 44px recommendation.
- **Layout Patterns**: The main layout is mostly flex without wrapping adjustments.
- **Overflow Containers**: Good use of `overflow-y-auto` on the session list and expanded transcript view.

**Verdict**: Needs mobile layout adjustments (e.g., `flex-wrap` for summary cards) and larger hit areas for icon buttons.

## 4. LiveInterviewResults.tsx (Recruiter Portal)
**Path**: `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/LiveInterviewResults.tsx`

- **Responsive Tailwind Classes**: Good usage of `md:flex-row`, `lg:grid-cols-3` for the dimension cards and layouts.
- **Fixed Widths**: `ScoreRing` defaults to `120px` but is contained. No breaking widths observed.
- **Touch Targets**: The tabs and accordion headers are large enough. Icon buttons (`RefreshCw`) have small padding and might be tricky on mobile.
- **Layout Patterns**: The overall evaluation summary uses `flex-col md:flex-row`, stacking gracefully on mobile. The dimensions grid scales nicely `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.
- **Overflow Containers**: Transcript has `max-h-[600px] overflow-y-auto`. Per-question criteria have `truncate` to prevent text blowout.

**Verdict**: Solid responsive foundation. Might just need minor touch target bumps for utility buttons.

## 5. ConfigWizardV2.tsx (Recruiter Portal)
**Path**: `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/ConfigWizardV2.tsx`

- **Responsive Tailwind Classes**: Progress bar cleverly uses `hidden md:block` on descriptions to save horizontal space on mobile.
- **Fixed Widths**: Time budget select box has some fixed internal padding but should not break layouts.
- **Touch Targets**: Navigation and config buttons are well sized.
- **Layout Patterns**: Stacked flex layouts. It delegates a lot of content to child components (e.g. `RubricEditor`), but the wizard shell itself stacks vertically well.
- **Overflow Containers**: `overflow-hidden` used on the main card shell.

**Verdict**: Good baseline responsiveness in the wizard shell.

---
### Summary of Action Items
- **LiveInterviewFlow.tsx**: Replace large fixed paddings (`px-12`, `p-12`) with responsive counterparts (`p-4 md:p-12`). Make the progress bar wrap or scale.
- **LiveInterviewMonitor.tsx**: Add `flex-wrap` to summary cards. Increase padding on header icon buttons to at least `p-2` or `p-3`.
