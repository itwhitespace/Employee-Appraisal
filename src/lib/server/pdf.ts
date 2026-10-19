import "server-only";

/**
 * Turns a page of this app into a PDF with headless Chromium, the same way "Save as PDF"
 * in the print dialog does: real text, laid out by the print stylesheet in globals.css.
 *
 * On Vercel the browser comes from @sparticuz/chromium (Linux only). Elsewhere, e.g. for
 * `npm run dev` on Windows, set CHROME_EXECUTABLE_PATH to a local Chrome or Edge.
 */
export async function renderPagePdf(
  url: string,
  session: { name: string; value: string },
): Promise<Uint8Array> {
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import("puppeteer-core"),
    import("@sparticuz/chromium"),
  ]);
  const local = process.env.CHROME_EXECUTABLE_PATH;
  const browser = await puppeteer.launch(
    local
      ? { executablePath: local, headless: true }
      : { executablePath: await chromium.executablePath(), args: chromium.args, headless: "shell" },
  );
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    // The page is opened as the person who asked for the PDF, so it shows what they may see.
    const { origin, protocol } = new URL(url);
    await page.setCookie({
      name: session.name,
      value: session.value,
      url: origin,
      httpOnly: true,
      secure: protocol === "https:",
      sameSite: "Lax",
    });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForSelector("[data-form-ready]", { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
