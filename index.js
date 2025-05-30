require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');
const parseSportNews = require("./parseSportNews");

// Конфигурация из .env
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING;
const targetChannel = process.env.TARGET_CHANNEL;
const phoneNumber = process.env.PHONE;

const filePath = process.env.RAILWAY_VOLUME_PATH
    ? path.join(process.env.RAILWAY_VOLUME_PATH, 'sent.json')
    : './sent.json';

const daysBack = 2; // За сколько дней парсим
const keywords = ['Главные события', 'Главные новости', 'Главное к исходу', 'выпуск новостей', 'Итоги дня',
'Что случилось этой ночью', 'Что произошло за день', 'Погода в Калининградской области', 'Изменения на карте за прошедшие сутки'];
const sourceChannels = ['@if_market_news', '@newkal', '@kontext_channel', '@meduzalive', '@echoonline_news', '@rian_ru', '@omyinvestments',
'@interfaxonline', '@kommersant', '@divgen'];

const channelNames = {
    '@if_market_news': 'IF News',
    '@newkal': 'Новый Калининград',
    '@kontext_channel': 'Контекст',
    '@meduzalive': 'Медуза',
    '@echoonline_news': 'Эхо',
    '@rian_ru': 'РИА Новости',
    '@omyinvestments': 'Мои Инвестиции',
    '@interfaxonline': 'Интерфакс',
    '@kommersant': 'Коммерсантъ',
    '@divgen': 'DIVGEN Карта СВО',
}

const now = Math.floor(Date.now() / 1000); // Текущая дата в Unix-формате
const twoDaysAgo = now - (daysBack * 86400); // 86400 = секунд в сутках



// Сессия для авторизации
const session = new StringSession(sessionString || '');

// Инициализация клиента
const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
});

if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
}

const sentMessages = new Set(JSON.parse(fs.readFileSync(filePath, 'utf-8') || []));

async function main() {
    console.log('Подключение к Telegram...');

    await client.start({
        phoneNumber: phoneNumber,
        phoneCode: async () => await input('Введите код из Telegram: '),
        password: async () => await input('Введите пароль 2FA: '), // Запрашиваем, если включён 2FA
        onError: (err) => console.error("Ошибка входа:", err),
    });

    console.log('✅ Успешная авторизация!');

    // Сохраняем сессию для повторного использования
    const newSession = client.session.save();
    console.log('SESSION_STRING для .env:', newSession);

        console.log('🔍 Проверяю новые сообщения...');

        const newMessages = [];

        for (const channel of sourceChannels) {
            try {
                const messages = await client.getMessages(channel, { limit: 100 });

                for (const msg of messages) {
                    if (!msg.text || msg.date < twoDaysAgo) continue;
                    if (sentMessages.has(msg.id)) continue;
                    if (!keywords.some((kw) => msg.text.includes(kw))) {
                        continue;
                    }

                    if (channel === '@divgen' && msg.groupedId?.value) {
                        const groupedId = msg.groupedId?.value;
                        const albumMessages = messages.filter(m => m.groupedId?.value === groupedId).map(m => m.id);
                        msg.albumMessages = albumMessages;
                    }

                    msg.channel = channel;

                    newMessages.push(msg);
                }
            } catch (err) {
                console.error(`❌ Ошибка в канале ${channel}:`, err.message);
            }
        }

    const sportNews = await parseSportNews();

    if (sportNews) {
        await client.sendMessage(targetChannel, {
            message: sportNews,
            parseMode: 'html',
        });
    }

    if(!newMessages.length) {
        console.log('✅ Новых новостей нет');
        process.exit(0);
    }

    newMessages.sort((a, b) => a.date - b.date);

        for (const message of newMessages) {
            try{

                console.log('📢 Новое сообщение:', message.text.substring(0, 50) + '...');

                if (message.channel === '@divgen') {
                    await client.forwardMessages(targetChannel, { messages: [...message.albumMessages || message.id], fromPeer: message.channel });
                } else {
                    const messageDate = new Date((message.date + 60 * 60 * 2) * 1000); // Telegram date в секундах
                    const formattedDate = formatDate(messageDate);

                    // Добавляем дату перед текстом
                    const messageWithDate = `📅 **${formattedDate} | ${channelNames[message.channel]}**\n\n${message.text}`;

                    await client.sendMessage(targetChannel, {
                        message: messageWithDate,
                    });
                }

                // Помечаем как отправленное
                sentMessages.add(message.id);
                console.log('✅ Отправлено в канал!');
                await sleep(500); // Задержка, чтобы избежать флуд-бана

            } catch (err){
                console.error(`❌ Ошибка в ${message.text.substring(0, 50)}:`, err.message);
            }
        }
    const trimmedMessages = trimSet(sentMessages, 150, 50);
    fs.writeFileSync(filePath, JSON.stringify([...trimmedMessages]));

    process.exit(0);
}

// Вспомогательные функции
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

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы 0-11
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes} ${day}.${month}.${year}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimSet(set, maxSize = 150, removeCount = 50) {
    if (set.size > maxSize) {
        const itemsToRemove = Array.from(set).slice(0, removeCount);
        itemsToRemove.forEach(item => set.delete(item));
    }
    return set;
}

// Запуск
main().catch(console.error);