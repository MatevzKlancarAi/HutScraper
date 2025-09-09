/**
 * PM2 Ecosystem Configuration
 * Configuration for running the Mountain Hut Scraper Service with PM2
 */

module.exports = {
  apps: [
    {
      name: 'mountain-hut-scraper',
      script: './src/service.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment configuration
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      
      // Auto restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      
      // Process management
      kill_timeout: 30000,
      listen_timeout: 10000,
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type: 'json',
      merge_logs: true,
      
      // Memory and CPU limits
      max_memory_restart: '500M',
      
      // Health monitoring
      health_check_grace_period: 30000,
      
      // Advanced PM2 features
      watch: false, // Set to true for development
      ignore_watch: [
        'node_modules',
        'logs',
        'results',
        'screenshots',
        '.git'
      ],
      
      // Cron restart (optional - restart service daily at 3 AM)
      cron_restart: '0 3 * * *',
      
      // Source map support
      source_map_support: true,
      
      // Instance variables
      instance_var: 'INSTANCE_ID',
      
      // Process title
      treekill: true
    }
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/mountain-hut-scraper.git',
      path: '/var/www/mountain-hut-scraper',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};