output "server_url" {
  value = "https://${azurerm_container_app.server.ingress[0].fqdn}"
}

output "image_repository" {
  value = "${data.azurerm_container_registry.shared.login_server}/${local.image_repo}"
}

# GitHub Actions variables for .github/workflows/deploy.yml (ids, not secrets).
output "deploy_client_id" {
  value = azurerm_user_assigned_identity.deploy.client_id
}

output "tenant_id" {
  value = azurerm_user_assigned_identity.deploy.tenant_id
}

output "web_url" {
  value = "https://${azurerm_static_web_app.web.default_host_name}"
}
