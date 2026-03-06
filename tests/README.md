# EraMatch – Tests

Backend live at `http://localhost:8000` must be running before executing any tests.
and ai0services too on port 8001

## Structure

```
tests/
├── admin-view/          # Admin unit tests (161 tests)
├── recruiter-view/      # Recruiter unit tests (162 tests)
├── candidate-view/      # Candidate unit tests (44 tests)
│   └── unit_testing/
│       ├── testing_functionality/   # pytest files
│       └── logs/                    # standalone log scripts → HTML/JSON reports
└── reports/             # Generated HTML reports (git-ignored)
```

## Run Tests

```powershell
# Single view
python -m pytest tests/candidate-view/ -v
python -m pytest tests/admin-view/unit_testing/ -v
python -m pytest tests/recruiter-view/ -v

# All views at once
python -m pytest tests/ -v --ignore=tests/admin-view/e2e_testing
```

## Generate HTML Reports

```powershell
python -m pytest tests/candidate-view/ --html=tests/reports/candidate_view_report.html --self-contained-html
python -m pytest tests/admin-view/unit_testing/ --html=tests/reports/admin_view_report.html --self-contained-html
python -m pytest tests/recruiter-view/ --html=tests/reports/recruiter_view_report.html --self-contained-html
```

## Assurance Log Scripts (candidate)

Run standalone scripts that generate timestamped HTML + JSON reports in `tests/candidate-view/unit_testing/logs/reports/`:

```powershell
# All modules at once (combined report)
python tests/candidate-view/unit_testing/logs/run_all_logs.py

# Individual modules
python tests/candidate-view/unit_testing/logs/log_candidate_login.py
python tests/candidate-view/unit_testing/logs/log_candidate_dashboard.py
python tests/candidate-view/unit_testing/logs/log_candidate_assessment.py
python tests/candidate-view/unit_testing/logs/log_candidate_interview.py
```
