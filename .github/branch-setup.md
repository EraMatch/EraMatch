# Branch Setup Commands

## 1. Create Development Branch

```bash
# Make sure you're on main
git checkout main

# Create development branch
git checkout -b development
git push -u origin development

# Go back to main
git checkout main
```

## 2. Branch Structure (Simplified)

```
main              # Production releases only
  ↑
  │ (PR with review required)
  │
development       # Active development (default branch)
  ↑
  │ (PR with review required)
  │
feat/*            # Feature branches from issues
fix/*             # Bug fix branches from issues
other/*           # Other task branches
regulation/*      # Code standard branches
```

## 3. Workflow

```bash
# Start working on issue #23
git checkout development
git pull origin development  # Always pull first!

# Create feature branch
git checkout -b feat/23-add-cv-parsing

# Make changes, commit
git add .
git commit -m "feat: add CV parsing with Whisper #23"

# Push and create PR to development
git push origin feat/23-add-cv-parsing

# On GitHub:
# - Create PR: feat/23-add-cv-parsing → development
# - Request review
# - After approval → Merge
# - Delete feature branch

# When ready for release:
# Create PR: development → main
# Requires review
# Merge to deploy to production
```

## 4. Apply Rulesets on GitHub

**Step 1: Create development branch first**
```bash
git checkout -b development
git push -u origin development
```

**Step 2: Set development as default branch**
1. Go to: https://github.com/Anas-Ah25/EraMatch/settings
2. Under "Default branch" → Change to `development`
