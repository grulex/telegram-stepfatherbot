import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Определяем пути к файлам
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/app/data' : join(__dirname, '../data');
const dbPath = process.env.DB_PATH || join(DATA_DIR, 'bots.db');
const configPath = process.env.CONFIG_PATH || join(__dirname, '../config.json');

// Загружаем конфигурацию
let config;
try {
  const configFile = await fs.readFile(configPath, 'utf8');
  config = JSON.parse(configFile);
} catch (error) {
  console.error('Failed to load config:', error);
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(join(__dirname, '../dist')));

let db;

// Initialize database
async function initializeDatabase() {
  const SQL = await initSqlJs();
  
  try {
    // Создаем директорию для базы данных, если она не существует
    const dbDir = dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    // Пытаемся прочитать существующую базу данных
    try {
      const fileBuffer = await fs.readFile(dbPath);
      db = new SQL.Database(fileBuffer);
    } catch (err) {
      // Если файл не существует, создаем новую базу данных
      db = new SQL.Database();
    }

    // Create tables if they don't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS bots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT UNIQUE,
        token TEXT,
        username TEXT,
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bot_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT,
        language TEXT,
        name TEXT,
        description TEXT,
        short_description TEXT,
        UNIQUE(bot_id, language)
      );
    `);

    // Save database periodically
    setInterval(saveDatabase, 5000);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

// Save database to file
async function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      await fs.writeFile(dbPath, Buffer.from(data));
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }
}

// Helper function to fetch bot info from Telegram
async function fetchBotInfo(token) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = await response.json();
  return data.result;
}

// Helper function to update bot settings on Telegram
async function updateTelegramBotSettings(token, language, { name, description, shortDescription }) {
  const baseUrl = `https://api.telegram.org/bot${token}`;
  const updates = [];

  if (name) {
    updates.push(
      fetch(`${baseUrl}/setMyName`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language_code: language })
      })
    );
  }

  if (description) {
    updates.push(
      fetch(`${baseUrl}/setMyDescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, language_code: language })
      })
    );
  }

  if (shortDescription) {
    updates.push(
      fetch(`${baseUrl}/setMyShortDescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ short_description: shortDescription, language_code: language })
      })
    );
  }

  await Promise.all(updates);
}

// Get available languages
app.get('/api/languages', (req, res) => {
  res.json(config.languages);
});

// Add new bot
app.post('/api/bots', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Токен бота не указан' });
  }

  try {
    const botInfo = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      .then(async (response) => {
        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.description || 'Неверный токен бота');
        }
        return data.result;
      });
    
    try {
      db.run('INSERT INTO bots (bot_id, token, username) VALUES (?, ?, ?)',
        [botInfo.id.toString(), token, botInfo.username]);
    } catch (dbError) {
      if (dbError.message.includes('UNIQUE constraint failed')) {
        throw new Error('Этот бот уже добавлен');
      }
      throw new Error(`Ошибка при сохранении бота: ${dbError.message}`);
    }

    // Получаем настройки для дефолтного языка
    const baseUrl = `https://api.telegram.org/bot${token}`;
    const [nameRes, descRes, shortDescRes] = await Promise.all([
      fetch(`${baseUrl}/getMyName`).then(r => r.json()),
      fetch(`${baseUrl}/getMyDescription`).then(r => r.json()),
      fetch(`${baseUrl}/getMyShortDescription`).then(r => r.json())
    ]);

    if (!nameRes.ok) throw new Error(`Ошибка при получении имени: ${nameRes.description}`);
    if (!descRes.ok) throw new Error(`Ошибка при получении описания: ${descRes.description}`);
    if (!shortDescRes.ok) throw new Error(`Ошибка при получении короткого описания: ${shortDescRes.description}`);

    const [nameData, descData, shortDescData] = await Promise.all([
      nameRes.json(),
      descRes.json(),
      shortDescRes.json()
    ]);

    // Сохраняем дефолтные настройки
    const defaultSettings = {
      language: '',
      name: nameData.ok && nameData.result?.name ? nameData.result.name : '',
      description: descData.ok && descData.result?.description ? descData.result.description : '',
      short_description: shortDescData.ok && shortDescData.result?.short_description ? shortDescData.result.short_description : ''
    };

    db.run(`
      INSERT OR REPLACE INTO bot_settings (bot_id, language, name, description, short_description)
      VALUES (?, ?, ?, ?, ?)
    `, [
      botInfo.id.toString(),
      defaultSettings.language,
      defaultSettings.name,
      defaultSettings.description,
      defaultSettings.short_description
    ]);

    // Получаем настройки для остальных языков
    const settingsByLanguage = new Map();

    for (const { code: lang } of config.languages) {
      try {
        const [nameRes, descRes, shortDescRes] = await Promise.all([
          fetch(`${baseUrl}/getMyName?language_code=${lang}`),
          fetch(`${baseUrl}/getMyDescription?language_code=${lang}`),
          fetch(`${baseUrl}/getMyShortDescription?language_code=${lang}`)
        ]);

        const [nameData, descData, shortDescData] = await Promise.all([
          nameRes.json(),
          descRes.json(),
          shortDescRes.json()
        ]);

        // Создаем объект настроек для текущего языка
        const settings = { language: lang };
        let hasData = false;

        // Обрабатываем имя
        if (nameData.ok && nameData.result?.name) {
          settings.name = nameData.result.name;
          hasData = true;
        }

        // Обрабатываем описание
        if (descData.ok && descData.result?.description) {
          settings.description = descData.result.description;
          hasData = true;
        }

        // Обрабатываем короткое описание
        if (shortDescData.ok && shortDescData.result?.short_description) {
          settings.short_description = shortDescData.result.short_description;
          hasData = true;
        }

        // Сохраняем настройки только если есть хотя бы одно непустое значение
        if (hasData) {
          settingsByLanguage.set(lang, settings);
        }
      } catch (error) {
        console.error(`Failed to fetch settings for language ${lang}:`, error);
      }
    }

    // Сохраняем настройки в базе данных
    for (const settings of settingsByLanguage.values()) {
      db.run(`
        INSERT OR REPLACE INTO bot_settings (bot_id, language, name, description, short_description)
        VALUES (?, ?, ?, ?, ?)
      `, [
        botInfo.id.toString(),
        settings.language,
        settings.name || '',
        settings.description || '',
        settings.short_description || ''
      ]);
    }

    // Обновляем время последней синхронизации
    const now = new Date().toISOString();
    db.run('UPDATE bots SET last_sync = ? WHERE bot_id = ?', [now, botInfo.id.toString()]);

    // Обновляем информацию о боте
    const botResult = db.exec('SELECT token FROM bots WHERE bot_id = ?', [botInfo.id.toString()]);
    if (botResult[0]?.values[0]) {
      botInfo.token = botResult[0].values[0][0];
    }

    // Получаем сохраненные настройки
    const settings = db.exec('SELECT language, name, description, short_description FROM bot_settings WHERE bot_id = ?', [botInfo.id.toString()]);

    res.json({ 
      success: true, 
      bot: botInfo,
      settings: settings[0]?.values.map(([language, name, description, short_description]) => ({
        language,
        name,
        description,
        short_description
      })) || []
    });
  } catch (error) {
    console.error('Ошибка при добавлении бота:', error);
    res.status(400).json({ error: error.message || 'Ошибка при добавлении бота' });
  }
});

// Get all bots
app.get('/api/bots', (req, res) => {
  const bots = db.exec('SELECT bot_id, username, last_sync FROM bots')[0]?.values.map(([bot_id, username, last_sync]) => ({
    bot_id,
    username,
    last_sync: last_sync || null
  })) || [];
  res.json(bots);
});

// Get bot settings
app.get('/api/bots/:botId/settings', (req, res) => {
  const { botId } = req.params;
  const result = db.exec('SELECT language, name, description, short_description FROM bot_settings WHERE bot_id = ?', [botId]);
  const settings = result[0]?.values.map(([language, name, description, short_description]) => ({
    language,
    name,
    description,
    short_description
  })) || [];
  res.json(settings);
});

// Update bot settings
app.post('/api/bots/:botId/settings', async (req, res) => {
  const { botId } = req.params;
  const { language, name, description, short_description } = req.body;

  const botResult = db.exec('SELECT token FROM bots WHERE bot_id = ?', [botId]);
  if (!botResult[0]?.values[0]) {
    return res.status(404).json({ error: 'Бот не найден' });
  }
  const token = botResult[0].values[0][0];

  try {
    const updates = [];
    const baseUrl = `https://api.telegram.org/bot${token}`;

    // Отправляем только измененные поля в Telegram API
    if (name !== undefined) {
      updates.push(
        fetch(`${baseUrl}/setMyName`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, language_code: language })
        }).then(async (response) => {
          const data = await response.json();
          if (!data.ok) {
            throw new Error(`Ошибка при обновлении имени: ${data.description}`);
          }
          return data;
        })
      );
    }

    if (description !== undefined) {
      updates.push(
        fetch(`${baseUrl}/setMyDescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, language_code: language })
        }).then(async (response) => {
          const data = await response.json();
          if (!data.ok) {
            throw new Error(`Ошибка при обновлении описания: ${data.description}`);
          }
          return data;
        })
      );
    }

    if (short_description !== undefined) {
      updates.push(
        fetch(`${baseUrl}/setMyShortDescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ short_description, language_code: language })
        }).then(async (response) => {
          const data = await response.json();
          if (!data.ok) {
            throw new Error(`Ошибка при обновлении короткого описания: ${data.description}`);
          }
          return data;
        })
      );
    }

    // Выполняем все обновления параллельно
    if (updates.length > 0) {
      await Promise.all(updates);
    }

    // Получаем текущие настройки из базы
    const currentSettings = db.exec(
      'SELECT name, description, short_description FROM bot_settings WHERE bot_id = ? AND language = ?',
      [botId, language]
    );

    const existingSettings = currentSettings[0]?.values[0] || [null, null, null];
    
    try {
      // Обновляем только те поля, которые были изменены
      db.run(`
        INSERT OR REPLACE INTO bot_settings (bot_id, language, name, description, short_description)
        VALUES (?, ?, ?, ?, ?)
      `, [
        botId,
        language,
        name !== undefined ? name : existingSettings[0] || '',
        description !== undefined ? description : existingSettings[1] || '',
        short_description !== undefined ? short_description : existingSettings[2] || ''
      ]);
    } catch (dbError) {
      throw new Error(`Ошибка при сохранении в базу данных: ${dbError.message}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при обновлении настроек бота:', error);
    res.status(500).json({ error: error.message || 'Ошибка при обновлении настроек бота' });
  }
});

// Refresh bot info
app.post('/api/bots/:botId/refresh', async (req, res) => {
  const { botId } = req.params;
  const botResult = db.exec('SELECT token FROM bots WHERE bot_id = ?', [botId]);

  if (!botResult[0]?.values[0]) {
    return res.status(404).json({ error: 'Бот не найден' });
  }
  const token = botResult[0].values[0][0];

  try {
    // Проверяем доступность бота
    const botInfoResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const botInfoData = await botInfoResponse.json();
    if (!botInfoData.ok) {
      throw new Error(botInfoData.description || 'Ошибка при получении информации о боте');
    }
    const botInfo = botInfoData.result;

    const baseUrl = `https://api.telegram.org/bot${token}`;
    
    // Получаем настройки для дефолтного языка
    const [nameRes, descRes, shortDescRes] = await Promise.all([
      fetch(`${baseUrl}/getMyName`),
      fetch(`${baseUrl}/getMyDescription`),
      fetch(`${baseUrl}/getMyShortDescription`)
    ]);

    const [nameData, descData, shortDescData] = await Promise.all([
      nameRes.json(),
      descRes.json(),
      shortDescRes.json()
    ]);

    // Проверяем ответы от API
    if (!nameData.ok) throw new Error(`Ошибка при получении имени: ${nameData.description}`);
    if (!descData.ok) throw new Error(`Ошибка при получении описания: ${descData.description}`);
    if (!shortDescData.ok) throw new Error(`Ошибка при получении короткого описания: ${shortDescData.description}`);

    // Сохраняем дефолтные настройки
    const defaultSettings = {
      language: '',
      name: nameData.result?.name || '',
      description: descData.result?.description || '',
      short_description: shortDescData.result?.short_description || ''
    };

    try {
      db.run(`
        INSERT OR REPLACE INTO bot_settings (bot_id, language, name, description, short_description)
        VALUES (?, ?, ?, ?, ?)
      `, [
        botId,
        defaultSettings.language,
        defaultSettings.name,
        defaultSettings.description,
        defaultSettings.short_description
      ]);
    } catch (dbError) {
      throw new Error(`Ошибка при сохранении настроек в базу данных: ${dbError.message}`);
    }

    // Получаем настройки для остальных языков
    const settingsByLanguage = new Map();

    for (const { code: lang } of config.languages) {
      try {
        const [nameRes, descRes, shortDescRes] = await Promise.all([
          fetch(`${baseUrl}/getMyName?language_code=${lang}`),
          fetch(`${baseUrl}/getMyDescription?language_code=${lang}`),
          fetch(`${baseUrl}/getMyShortDescription?language_code=${lang}`)
        ]);

        const [nameData, descData, shortDescData] = await Promise.all([
          nameRes.json(),
          descRes.json(),
          shortDescRes.json()
        ]);

        // Проверяем ответы от API для каждого языка
        if (!nameData.ok) throw new Error(`Ошибка при получении имени для языка ${lang}: ${nameData.description}`);
        if (!descData.ok) throw new Error(`Ошибка при получении описания для языка ${lang}: ${descData.description}`);
        if (!shortDescData.ok) throw new Error(`Ошибка при получении короткого описания для языка ${lang}: ${shortDescData.description}`);

        // Создаем объект настроек для текущего языка
        const settings = { language: lang };
        let hasData = false;

        if (nameData.result?.name) {
          settings.name = nameData.result.name;
          hasData = true;
        }

        if (descData.result?.description) {
          settings.description = descData.result.description;
          hasData = true;
        }

        if (shortDescData.result?.short_description) {
          settings.short_description = shortDescData.result.short_description;
          hasData = true;
        }

        if (hasData) {
          settingsByLanguage.set(lang, settings);
        }
      } catch (error) {
        console.error(`Ошибка при получении настроек для языка ${lang}:`, error);
        throw new Error(`Ошибка при получении настроек для языка ${lang}: ${error.message}`);
      }
    }

    // Обновляем настройки в базе данных
    try {
      for (const settings of settingsByLanguage.values()) {
        db.run(`
          INSERT OR REPLACE INTO bot_settings (bot_id, language, name, description, short_description)
          VALUES (?, ?, ?, ?, ?)
        `, [
          botId,
          settings.language,
          settings.name || '',
          settings.description || '',
          settings.short_description || ''
        ]);
      }
    } catch (dbError) {
      throw new Error(`Ошибка при сохранении языковых настроек в базу данных: ${dbError.message}`);
    }

    // Обновляем время последней синхронизации
    const now = new Date().toISOString();
    try {
      db.run('UPDATE bots SET last_sync = ? WHERE bot_id = ?', [now, botId]);
    } catch (dbError) {
      throw new Error(`Ошибка при обновлении времени синхронизации: ${dbError.message}`);
    }

    // Получаем обновленные настройки из базы
    const settings = db.exec('SELECT language, name, description, short_description FROM bot_settings WHERE bot_id = ?', [botId]);
    
    res.json({ 
      success: true, 
      bot: {
        ...botInfo,
        last_sync: now
      },
      settings: settings[0]?.values.map(([language, name, description, short_description]) => ({
        language,
        name,
        description,
        short_description
      })) || []
    });
  } catch (error) {
    console.error('Ошибка при обновлении информации о боте:', error);
    res.status(500).json({ error: error.message || 'Ошибка при обновлении информации о боте' });
  }
});

// Delete bot
app.delete('/api/bots/:botId', async (req, res) => {
  const { botId } = req.params;

  try {
    // Проверяем существование бота
    const botExists = db.exec('SELECT 1 FROM bots WHERE bot_id = ?', [botId]);
    if (!botExists[0]?.values[0]) {
      return res.status(404).json({ error: 'Бот не найден' });
    }

    try {
      // Удаляем настройки бота
      db.run('DELETE FROM bot_settings WHERE bot_id = ?', [botId]);
    } catch (dbError) {
      throw new Error(`Ошибка при удалении настроек бота: ${dbError.message}`);
    }

    try {
      // Удаляем самого бота
      db.run('DELETE FROM bots WHERE bot_id = ?', [botId]);
    } catch (dbError) {
      throw new Error(`Ошибка при удалении бота: ${dbError.message}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при удалении бота:', error);
    res.status(500).json({ error: error.message || 'Ошибка при удалении бота' });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
});