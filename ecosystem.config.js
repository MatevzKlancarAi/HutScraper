module.exports = {
    apps: [
        {
            // Main application
            name: 'mountain-hut-scraper',
            script: 'src/server/index.js',
            cwd: '/app',
            instances: 1, // Single instance for scheduled jobs to avoid conflicts
            exec_mode: 'fork', // Use fork mode for better compatibility with Playwright
            
            // Environment configuration
            env: {
                NODE_ENV: 'development',
                PORT: 3000,
                ENABLE_SCHEDULED_SCRAPING: 'true',
                LOG_LEVEL: 'info'
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 3000,
                ENABLE_SCHEDULED_SCRAPING: 'true',
                LOG_LEVEL: 'info',
                HEADLESS_MODE: 'true'
            },
            env_staging: {
                NODE_ENV: 'staging',
                PORT: 3000,
                ENABLE_SCHEDULED_SCRAPING: 'false', // Disable scheduled jobs in staging
                LOG_LEVEL: 'debug'
            },

            // Process management
            watch: false, // Don't use watch in production
            ignore_watch: ['node_modules', 'logs', 'screenshots', 'results', '.git'],
            restart_delay: 4000,
            max_restarts: 10,
            min_uptime: '10s',
            max_memory_restart: '1G',

            // Logging
            log_file: 'logs/pm2-combined.log',
            out_file: 'logs/pm2-out.log',
            error_file: 'logs/pm2-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            log_rotation: {
                max_size: '10M',
                retain: 5
            },

            // Process behavior
            autorestart: true,
            kill_timeout: 30000, // 30 seconds for graceful shutdown
            listen_timeout: 10000,
            
            // Health monitoring
            health_check_grace_period: 5000,
            
            // Node.js specific options
            node_args: [
                '--max-old-space-size=2048', // Limit memory to 2GB
                '--unhandled-rejections=strict'
            ],

            // Advanced options
            source_map_support: false,
            vizion: false, // Disable git metadata
            pmx: true, // Enable PM2 monitoring
            
            // Custom metadata
            instance_var: 'INSTANCE_ID',
            append_env_to_name: false,
            time: true
        },

        // Optional: Separate process for manual operations (if needed)
        {
            name: 'mountain-hut-worker',
            script: 'src/multiHutCli.js',
            args: ['--full'], // Default to full scrape
            cwd: '/app',
            instances: 1,
            exec_mode: 'fork',
            autorestart: false, // Don't auto-restart worker processes
            watch: false,
            
            env: {
                NODE_ENV: 'development',
                HEADLESS_MODE: 'true'
            },
            env_production: {
                NODE_ENV: 'production',
                HEADLESS_MODE: 'true'
            },

            // Logging
            log_file: 'logs/pm2-worker-combined.log',
            out_file: 'logs/pm2-worker-out.log',
            error_file: 'logs/pm2-worker-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,

            // This process is disabled by default (use pm2 start ecosystem.config.js --only mountain-hut-worker)
            disable: true
        }
    ],

    // Deployment configuration for different environments
    deploy: {
        production: {
            user: 'deploy',
            host: ['your-production-server.com'],
            ref: 'origin/main',
            repo: 'https://github.com/matevzklancar/mountain-hut-scraper.git',
            path: '/var/www/mountain-hut-scraper',
            'pre-deploy-local': '',
            'post-deploy': 'npm install && npm run build:production && pm2 reload ecosystem.config.js --env production',
            'pre-setup': 'apt update && apt install -y git node npm postgresql-client',
            env: {
                NODE_ENV: 'production'
            }
        },

        staging: {
            user: 'deploy',
            host: ['your-staging-server.com'],
            ref: 'origin/develop',
            repo: 'https://github.com/matevzklancar/mountain-hut-scraper.git',
            path: '/var/www/mountain-hut-scraper-staging',
            'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
            env: {
                NODE_ENV: 'staging'
            }
        }
    },

    // PM2+ monitoring configuration
    pmx: {
        http: true,
        ignore_routes: ['/health'], // Ignore health checks in monitoring
        errors: true,
        custom_probes: true,
        network: true,
        ports: true
    }
};