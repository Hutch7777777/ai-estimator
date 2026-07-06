# Exterior Finishes AI Branding

## Product Name

Use `Exterior Finishes AI` for the standalone assistant experience.

EstimatePros remains the estimating platform/backend name, but the user-facing company assistant should be branded for Exterior Finishes when presented through the company website.

## Recommended Domain Setup

Best option:

- `ai.extfinishes.com` points to this Next.js app.
- The public `extfinishes.com` site links to `ai.extfinishes.com`.
- The AI app keeps its own auth or office-mode gate.

Alternative:

- `extfinishes.com/ai` proxies to this app.
- This requires the current website host/provider to route only `/ai` traffic to the AI app while leaving the rest of the marketing site untouched.

## Website Placement

Add a small internal-facing link or protected entry point from the Exterior Finishes website, such as:

- Header/footer link: `Exterior Finishes AI`
- Staff-only page: `/ai`
- Button label: `Open Exterior Finishes AI`

## Access Guidance

Do not expose the assistant publicly without a gate. It can access project, client, takeoff, pricing, and proposal data.

Good office-friendly options:

- Shared office PIN/password
- Cloudflare Access
- Office IP/VPN allowlist
- Existing Supabase login for named users
