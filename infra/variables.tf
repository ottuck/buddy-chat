variable "subscription_id" {
  type    = string
  default = "40436556-4969-4c35-89f1-fddd484e1daf" # Personal-Dev
}

# Users in Japan first; the DocumentDB free tier is available here.
variable "location" {
  type    = string
  default = "japaneast"
}

# Globally unique names (DocumentDB) take this suffix.
variable "suffix" {
  type    = string
  default = "bc26jp01"
}

# How GitHub names the repository in OIDC subjects: owner and repo with their numeric ids
# (e.g. repo:ottuck@116790133/buddy-chat@1389320040:ref:refs/heads/main), so a renamed or recreated
# repository with the same name does not match.
variable "github_oidc_repository" {
  type    = string
  default = "ottuck@116790133/buddy-chat@1389320040"
}

# Only used on the first apply. After that the deploy workflow sets the image and Terraform
# leaves it alone.
variable "initial_image_tag" {
  type    = string
  default = "initial"
}

# Other origins the web app is served from (custom domains), plus local Expo web dev servers.
variable "web_origins" {
  type    = list(string)
  default = ["http://localhost:8081", "http://localhost:8082", "http://localhost:8083"]
}
