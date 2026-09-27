# buddy-chat production (docs/server-design.md, 인프라).
# Shared with ur-manager, and only read here (ur-manager's Terraform owns them): the container
# registry, the Container Apps environment, and the tfstate storage account. buddy-chat's container
# app, database, identities and permissions are its own.

locals {
  name       = "buddy-chat"
  image_repo = "buddy-chat/server"
  tags       = { project = "buddy-chat", env = "prod" }
}

data "azurerm_container_registry" "shared" {
  name                = "acurmanagerur26jp01"
  resource_group_name = "rg-ur-manager-prod"
}

# The subscription allows one environment per region, and Japan East's is ur-manager's. Apps in it
# share its network and log destination; nothing here changes the environment itself.
data "azurerm_container_app_environment" "shared" {
  name                = "cae-ur-manager-prod"
  resource_group_name = "rg-ur-manager-prod"
}

resource "azurerm_resource_group" "prod" {
  name     = "rg-${local.name}-prod"
  location = var.location
  tags     = local.tags
}

# --- Database: Azure DocumentDB (MongoDB-compatible), free tier ---

resource "random_password" "db" {
  length  = 32
  special = true
  # URL-safe, so it goes into the connection string as is.
  override_special = "-_"
}

resource "azurerm_mongo_cluster" "db" {
  name                   = "docdb-${local.name}-${var.suffix}"
  resource_group_name    = azurerm_resource_group.prod.name
  location               = azurerm_resource_group.prod.location
  administrator_username = "buddychat"
  administrator_password = random_password.db.result
  compute_tier           = "Free"
  high_availability_mode = "Disabled" # the free tier has no HA
  shard_count            = 1
  storage_size_in_gb     = 32
  version                = "8.0"
  public_network_access  = "Enabled"
  tags                   = local.tags
}

# The portal's "Allow Azure services" toggle, which Terraform cannot set directly
# (terraform-provider-azurerm#31371). Container Apps on the consumption plan has no fixed
# outbound IP. Connections still need the password, over TLS.
resource "azurerm_mongo_cluster_firewall_rule" "azure_services" {
  name             = "AllowAllAzureServicesAndResourcesWithinAzureIps"
  mongo_cluster_id = azurerm_mongo_cluster.db.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

locals {
  # The exported connection string has a <user>:<password> placeholder.
  mongodb_uri = replace(
    azurerm_mongo_cluster.db.connection_strings[0].value,
    "<user>:<password>",
    "${azurerm_mongo_cluster.db.administrator_username}:${random_password.db.result}",
  )
}

# --- Server: Azure Container Apps ---

# The app pulls its image with this identity.
resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${local.name}-prod"
  resource_group_name = azurerm_resource_group.prod.name
  location            = azurerm_resource_group.prod.location
  tags                = local.tags
}

resource "azurerm_role_assignment" "app_pull" {
  scope                = data.azurerm_container_registry.shared.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_container_app" "server" {
  name                         = "ca-${local.name}-prod"
  resource_group_name          = azurerm_resource_group.prod.name
  container_app_environment_id = data.azurerm_container_app_environment.shared.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption" # the shared environment uses workload profiles
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = data.azurerm_container_registry.shared.login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  secret {
    name  = "mongodb-uri"
    value = local.mongodb_uri
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "auto" # HTTP/1.1 upgrade, so WebSockets work
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    # Scales to zero when idle (a few seconds of cold start). At most one replica: realtime state
    # lives in memory.
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "server"
      image  = "${data.azurerm_container_registry.shared.login_server}/${local.image_repo}:${var.initial_image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name        = "SPRING_MONGODB_URI"
        secret_name = "mongodb-uri"
      }
      env {
        name  = "SPRING_MONGODB_DATABASE"
        value = "buddychat"
      }
      env {
        # The web app, custom domains, and local Expo web dev servers (which may use this server too).
        name  = "CORS_ALLOWED_ORIGINS"
        value = join(",", concat(["https://${azurerm_static_web_app.web.default_host_name}"], var.web_origins))
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/actuator/health"
        interval_seconds        = 3
        failure_count_threshold = 20
      }
      liveness_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/actuator/health"
      }
    }
  }

  lifecycle {
    # Deployed by .github/workflows/deploy.yml.
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_role_assignment.app_pull]
}

# --- Deploys from GitHub Actions: OIDC, no stored secret, buddy-chat's own identity ---

resource "azurerm_user_assigned_identity" "deploy" {
  name                = "id-${local.name}-deploy"
  resource_group_name = azurerm_resource_group.prod.name
  location            = azurerm_resource_group.prod.location
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "deploy_main" {
  name                      = "github-main"
  user_assigned_identity_id = azurerm_user_assigned_identity.deploy.id
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = "https://token.actions.githubusercontent.com"
  subject                   = "repo:${var.github_oidc_repository}:ref:refs/heads/main"
}

# On the shared registry, only pushing images.
resource "azurerm_role_assignment" "deploy_push" {
  scope                = data.azurerm_container_registry.shared.id
  role_definition_name = "AcrPush"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
}

# Updating buddy-chat's container app, and nothing else.
resource "azurerm_role_assignment" "deploy_app" {
  scope                = azurerm_container_app.server.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
}

# --- Web app: Azure Static Web Apps (Free), the Expo web export ---

# Static Web Apps take only a few regions for their metadata; the files are served worldwide.
resource "azurerm_static_web_app" "web" {
  name                = "stapp-${local.name}-prod"
  resource_group_name = azurerm_resource_group.prod.name
  location            = "eastasia"
  sku_tier            = "Free"
  sku_size            = "Free"
  tags                = local.tags
}

# The deploy workflow reads the site's deployment token with this, so no token is stored in GitHub.
resource "azurerm_role_assignment" "deploy_web" {
  scope                = azurerm_static_web_app.web.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
}
