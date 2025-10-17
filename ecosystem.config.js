module.exports = {
  apps: [
    {
      name: 'twilio-openai-backend-dev',
      script: 'index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: true,                    // Enable file watching for development
      watch_delay: 1000,             // Delay before restart (ms)
      ignore_watch: [                // Files/folders to ignore
        'node_modules',
        'logs',
        '*.log',
        '.git',
        'coverage',
        'test',
        'tests',
        'ecosystem.config.js'
      ],
      watch_options: {
        followSymlinks: false,
        usePolling: true              // Better for Windows
      },
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5050
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    },
    {
      name: 'twilio-openai-backend-prod',
      script: 'index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: false,                   // No watching in production
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5050
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    }
  ]
};