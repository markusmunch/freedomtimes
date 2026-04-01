output "worker_name" {
  description = "Worker script name"
  value       = cloudflare_workers_script.holding_page.name
}

output "route_pattern" {
  description = "Worker route pattern"
  value       = cloudflare_workers_route.holding_page.pattern
}
