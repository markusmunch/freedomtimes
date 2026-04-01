output "worker_name" {
  description = "Name of the deployed holding page worker"
  value       = module.cloudflare_holding_page.worker_name
}

output "route_pattern" {
  description = "Route pattern attached to the holding page worker"
  value       = module.cloudflare_holding_page.route_pattern
}
