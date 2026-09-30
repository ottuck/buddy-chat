# Ids of accounts made by hand (not secrets): the Atlas organization and the Cloudflare account
# and zone. Given in infra/.env as TF_VAR_*.
variable "atlas_org_id" {
  type = string
}

variable "cloudflare_account_id" {
  type = string
}

# puny-chat.com, bought through Cloudflare Registrar, so the zone is there already.
variable "cloudflare_zone_id" {
  type = string
}

# The web app (a Cloudflare Worker with static assets, deployed by CI with wrangler: app/wrangler.jsonc)
# and the server, on the same domain.
variable "web_domain" {
  type    = string
  default = "puny-chat.com"
}

variable "api_subdomain" {
  type    = string
  default = "api"
}

# Railway's Southeast Asia region (Singapore), close to users in Korea and Japan; Atlas is in
# the same city so every query stays local.
variable "railway_region" {
  type    = string
  default = "asia-southeast1-eqsg3a"
}

variable "atlas_region" {
  type    = string
  default = "AP_SOUTHEAST_1"
}

# Faster growth than the server default (20) while the app is shown as a portfolio piece.
# Set to null before a real launch.
variable "buddy_exp_per_level" {
  type    = number
  default = 3
}
