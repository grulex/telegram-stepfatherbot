# Telegram Bot Manager

Web application for managing Telegram bot settings. Allows you to manage bot names, descriptions, and short descriptions in different languages.

![Screenshot](https://github.com/grulex/telegram-stepfatherbot/raw/main/screenshot.png)

## Features

- 🤖 Manage multiple Telegram bots
  - Add new bots using their tokens
  - Delete bots that are no longer needed
  - Refresh bot information from Telegram
- 🌐 Multilingual support (name, description, short description for each language)
- 🔄 Automatic synchronization with Telegram Bot API
- 💾 Local storage of settings in SQLite database

## Requirements

- Node.js 20 or higher
- npm 8 or higher
- Docker and Docker Compose (optional)

## Installation and Launch

### Local Launch (without Docker)

1. Clone the repository:
   ```bash
   git clone https://github.com/grulex/telegram-stepfatherbot.git
   cd telegram-stepfatherbot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application in development mode:
   ```bash
   npm run dev
   ```

4. Open in browser:
   ```
   http://localhost:5173
   ```

### Docker Launch

1. Clone the repository:
   ```bash
   git clone https://github.com/grulex/telegram-stepfatherbot.git
   cd telegram-stepfatherbot
   ```

2. Start with Docker Compose:
   ```bash
   docker-compose up --build
   ```

3. Open in browser:
   ```
   http://localhost:3000
   ```

For background mode launch:
```bash
docker-compose up -d
```

To stop:
```bash
docker-compose down
```

## Project Structure

- `src/` - React Frontend
- `server/` - Node.js/Express Backend
- `data/` - Database storage directory
- `config.json` - Language configuration
- `docker-compose.yml` - Docker configuration
- `Dockerfile` - Docker image build

## Configuration

### Languages

Supported languages are configured in `config.json`:

```json
{
  "languages": [
    { "code": "ru", "name": "Русский" },
    { "code": "en", "name": "English" },
    { "code": "tr", "name": "Türkçe" },
    { "code": "es", "name": "Español" },
    { "code": "fa", "name": "فارسی" }
  ]
}
```

Note: The example above shows only a few languages. The actual configuration includes more languages.

### Environment Variables

- `PORT` - server port (default 3000)
- `NODE_ENV` - environment (production/development)
- `DB_PATH` - database file path
- `CONFIG_PATH` - configuration file path

## Development

### Available Commands

- `npm run dev` - start in development mode (local)
- `npm run dev:docker` - start in development mode (in Docker)
- `npm run build` - build frontend
- `npm start` - start backend only
- `npm run lint` - code check
- `npm run preview` - preview built frontend

### Hot Reload

- Frontend automatically reloads when code changes
- Backend requires manual restart for changes

## Data

- Database (`bots.db`) is automatically created in the `data/` directory
- All bot settings are stored locally
- Bot settings are synchronized with Telegram API when adding a bot
- Changes are applied both locally and in Telegram

[Русская версия](README.ru.md) 
