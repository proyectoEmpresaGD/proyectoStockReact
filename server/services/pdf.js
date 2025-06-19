import isDev from 'isdev';
import puppeteer from 'puppeteer';
import chromium from 'chrome-aws-lambda';

export async function generarPDFdesdeHTML(html) {
    console.log('🖨️ Generando PDF...');
    let browser;

    try {
        if (isDev) {
            // ✅ Local
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        } else {
            // ✅ Producción (Vercel)
            browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath,
                headless: chromium.headless
            });
        }

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '50px', bottom: '50px', left: '30px', right: '30px' }
        });

        await browser.close();
        return pdfBuffer;
    } catch (error) {
        console.error('❌ Error al generar PDF con Puppeteer:', error);
        if (browser) await browser.close();
        throw error;
    }
}
