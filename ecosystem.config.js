module.exports = {
    apps: [
        {
            name: 'twilio-openai-backend-dev',
            script: 'nodemon',
            args: 'index.js',
            cwd: './',
            instances: 1,
            exec_mode: 'fork',
            watch: false,
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
        }
    ]
};