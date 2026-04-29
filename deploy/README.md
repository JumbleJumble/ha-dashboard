# Deploying to a server

## First-time setup

```bash
# 1. Copy just this deploy/ directory to the server (or clone the repo)
scp -r deploy/ user@server:~/ha-dashboard

# 2. On the server — create the .env file (never committed to git)
cd ~/ha-dashboard
cp .env.example .env
nano .env   # fill in HA_URL and HA_TOKEN

# 3. Create the config directory (rooms, gradients, etc.)
mkdir -p config
# Copy your config files here, or mount a volume pointing at them.

# 4. Log in to GHCR so Docker can pull the private images
echo <your-github-pat> | docker login ghcr.io -u JumbleJumble --password-stdin
# A PAT with `read:packages` scope is enough. Create one at:
# https://github.com/settings/tokens

# 5. Pull and start
docker compose pull
docker compose up -d
```

## Updating to the latest build

```bash
docker compose pull
docker compose up -d
```

## Caddy reverse proxy (if you use Caddy on the server)

Add to your Caddyfile:

```caddy
your.domain.or.local {
    reverse_proxy localhost:3000
}
```

## Secrets

`HA_TOKEN` lives only in the `.env` file on the server — it is never in the
git repository or in any Docker image. If you want stronger isolation you can
use Docker Swarm secrets or a tool like `docker secret`, but for a home
automation dashboard the `.env` file is a reasonable boundary.
