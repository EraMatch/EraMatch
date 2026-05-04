# EraMatch Deployment Guide

This document explains how to deploy and run the EraMatch platform in different environments.

## 1. Local Development Mode (Laptop as Server)

Use this mode if you want to run the entire platform on your local machine and expose it to the internet via Cloudflare Tunnels (Quick Tunnels).

### Steps
1. Navigate to the `EraMatch` root directory.
2. Run the start script with the `--local-device` flag:
   ```bash
   ./start.sh --local-device
   ```
3. The script will:
   - Synchronize Python virtual environments.
   - Start 3 fresh Cloudflare tunnels.
   - Display 3 public URLs (Backend, Recruiter, Candidate).
   - Start all 5 EraMatch services in the background.

To stop everything and close the tunnels:
```bash
./start.sh kill
```

---

## 2. Cloud Deployment (GCP VM)

The cloud version is fully automated via GitHub Actions using a self-hosted runner on the production VM.

### Automated Deployment
Simply push your changes to the `dev-release-2.0` branch:
```bash
git push origin dev-release-2.0
```
GitHub will automatically trigger the deployment on the VM, which:
1. Pulls the latest code.
2. Restarts the app services.
3. Reuses the **Permanent Tunnels** already running on the VM.

### Cloud Portal URLs
The production portals are hosted at:


---

## 4. Connecting to the VM

To access the production environment directly via SSH:

```bash
gcloud compute ssh eramatch-vm --zone=us-central1-a
```

Once connected, the project is located at `~/EraMatch`.

---

## 5. Troubleshooting
- **Check Tunnel Logs**: `tail -f ~/EraMatch/.logs/tunnel-backend.log`
- **Check App Logs**: `./start.sh logs`
- **Restart Everything**: `./start.sh kill` then `./start.sh`
