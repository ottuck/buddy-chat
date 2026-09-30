terraform {
  required_version = ">= 1.9"

  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 2.19"
    }
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.6"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.26"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # State in Cloudflare R2 (S3-compatible), outside the clouds it describes. The endpoint comes with
  # init (it names the Cloudflare account) and the R2 API token as AWS_ACCESS_KEY_ID /
  # AWS_SECRET_ACCESS_KEY, both from infra/.env (see README in this folder, not committed).
  backend "s3" {
    bucket                      = "buddy-chat-tfstate"
    key                         = "prod.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

# Credentials come from the environment (infra/.env): MONGODB_ATLAS_CLIENT_ID and
# MONGODB_ATLAS_CLIENT_SECRET (an Atlas service account), RAILWAY_TOKEN (an account token), and
# CLOUDFLARE_API_TOKEN.
provider "mongodbatlas" {}
provider "railway" {}
provider "cloudflare" {}
