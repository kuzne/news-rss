const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const iconv = require('iconv-lite');

// Конфигурация
const SITE_URL = 'https://www.rusfootball.info';
const STATE_FILE = process.env.RAILWAY_VOLUME_PATH
    ? path.join(process.env.RAILWAY_VOLUME_PATH, 'data.js')
    : './data.js';

// Парсинг новостей
async function parseNews() {
    if (!isWithinTimeRange()) {
        console.log('Спортивные новости в текущее время не проверяются. Текущее время на сервере:', new Date().toLocaleTimeString());
        return null;
    }
    try {
        if (!fs.existsSync(STATE_FILE)) {
            fs.writeFileSync(STATE_FILE, '{ lastSportDate: 0 }', 'utf-8');
        }

        const lastDate = loadLastDate();
        let newestDate = lastDate;

        // 1. Загрузка HTML
        const { data } = await axios({
            url: `${SITE_URL}/main`,
            method: 'GET',
            responseType: 'arraybuffer', // Важно для обработки бинарных данных
        });

        const html = iconv.decode(data, 'win1251');

        const $ = cheerio.load(html);

        // 2. Извлечение новостей
        const newsItems = [];
        let currentDate = '';

        $('#dle-content > h2, #dle-content > article').each((_, element) => {
            if (element.name === 'h2') {
                currentDate = $(element).text().trim();
            } else if (element.name === 'article') {
                const datetime = $(element).find('time[itemprop="datePublished"]').attr('datetime');
                if (!datetime) return;
                const pubDate = parseDateTime(datetime);
                if (pubDate <= lastDate) return true; // Пропускаем старые новости
                // Обновляем newestDate если нашли новую новость
                if (pubDate > newestDate) newestDate = pubDate;

                const title = $(element).find('span[itemprop="name headline"]').text().trim();
                const url = $(element).find('a[itemprop="url"]').attr('href');
                // const time = $(element).find('time').text().trim();

                if (title && url) {
                    newsItems.push({
                        date: currentDate,
                        pubDate,
                        title,
                        url: url.startsWith('http') ? url : `${SITE_URL}${url}`
                    });
                }
            }
        });

        if(!newsItems.length) {
            return null;
        }

        // 3. Форматирование в HTML
        let htmlOutput = `<b>rusfootball | Главные новости</b>\n\n`;
        newsItems.reverse().forEach(item => {
            const pubTime = new Date((item.pubDate + 60 * 60 * 2) * 1000).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
            htmlOutput += `<b>${item.date} ${pubTime}</b>\n<a href="${item.url}">${item.title}</a>\n`;
        });

        if (newestDate > lastDate) {
            saveLastDate(newestDate);
        }

        return htmlOutput;

    } catch (error) {
        console.error('Ошибка парсинга:', error);
        return null;
    }
}

function isWithinTimeRange() {
    const parseHourse = [16, 17, 18, 8, 9, 10]
    const now = new Date();
    const hours = now.getHours();
    return parseHourse.includes(hours);
}

// Функции для работы с датами
function parseDateTime(datetimeStr) {
    return new Date(datetimeStr).getTime() / 1000; // Возвращает Unix timestamp
}

function get24HoursAgo() {
    return Math.floor(Date.now() / 1000) - 86400; // 86400 секунд = 24 часа
}

// Загрузка/сохранение последней даты
function loadLastDate() {
    try {
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data).lastSportDate || get24HoursAgo();
    } catch {
        return get24HoursAgo();
    }
}

function saveLastDate(timestamp) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastSportDate: timestamp }));
}

module.exports = parseNews;