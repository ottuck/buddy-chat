terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # The storage account is shared with ur-manager; buddy-chat's state has its own container.
  # Shared keys are off on that account, so Terraform signs in with Entra ID.
  backend "azurerm" {
    resource_group_name  = "rg-ur-manager-tfstate"
    storage_account_name = "sturmanagerur26jp01"
    container_name       = "buddy-chat-tfstate"
    key                  = "prod.tfstate"
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
