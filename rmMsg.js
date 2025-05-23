const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
require("dotenv").config();

// Конфигурация из .env
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING || ""; // Для повторного входа
const channelId = BigInt(process.env.TARGET_CHANNEL); // Например, -100123456789 → "123456789"

// Инициализация клиента
const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 5 }
);

(async () => {
    await client.start({
        phoneNumber: process.env.PHONE,
        phoneCode: async () => await input("Код из Telegram: "),
        password: async () => await input("Пароль 2FA (если есть): "),
        onError: (err) => console.error("Ошибка входа:", err),
    });

    console.log("✅ Авторизован!");

    // Сохраняем сессию для повторного использования
    const newSession = client.session.save();
    console.log('SESSION_STRING для .env:', newSession);

    // Получаем все сообщения канала
    const messages = await client.getMessages(channelId, { limit: 1000 });

    console.log(messages);

    console.log(`🔍 Найдено ${messages.length} сообщений. Удаление...`);

    // Удаляем каждое сообщение
    for (const msg of messages) {
        try {
            await client.deleteMessages(channelId, [msg.id], { revoke: true });
            console.log(`🗑 Удалено сообщение ${msg.id}`);
            await sleep(500); // Задержка, чтобы избежать флуд-бана
        } catch (err) {
            console.error(`❌ Ошибка при удалении ${msg.id}:`, err.message);
        }
    }

    console.log("✅ Готово!");
    process.exit(0);
})();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function input(prompt) {
    return new Promise((resolve) => {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        readline.question(prompt, (answer) => {
            readline.close();
            resolve(answer);
        });
    });
}