# Restricting Admin Portal access for production

**Status: recommendation only — nothing below is wired into `infrastructure/nginx/nginx.conf` or `infrastructure/cloudflared/docker-compose.yml` yet.** Do not apply the nginx block until the Cloudflare Access policy (step 2 below) is actually in place — adding a public hostname for `admin` before that policy exists would expose the Admin Portal to the open internet with no gate beyond its own login page, which is exactly what this change is meant to prevent.

## Current state

The Admin Portal (`apps/admin`) is reachable only through nginx's catch-all `server_name _;` block (`infrastructure/nginx/nginx.conf`), which has no IP allowlisting, no Basic Auth, and no rate limiting — its only real restriction is topological: nothing in this repo's infrastructure exposes it beyond the QNAP's LAN (comments mention Tailscale, but no Tailscale config actually exists anywhere in this repo — if it's protecting admin today, it's installed natively on the QNAP outside anything here). A Cloudflare Tunnel + Zero Trust account is already fully set up and working for `api.attenteve.com` and `vendor.attenteve.com` (`infrastructure/cloudflared/docker-compose.yml`) — admin is explicitly, deliberately never proxied through it today (see the comment at `nginx.conf:148-151`).

## Recommended approach: extend the existing Cloudflare Tunnel + add Access

This reuses infrastructure that's already proven out for `api`/`vendor`, rather than introducing a new mechanism (IP allowlisting and Tailscale both have no existing precedent in this repo to build on; HTTP Basic Auth would just duplicate the app's own login wall).

### 1. New nginx server block (add to `infrastructure/nginx/nginx.conf`, alongside the existing `api.attenteve.com`/`vendor.attenteve.com` blocks)

```nginx
    # Public Admin portal — same Tunnel as api/vendor, gated by a Cloudflare
    # Access policy (not just app login) since this is the highest-privilege
    # surface on the platform. Do not add this hostname to the Cloudflare
    # Tunnel's Public Hostname list until the Access policy in step 2 below
    # is actually configured and tested.
    server {
        listen 80;
        server_name admin.attenteve.com;
        limit_req zone=public_gateway burst=20 nodelay;
        set_real_ip_from 172.29.20.0/22;
        real_ip_header CF-Connecting-IP;
        real_ip_recursive on;

        location / {
            set $upstream_admin admin:3002;
            proxy_pass http://$upstream_admin;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_cache_bypass $http_upgrade;
        }
    }
```

### 2. Cloudflare setup (one-time, in the Cloudflare dashboard — cannot be done by an agent)

1. **Zero Trust → Access → Applications → Add an application → Self-hosted.** Application domain: `admin.attenteve.com`. Add a policy — recommended: an email allowlist (Attenteve staff emails) or, if available, an SSO/Google Workspace login requirement — rather than a public "Allow" policy.
2. **Zero Trust → Networks → Tunnels → (the existing `attenteve-api` tunnel) → Public Hostname → Add a public hostname.** Hostname: `admin.attenteve.com`, Service: `http://nginx:80`, Additional application settings → HTTP Host Header: `admin.attenteve.com` (same pattern already used for `api`/`vendor`).
3. Confirm the nginx block from step 1 has been deployed *before* completing step 2 — otherwise the Tunnel will route traffic to a host nginx doesn't recognize.

### 3. Verification

- Visiting `admin.attenteve.com` without an active Cloudflare Access session should show Cloudflare's own login/allowlist challenge, *before* ever reaching the Attenteve login page.
- Visiting it while authenticated through Access should reach the normal Attenteve admin login page — the app's own JWT auth is unchanged and still required on top.
- The LAN-only path (`http://192.168.86.29`) keeps working unchanged for local access — this is purely additive.

## Explicitly not recommended

- **IP allowlisting at nginx** — no existing precedent in this repo, and brittle for admins working from different locations/networks.
- **Formalizing Tailscale** — mentioned in comments but not actually present in any tracked config; would mean building new infrastructure rather than extending what's already working.
- **HTTP Basic Auth at nginx** — duplicates the app's own login wall without adding meaningfully different protection.
