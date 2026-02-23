# Security Policy

## Supported Versions

Security fixes are currently provided on a best-effort basis for the latest `master` state.

## Reporting a Vulnerability

Please do **not** open public issues for security vulnerabilities.

Report privately to project maintainers and include:

- vulnerability description
- impact
- reproduction steps
- potential mitigation

If no private channel exists yet, define one before public release and update this file.

## Response Targets (Best Effort)

- Initial acknowledgment: within 5 business days
- Triage and impact assessment: within 10 business days
- Fix timeline: depends on severity and complexity

## Deployment Security Recommendations

- Use production-safe values for API endpoints and auth configuration
- Keep backend services behind trusted network boundaries
- Use HTTPS at ingress/load balancer layer
- Avoid committing secrets in `.env` or Helm values files
- Keep dependencies and base images updated
