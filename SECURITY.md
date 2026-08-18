# Security Policy

## Reporting a Vulnerability

OpenWed stores personal data (guest names, contact details, RSVP responses, and
wedding planning data). Security issues are taken seriously.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, report privately by emailing the maintainer (see the repository's
About section for the contact address) or opening a [private security
advisory](https://github.com/AsharFatmi/openwed/security/advisories/new).

You should receive a response within 48 hours. If you don't, follow up.

## Scope

- Authentication and authorization bypasses
- Guest data exposure (RSVP tokens, guest lists, contact details)
- Remote code execution
- Injection vulnerabilities (SQL, template, prompt)
- SSRF / unsafe URL handling
- Secrets or credentials committed to the repository

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

Only the latest release receives security patches.

## Disclosure Policy

- The maintainer will acknowledge receipt within 48 hours
- A fix will be released as soon as possible, typically within 7 days
- The vulnerability will be disclosed publicly after the fix is released

## Self-Hosting Note

OpenWed is designed to be self-hosted. You are responsible for:

- Keeping the deployment and its dependencies up to date
- Securing the server and database
- Protecting `NEXTAUTH_SECRET` and API keys
- Using HTTPS in production
