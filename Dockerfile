# Используем Node.js как базовый образ
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Собираем фронтенд
RUN npm run build

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "run", "dev"] 