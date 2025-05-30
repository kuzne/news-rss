const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const iconv = require('iconv-lite');

// Конфигурация
const SITE_URL = 'https://www.rusfootball.info';

// Парсинг новостей
async function parseNews() {
    if (!isWithinTimeRange()) {
        console.log('Спортивные новости проверяются только с 21:00 до 00:00. Текущее время:', new Date().toLocaleTimeString());
        return;
    }
    try {
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
        let foundFirstH2 = false;
        let stopParsing = false;

        $('#dle-content > h2, #dle-content > article').each((_, element) => {
            if (stopParsing) return;
            if (element.name === 'h2') {
                if (!foundFirstH2) {
                    // Первый h2 - начинаем сбор
                    foundFirstH2 = true;
                    currentDate = $(element).text().trim();
                } else {
                    // Второй h2 - прекращаем парсинг
                    stopParsing = true;
                    return;
                }
            } else if (element.name === 'article') {
                const title = $(element).find('span[itemprop="name headline"]').text().trim();
                const url = $(element).find('a[itemprop="url"]').attr('href');
                const time = $(element).find('time').text().trim();

                if (title && url) {
                    newsItems.push({
                        date: currentDate,
                        time,
                        title,
                        url: url.startsWith('http') ? url : `${SITE_URL}${url}`
                    });
                }
            }
        });

        // 3. Форматирование в Markdown
        let markdownOutput = `<b>rusfootball | Главные новости</b>\n\n`;
        newsItems.reverse().forEach(item => {
            markdownOutput += `<b>${item.date} ${item.time}</b>\n<a href="${item.url}">${item.title}</a>\n`;
        });

        return markdownOutput;

    } catch (error) {
        console.error('Ошибка парсинга:', error);
        return null;
    }
}

function isWithinTimeRange() {
    const now = new Date();
    const hours = now.getHours();
    return hours >= 21;
}

module.exports = parseNews;