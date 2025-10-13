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
   git clone https://github.com/TalentDev402/twilio-openai-mediastream.git
   cd twilio-openai-mediastream
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

3. Set up ngrok for local development:

   ```bash
   ngrok http 5050
   ```

   Copy the generated ngrok URL (e.g., `https://[your-ngrok-subdomain].ngrok.app`).

4. Configure your Twilio phone number:
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
│   ├── config/         # Configuration and environment setup
│   ├── services/       # Core service implementations
│   ├── middleware/     # Request/response middleware
│   ├── utils/          # Utility functions and helpers
│   └── db/            # Database models and operations
├── index.js           # Application entry point
├── package.json       # Project dependencies and scripts
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
  - fluent-ffmpeg v2.1.3 - Audio processing
  - moment-timezone v0.5.47 - Time handling
  - ws v8.18.0 - WebSocket client
  - nodemon v3.1.9 - Development server

## Usage

1. Start the application using either:
   ```bash
   npm run dev  # For development with hot reload
   npm start    # For production
   ```

2. Call your Twilio phone number
3. The AI assistant will greet you and begin the conversation
4. Speak naturally to interact with the assistant
5. End the call when finished

## Contributing

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
