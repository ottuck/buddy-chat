# infra

puny-chat's infrastructure as Terraform: the server on Railway, MongoDB on Atlas, DNS on Cloudflare,
state in Cloudflare R2. The web app is a Cloudflare Worker that CI deploys with wrangler
(`app/wrangler.jsonc`). Decisions and costs: `docs/server-design.md`, 인프라.

`azure/` is the setup this replaced, kept until its resources are destroyed.

## Accounts and tokens (once, by hand)

Everything below goes into `infra/.env` (copy `.env.example`; ignored by git). Nothing here is committed.

1. **Cloudflare** (puny-chat.com, bought through Cloudflare Registrar)
   - Account id and the zone id of puny-chat.com: the zone's overview page.
   - R2: create a bucket `buddy-chat-tfstate`, then an R2 API token with Object Read & Write on it.
     Its Access Key ID and Secret go in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
   - An API token from the "Edit Cloudflare Workers" template, plus Zone · DNS · Edit for puny-chat.com.
     Terraform uses it for DNS, and CI for the Worker (GitHub secret `CLOUDFLARE_API_TOKEN`).
2. **MongoDB Atlas**: an organization, then Access Manager → Service Accounts, with the
   Organization Project Creator role. Its client id and secret; the organization id (settings).
3. **Railway**: the Hobby plan, then Account Settings → Tokens → an account token (for Terraform).

## Apply

```sh
cd infra
set -a; . ./.env; set +a
terraform init -backend-config="endpoints={s3=\"$R2_ENDPOINT\"}"
terraform plan -out=prod.tfplan
terraform apply prod.tfplan
```

Show the plan before applying, especially when it changes or destroys something that exists.

## CI

After the first apply, in the Railway dashboard: project puny-chat → Settings → Tokens → a project
token for `production`. Then, as GitHub secrets and variables:

```sh
gh secret set RAILWAY_TOKEN
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set EXPO_PUBLIC_API_URL --body "$(terraform output -raw server_url)"
```
