
const { Actor, log } = require('apify');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

Actor.main(async () => {
    const input = await Actor.getInput();
    const { startUrl, maxPages = 5 } = input;

    const browser = await Actor.launchPuppeteer();
    const page = await browser.newPage();

    // Log IP
    try {
        await page.goto('https://api.ipify.org?format=json', { waitUntil: 'domcontentloaded' });
        const ipData = await page.evaluate(() => JSON.parse(document.body.innerText));
        log.info(`🛰️ Using external IP: ${ipData.ip}`);
    } catch (err) {
        log.warning('⚠️ Could not fetch IP address', err);
    }

    let pageNum = 1;
    let keepGoing = true;

    while (keepGoing && pageNum <= maxPages) {
        const pagedUrl = pageNum === 1 ? startUrl : `${startUrl.replace(/\/pg-\d+/, '')}/pg-${pageNum}`;
        log.info(`Scraping page ${pageNum}: ${pagedUrl}`);
        await page.goto(pagedUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);

        const listings = await page.evaluate(() => {
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            const results = [];

            for (const card of cards) {
                const address = card.querySelector('[data-label="pc-address"]')?.textContent?.trim();
                const price = card.querySelector('[data-label="pc-price"]')?.textContent?.trim();
                const beds = card.querySelector('[data-label="pc-meta-beds"]')?.textContent?.trim();
                const baths = card.querySelector('[data-label="pc-meta-baths"]')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                const status = card.innerText.toLowerCase().includes("sold") ? "sold" : "for_sale";
                const idMatch = link?.match(/\/realestateandhomes-detail\/(.+?)_/);

                results.push({
                    propertyId: idMatch ? idMatch[1] : null,
                    address,
                    price,
                    beds,
                    baths,
                    status,
                    link,
                    source: "realtor.com",
                    timestamp: new Date().toISOString()
                });
            }

            return results;
        });

        for (const listing of listings) {
            await Actor.pushData(listing);
        }

        const nextExists = await page.$('[aria-label="Go to next page"]') !== null;
        if (!nextExists) keepGoing = false;

        pageNum++;
    }

    await browser.close();
});
