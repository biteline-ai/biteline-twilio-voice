# Speech Assistant with Twilio Voice and OpenAI Realtime API

A real-time voice assistant application that enables two-way conversations between users and an AI assistant through phone calls. The application leverages Twilio's Voice and Media Streams capabilities along with OpenAI's Realtime API to create a seamless voice interaction experience.

## Features

- Real-time voice conversations with AI assistant
- WebSocket-based bidirectional audio streaming
- Integration with Twilio Voice and Media Streams
- OpenAI Realtime API integration for natural language processing
- Fast and efficient audio processing using FFmpeg
- Support for multiple concurrent conversations
- Modular architecture with clear separation of concerns
- Environment-based configuration management

## Prerequisites

- **Node.js 18+** (Tested with v18.20.4)
- **Twilio Account** with:
  - Voice-enabled phone number
  - Account SID and Auth Token
- **OpenAI Account** with:
  - API Key
  - Access to Realtime API
- **Supabase Account** (for optional data storage)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/biteline-ai/biteline-twilio-voice.git
   cd biteline-twilio-voice
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:

   ```env
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   OPENAI_API_KEY=your_openai_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   PORT=5050
   ```

## Development Setup

1. Start the development server with hot reload:

   ```bash
   npm run dev
   ```

2. For production:

   ```bash
   npm start
   ```

3. **PM2 Process Management (Recommended for Production):**

   Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

   Start with PM2 (development with auto-restart):
   ```bash
   npm run pm2:start:dev
   ```

   Start with PM2 (production):
   ```bash
   npm run pm2:start:prod
   ```

   Monitor your application:
   ```bash
   npm run pm2:status    # Check status
   npm run pm2:logs:dev  # View logs
   npm run pm2:monit     # Real-time monitoring
   ```

   Stop the application:
   ```bash
   npm run pm2:stop:dev  # Stop development
   npm run pm2:stop:prod # Stop production
   npm run pm2:stop      # Stop all
   ```

4. Set up ngrok for local development:

   ```bash
   ngrok http 5050
   ```

   Copy the generated ngrok URL (e.g., `https://[your-ngrok-subdomain].ngrok.app`).

5. Configure your Twilio phone number:
   - Go to [Twilio Console](https://console.twilio.com/)
   - Navigate to Phone Numbers > Manage > Active Numbers
   - Select your phone number
   - Under "A call comes in", set it to Webhook
   - Enter your ngrok URL followed by `/incoming-call`
   - Save the configuration

## Project Structure

```plaintext
.
├── src/
│   ├── services/       # Core service implementations
│   │   ├── openai.js   # OpenAI Realtime API integration
│   │   ├── twilio.js   # Twilio Voice and Media Streams
│   │   └── whisper.js  # Audio processing utilities
│   ├── utils/          # Utility functions and helpers
│   │   ├── constants.js
│   │   ├── functionDeclarations.js
│   │   └── utils.js
│   └── db/            # Database models and operations
│       └── supabase.js
├── index.js           # Application entry point
├── ecosystem.config.cjs # PM2 process management configuration
├── package.json       # Project dependencies and scripts
├── logs/             # PM2 log files (auto-created)
└── .env              # Environment variables (create from .env.example)
```
d
## Dependencies

- **Core Framework:**
  - Fastify v5.0.0 - High-performance web framework
  - @fastify/websocket v11.0.0 - WebSocket support
  - @fastify/formbody v8.0.0 - Form body parsing
  - @fastify/multipart v9.0.3 - Multipart support

- **External Services:**
  - Twilio v5.4.2 - Voice and Media Streams
  - OpenAI v4.78.0 - Realtime API
  - @supabase/supabase-js v2.48.1 - Database integration

- **Utilities:**
  - dotenv v16.4.5 - Environment configuration
  - moment-timezone v0.5.47 - Time handling
  - ws v8.18.0 - WebSocket client
  - nodemon v3.1.9 - Development server

- **Process Management:**
  - PM2 - Advanced process manager for Node.js applications
  - ecosystem.config.cjs - PM2 configuration for dev/prod environments

## Usage

1. Start the application using one of these methods:

   **Development with hot reload:**
   ```bash
   npm run dev
   ```

   **Production:**
   ```bash
   npm start
   ```

   **PM2 Process Management (Recommended):**
   ```bash
   # Development with auto-restart on file changes
   npm run pm2:start:dev
   
   # Production with process management
   npm run pm2:start:prod
   ```

2. Call your Twilio phone number
3. The AI assistant will greet you and begin the conversation
4. Speak naturally to interact with the assistant
5. End the call when finished

## PM2 Process Management

This project includes PM2 configuration for robust process management:

### Features:
- **Auto-restart on file changes** (development mode)
- **Process monitoring** and crash recovery
- **Log management** with rotation
- **Memory monitoring** with auto-restart
- **Separate dev/prod environments**

### Available Commands:
```bash
# Start applications
npm run pm2:start:dev   # Development with file watching
npm run pm2:start:prod  # Production mode

# Monitor applications
npm run pm2:status      # Check status
npm run pm2:logs:dev    # View development logs
npm run pm2:logs:prod   # View production logs
npm run pm2:monit       # Real-time monitoring dashboard

# Control applications
npm run pm2:restart:dev # Restart development
npm run pm2:restart:prod# Restart production
npm run pm2:stop:dev    # Stop development
npm run pm2:stop:prod    # Stop production
npm run pm2:stop         # Stop all processes
npm run pm2:delete:dev   # Delete development process
npm run pm2:delete:prod  # Delete production process
npm run pm2:flush        # Clear all logs
```

### Auto-start on System Boot:
```bash
# Save current PM2 processes
pm2 save

# Generate startup script
pm2 startup

# Follow the instructions that appear
```

## Contributing

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
