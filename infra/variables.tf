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

variable "github_repository" {
  type    = string
  default = "ottuck/buddy-chat"
}

# Only used on the first apply. After that the deploy workflow sets the image and Terraform
# leaves it alone.
variable "initial_image_tag" {
  type    = string
  default = "initial"
}
