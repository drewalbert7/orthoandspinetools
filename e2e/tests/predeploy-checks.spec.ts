import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface PageConfig {
  path: string;
  expectedStatus: number;
  expectedTitleSubstring?: string;
  expectedContentType?: string;
  checkImages: boolean;
  checkOverflow: boolean;
  discoverDetailPage?: boolean;
  skipInCI?: boolean;
}

interface Config {
  pages: PageConfig[];
  mobileViewport: { width: number; height: number };
  overflowTolerancePx: number;
}

const configPath = path.join(__dirname, '..', 'pages.config.json');
const config: Config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

interface OverflowElement {
  selector: string;
  width: number;
  clientWidth: number;
}

interface ImageCheckResult {
  src: string;
  status: number | null;
  naturalWidth: number;
  error?: string;
}

async function checkHorizontalOverflow(
  page: Page,
  tolerancePx: number
): Promise<{ hasOverflow: boolean; elements: OverflowElement[] }> {
  const result = await page.evaluate((tolerance: number) => {
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const hasOverflow = scrollWidth > clientWidth + tolerance;

    const overflowingElements: OverflowElement[] = [];

    if (hasOverflow) {
      const allElements = document.querySelectorAll('*');
      allElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > clientWidth + tolerance) {
          const selector = getSelector(el as HTMLElement);
          overflowingElements.push({
            selector,
            width: Math.round(rect.right),
            clientWidth,
          });
        }
      });
    }

    function getSelector(el: HTMLElement): string {
      if (el.id) return `#${el.id}`;
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).slice(0, 3).join('.');
        if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
      }
      return el.tagName.toLowerCase();
    }

    return { hasOverflow, elements: overflowingElements.slice(0, 10) };
  }, tolerancePx);

  return result;
}

async function checkImages(
  page: Page,
  context: BrowserContext
): Promise<ImageCheckResult[]> {
  const results: ImageCheckResult[] = [];

  const imageData = await page.evaluate(() => {
    const images: { src: string; naturalWidth: number; type: string }[] = [];

    document.querySelectorAll('img[src]').forEach((img) => {
      const imgEl = img as HTMLImageElement;
      if (imgEl.src && !imgEl.src.startsWith('data:')) {
        images.push({
          src: imgEl.src,
          naturalWidth: imgEl.naturalWidth,
          type: 'img',
        });
      }
      if (imgEl.srcset) {
        const srcsetParts = imgEl.srcset.split(',');
        srcsetParts.forEach((part) => {
          const url = part.trim().split(/\s+/)[0];
          if (url && !url.startsWith('data:')) {
            images.push({ src: url, naturalWidth: 0, type: 'srcset' });
          }
        });
      }
    });

    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((meta) => {
      const content = meta.getAttribute('content');
      if (content && !content.startsWith('data:')) {
        let url = content;
        if (url.startsWith('/')) {
          url = window.location.origin + url;
        }
        images.push({ src: url, naturalWidth: 0, type: 'meta' });
      }
    });

    return images;
  });

  const uniqueUrls = [...new Set(imageData.map((d) => d.src))];

  for (const url of uniqueUrls) {
    try {
      const response = await context.request.get(url, {
        timeout: 15000,
        maxRedirects: 5,
      });
      const imgData = imageData.find((d) => d.src === url);
      results.push({
        src: url,
        status: response.status(),
        naturalWidth: imgData?.naturalWidth ?? 0,
      });
    } catch (error) {
      results.push({
        src: url,
        status: null,
        naturalWidth: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function discoverImplantDetailPage(page: Page): Promise<string | null> {
  const href = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/implants/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.match(/\/implants\/[a-z0-9-]+$/i) && href !== '/implants/methodology') {
        return href;
      }
    }
    return null;
  });
  return href;
}

const isCI = !!process.env.CI;

test.describe('Pre-deploy checks', () => {
  for (const pageConfig of config.pages) {
    const shouldSkip = isCI && pageConfig.skipInCI;
    
    test.describe(`Page: ${pageConfig.path}`, () => {
      test.skip(shouldSkip, 'Skipped in CI (requires populated database)');
      
      test('returns expected status and content', async ({ page, context }) => {
        const response = await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
        });

        expect(response?.status()).toBe(pageConfig.expectedStatus);

        if (pageConfig.expectedTitleSubstring) {
          const title = await page.title();
          expect(title.toLowerCase()).toContain(
            pageConfig.expectedTitleSubstring.toLowerCase()
          );
        }

        if (pageConfig.expectedContentType === 'xml') {
          const contentType = response?.headers()['content-type'] || '';
          expect(
            contentType.includes('xml') || contentType.includes('text/xml')
          ).toBeTruthy();
        }
      });

      if (pageConfig.checkOverflow) {
        test('no horizontal overflow at 390px viewport', async ({ page }) => {
          await page.setViewportSize(config.mobileViewport);
          await page.goto(pageConfig.path, { waitUntil: 'networkidle' });
          await page.waitForTimeout(500);

          const { hasOverflow, elements } = await checkHorizontalOverflow(
            page,
            config.overflowTolerancePx
          );

          if (hasOverflow) {
            console.error(`Horizontal overflow detected on ${pageConfig.path}:`);
            elements.forEach((el) => {
              console.error(`  - ${el.selector}: ${el.width}px > ${el.clientWidth}px`);
            });
          }

          expect(hasOverflow, `Overflow elements: ${JSON.stringify(elements)}`).toBe(false);
        });
      }

      if (pageConfig.checkImages) {
        test('all images return HTTP 200', async ({ page, context }) => {
          await page.goto(pageConfig.path, { waitUntil: 'networkidle' });
          const imageResults = await checkImages(page, context);

          const failedImages = imageResults.filter(
            (img) => img.status !== 200 && img.status !== null
          );
          const errorImages = imageResults.filter((img) => img.error);

          if (failedImages.length > 0) {
            console.error(`Failed images on ${pageConfig.path}:`);
            failedImages.forEach((img) => {
              console.error(`  - ${img.src}: HTTP ${img.status}`);
            });
          }

          if (errorImages.length > 0) {
            console.error(`Error loading images on ${pageConfig.path}:`);
            errorImages.forEach((img) => {
              console.error(`  - ${img.src}: ${img.error}`);
            });
          }

          expect(failedImages.length, `Failed images: ${JSON.stringify(failedImages)}`).toBe(0);
          expect(errorImages.length, `Error images: ${JSON.stringify(errorImages)}`).toBe(0);
        });
      }

      if (pageConfig.discoverDetailPage) {
        test('discovered implant detail page is accessible', async ({ page, context }) => {
          await page.goto(pageConfig.path, { waitUntil: 'networkidle' });
          const detailPath = await discoverImplantDetailPage(page);

          if (detailPath) {
            console.log(`Discovered implant detail page: ${detailPath}`);

            const response = await page.goto(detailPath, { waitUntil: 'networkidle' });
            expect(response?.status()).toBe(200);

            const title = await page.title();
            expect(title.length).toBeGreaterThan(0);

            await page.setViewportSize(config.mobileViewport);
            await page.waitForTimeout(500);
            const { hasOverflow, elements } = await checkHorizontalOverflow(
              page,
              config.overflowTolerancePx
            );

            if (hasOverflow) {
              console.error(`Horizontal overflow on discovered page ${detailPath}:`);
              elements.forEach((el) => {
                console.error(`  - ${el.selector}: ${el.width}px > ${el.clientWidth}px`);
              });
            }

            expect(hasOverflow, `Overflow elements: ${JSON.stringify(elements)}`).toBe(false);
          } else {
            console.log('No implant detail page found to test (page may have no implants listed)');
          }
        });
      }
    });
  }
});
