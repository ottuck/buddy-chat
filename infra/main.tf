# puny-chat's infrastructure (docs/server-design.md, 인프라): the server on Railway, MongoDB on
# Atlas, DNS on Cloudflare. The web app is a Cloudflare Worker deployed by CI with wrangler; its
# custom domain comes with that deploy (app/wrangler.jsonc).

locals {
  api_domain = "${var.api_subdomain}.${trimsuffix(data.cloudflare_zone.site.name, ".")}"
  # Where the web app is served; the server allows these origins, plus local Expo dev servers.
  web_origins = [
    "https://${var.web_domain}",
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:8083",
  ]
}

data "cloudflare_zone" "site" {
  zone_id = var.cloudflare_zone_id
}

# --- Database: MongoDB Atlas, free M0 ---

resource "mongodbatlas_project" "this" {
  name   = "puny-chat"
  org_id = var.atlas_org_id
}

resource "mongodbatlas_advanced_cluster" "db" {
  project_id   = mongodbatlas_project.this.id
  name         = "puny-chat"
  cluster_type = "REPLICASET"

  replication_specs = [
    {
      region_configs = [
        {
          electable_specs = {
            instance_size = "M0"
          }
          provider_name         = "TENANT"
          backing_provider_name = "AWS"
          region_name           = var.atlas_region
          priority              = 7
        }
      ]
    }
  ]
}

resource "random_password" "db" {
  length  = 32
  special = false # goes into a connection string
}

resource "mongodbatlas_database_user" "server" {
  project_id         = mongodbatlas_project.this.id
  username           = "buddychat"
  password           = random_password.db.result
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = "buddychat"
  }
}

# Railway has no fixed outbound address on the Hobby plan, so the database accepts connections from
# anywhere; the password (random, 32 characters) and TLS are what protect it.
resource "mongodbatlas_project_ip_access_list" "anywhere" {
  project_id = mongodbatlas_project.this.id
  cidr_block = "0.0.0.0/0"
  comment    = "Railway (no static egress IP)"
}

locals {
  db_host     = trimprefix(mongodbatlas_advanced_cluster.db.connection_strings.standard_srv, "mongodb+srv://")
  mongodb_uri = "mongodb+srv://buddychat:${random_password.db.result}@${local.db_host}/?retryWrites=true&w=majority&appName=puny-chat"
}

# --- Web Push: this server's VAPID key (RFC 8292), kept in the state like the database password.
# Replacing it only makes browsers subscribe again the next time the app opens.

resource "tls_private_key" "vapid" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

# --- Server: Railway ---

resource "railway_project" "this" {
  name        = "puny-chat"
  description = "puny-chat server (Spring Boot)"
  default_environment = {
    name = "production"
  }
}

# Deployed by CI (railway up from server/, which has the Dockerfile and railway.json), not from
# the repository on every push: it deploys only after the checks pass.
resource "railway_service" "server" {
  name       = "server"
  project_id = railway_project.this.id

  # One replica: realtime state (connections, presence, typing) lives in memory.
  regions = [
    {
      region       = var.railway_region
      num_replicas = 1
    }
  ]
}

resource "railway_variable_collection" "server" {
  environment_id = railway_project.this.default_environment.id
  service_id     = railway_service.server.id

  variables = concat(
    [
      { name = "PORT", value = "8080" },
      { name = "SPRING_MONGODB_URI", value = local.mongodb_uri },
      { name = "SPRING_MONGODB_DATABASE", value = "buddychat" },
      { name = "CORS_ALLOWED_ORIGINS", value = join(",", local.web_origins) },
      { name = "BUDDYCHAT_PUSH_VAPIDPRIVATEKEY", value = tls_private_key.vapid.private_key_pem_pkcs8 },
      { name = "BUDDYCHAT_PUSH_VAPIDPUBLICKEY", value = tls_private_key.vapid.public_key_pem },
      # Memory is billed as used: a fixed, small heap instead of a share of the machine.
      { name = "JAVA_TOOL_OPTIONS", value = "-Xmx384m -XX:+UseSerialGC" },
    ],
    var.buddy_exp_per_level == null ? [] : [
      { name = "BUDDYCHAT_BUDDY_EXPPERLEVEL", value = tostring(var.buddy_exp_per_level) },
    ],
  )
}

resource "railway_custom_domain" "api" {
  domain         = local.api_domain
  environment_id = railway_project.this.default_environment.id
  service_id     = railway_service.server.id
  target_port    = 8080
}

# Railway checks the TXT record, then serves the CNAME with its own certificate; Cloudflare only
# answers DNS for it (not proxied), so WebSockets go straight to Railway.
resource "cloudflare_dns_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = railway_custom_domain.api.host_label
  type    = "CNAME"
  content = railway_custom_domain.api.dns_record_value
  proxied = false
  ttl     = 1
}

resource "cloudflare_dns_record" "api_verification" {
  zone_id = var.cloudflare_zone_id
  name    = railway_custom_domain.api.verification_host_label
  type    = "TXT"
  content = railway_custom_domain.api.verification_record_value
  ttl     = 1
}
