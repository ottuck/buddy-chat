output "server_url" {
  value = "https://${local.api_domain}"
}

output "web_url" {
  value = "https://${var.web_domain}"
}

# For CI (a project token is made in the Railway dashboard for this project and environment).
output "railway_project_id" {
  value = railway_project.this.id
}

output "railway_service_id" {
  value = railway_service.server.id
}
