# Real-time Blue-Green Deployment Pipeline

This repository includes a GitHub Actions workflow that performs real-time blue-green deployments on push to `main`, ensuring atomic updates, zero downtime, health checks, and automatic rollback.

## Overview

- Monitors `main` branch for commits.
- Triggers build and deploy typically within seconds.
- Builds a container image for the web UI (`Dockerfile.web`).
- Deploys to Kubernetes using blue-green strategy:
  - Creates `Deployment` named `<APP_NAME>-<color>` with labels `app=<APP_NAME>` and `version=<color>`.
  - Waits for readiness probes to pass.
  - Runs external health checks.
  - Atomically switches traffic by patching the `Service` selector to the new `version`.
  - Cleans up the previous deployment and retains logs as artifacts.
- Sends Slack notifications for start/success/failure.
- Maintains audit logs via workflow artifacts and Kubernetes object snapshots.

## Required GitHub Secrets

- `REGISTRY_URL`: Container registry (e.g., `ghcr.io/<owner>` or `registry.example.com`).
- `REGISTRY_USERNAME`: Registry user.
- `REGISTRY_PASSWORD`: Registry password/token.
- `KUBE_CONFIG`: Base64 or raw kubeconfig content for the target cluster.
- `KUBE_NAMESPACE`: Kubernetes namespace for deployment (e.g., `production`).
- `APP_NAME`: Application service name (e.g., `ea-coder-web`).
- `SLACK_WEBHOOK_URL`: Incoming webhook for Slack notifications.
- `HEALTHCHECK_URLS`: Comma-separated URLs to check (e.g., `https://example.com/,https://example.com/health`).

## Files

- `.github/workflows/cd-blue-green.yml`: CI/CD pipeline workflow.
- `Dockerfile.web`: Multi-stage Dockerfile building and serving the SPA via NGINX.
- `deploy/docker/nginx.conf`: NGINX config optimized for SPA routing.
- `deploy/k8s/templates/deployment.yaml`: Kubernetes Deployment template supporting versioned labels and probes.
- `deploy/k8s/templates/service.yaml`: Kubernetes Service template with a color-based selector.
- `scripts/deploy_blue_green.sh`: Renders manifests with `envsubst` and applies them.
- `scripts/health_check.sh`: Validates external endpoints; triggers rollback on failure.
- `scripts/rollback.sh`: Reverts service selector and deletes the failed deployment.

## Deployment Flow

1. Build web artifact and push image tagged with `RELEASE_SHA`.
2. Detect active color (`blue` or `green`) from the Service selector.
3. Create/update the next color Deployment with the new image.
4. Wait for readiness and run health checks.
5. If healthy, atomically patch the Service selector to route all traffic to the new version.
6. Delete the previous Deployment to free resources.
7. On failure, rollback the Service selector and delete the failed Deployment.
8. Notify the operations team via Slack at each stage.
9. Upload deployment logs as artifacts for auditing.

## Atomicity and Zero Downtime

- Atomic traffic cutover occurs at the Service selector patch, ensuring all servers receive identical updates simultaneously.
- Readiness and liveness probes prevent serving unready pods.
- External health checks confirm application behavior beyond pod health.
- Automatic rollback restores prior version if checks fail.

## Versioning & Change Tracking

- Docker images tagged with the commit SHA (`RELEASE_SHA`).
- Supabase function workflow (`supabase-deploy.yml`) continues to set `RELEASE_SHA` and `DEPLOYED_AT` secrets.
- Artifacts and logs attached to each workflow run for audit.

## Notes

- Adjust `replicas` and resource requests/limits in `deployment.yaml` to match capacity.
- If you deploy multiple services, replicate the pattern per service or use a monorepo approach with matrix builds.
- For multi-cluster or multi-region, extend the workflow with additional jobs and fan-out using the same atomic selector pattern.