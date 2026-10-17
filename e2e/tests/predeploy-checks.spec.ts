import { test as base, expect, Page, BrowserContext } from '@playwright/test';
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
  /** Home feed must render at least one post (not stuck on "Loading posts..."). */
  requirePosts?: boolean;
  /** Implant directory must list at least one implant. */
  requireImplants?: boolean;
  /** Fail (instead of logging) when no implant detail page can be discovered and rendered. */
  requireDetailPage?: boolean;
  /** After redirects, the page must end up on this pathname. */
  expectedFinalPath?: string;
}

interface Config {
  pages: PageConfig[];
  mobileViewport: { width: number; height: number };
  overflowTolerancePx: number;
  dataWaitTimeoutMs?: number;
}

const configPath = path.join(__dirname, '..', 'pages.config.json');
const config: Config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const DATA_WAIT_MS = config.dataWaitTimeoutMs ?? 20000;

interface BadApiResponse {
  status: number;
  url: string;
}

/**
 * Every test gets an automatic API guard: any /api/* response with status 429 or 5xx
 * during the test fails it. This is what would have caught the Oct 2026 rate-limit
 * outage (pages returned 200 while the feed and implant list silently got 429).
 */
const test = base.extend<{ apiGuard: BadApiResponse[] }>({
  apiGuard: [
    async ({ page }, use, testInfo) => {
      const bad: BadApiResponse[] = [];
      page.on('response', (res) => {
        const url = res.url();
        let pathname = '';
        try {
          pathname = new URL(url).pathname;
        } catch {
          return;
        }
        if (!pathname.startsWith('/api/')) return;
        const status = res.status();
        if (status === 429 || status >= 500) bad.push({ status, url });
      });
      await use(bad);
      if (bad.length > 0) {
        await testInfo.attach('bad-api-responses', {
          body: JSON.stringify(bad, null, 2),
          contentType: 'application/json',
        });
      }
      expect(bad, `API returned 429/5xx during page load: ${JSON.stringify(bad)}`).toEqual([]);
    },
    { auto: true },
  ],
});

const POST_LINK_SELECTOR = 'a[href^="/post/"]:not([href$="/edit"])';
const IMPLANT_LINK_SELECTOR = 'a[href^="/implants/"]:not([href="/implants/methodology"])';

/** Wait for the home feed to render real posts; fail on loading/error/empty states. */
async function expectPostsRendered(page: Page): Promise<number> {
  const loading = page.getByText('Loading posts...', { exact: false });
  await expect(loading, 'Home feed stuck on "Loading posts..."').toHaveCount(0, { timeout: DATA_WAIT_MS });
  await expect(page.getByText('Could not load posts'), 'Home feed shows load error').toHaveCount(0);
  await expect(page.getByText('No posts available yet'), 'Home feed is empty').toHaveCount(0);
  const posts = page.locator(POST_LINK_SELECTOR);
  await expect(posts.first(), 'Home feed rendered no posts').toBeVisible({ timeout: DATA_WAIT_MS });
  return posts.count();
}

/** Wait for the implant directory to list at least one implant. */
async function expectImplantsListed(page: Page): Promise<number> {
  const links = page.locator(IMPLANT_LINK_SELECTOR);
  await expect(links.first(), 'Implant directory list is empty').toBeVisible({ timeout: DATA_WAIT_MS });
  await expect(page.getByText('No implants match', { exact: false })).toHaveCount(0);
  return links.count();
}

/** Open an implant detail page and verify it rendered (h1 with text, no error state). */
async function expectImplantDetailRendered(page: Page, detailPath: string): Promise<void> {
  const response = await page.goto(detailPath, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), `Detail page ${detailPath} status`).toBe(200);
  const h1 = page.locator('h1').first();
  await expect(h1, `Detail page ${detailPath} has no heading`).toBeVisible({ timeout: DATA_WAIT_MS });
  await expect(h1).not.toHaveText(/^\s*$/);
  await expect(page.getByText('Implant not found'), `Detail page ${detailPath} shows not found`).toHaveCount(0);
}

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

  const pageOrigin = new URL(page.url()).origin;

  for (const url of uniqueUrls) {
    // Same-origin assets are fetched from inside the browser so they follow the same
    // resolver rules (CHECK_RESOLVE_TO) as the page and hit the local stack, not prod.
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url, pageOrigin).origin === pageOrigin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin) {
      const status = await page.evaluate(async (u: string) => {
        try {
          const r = await fetch(u, { cache: 'no-store' });
          return r.status;
        } catch {
          return -1;
        }
      }, url);
      const imgData = imageData.find((d) => d.src === url);
      results.push(
        status === -1
          ? { src: url, status: null, naturalWidth: 0, error: 'in-page fetch failed' }
          : { src: url, status, naturalWidth: imgData?.naturalWidth ?? 0 }
      );
      continue;
    }
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
  // Wait for the list to render first (it is client-side data), but do not fail here.
  await page
    .locator(IMPLANT_LINK_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: DATA_WAIT_MS })
    .catch(() => undefined);
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
const EXPECT_SERVER_IP = (process.env.CHECK_EXPECT_SERVER_IP || '').trim();

test.describe('Check target', () => {
  test.skip(!EXPECT_SERVER_IP, 'CHECK_EXPECT_SERVER_IP not set');
  test('checks are hitting the expected (local) server', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    const addr = await response?.serverAddr();
    expect(addr?.ipAddress, `Checks resolved to ${addr?.ipAddress}, expected ${EXPECT_SERVER_IP}`).toBe(
      EXPECT_SERVER_IP
    );
  });
});

test.describe('Pre-deploy checks', () => {
  for (const pageConfig of config.pages) {
    const shouldSkip = isCI && !!pageConfig.skipInCI;
    
    test.describe(`Page: ${pageConfig.path}`, () => {
      test.skip(shouldSkip, 'Skipped in CI (requires populated database)');
      
      test('returns expected status and content', async ({ page, context }) => {
        const response = await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
        });

        expect(response?.status()).toBe(pageConfig.expectedStatus);

        if (pageConfig.expectedFinalPath) {
          await expect
            .poll(() => new URL(page.url()).pathname, { timeout: DATA_WAIT_MS })
            .toBe(pageConfig.expectedFinalPath);
        }

        if (pageConfig.expectedTitleSubstring) {
          if (pageConfig.expectedFinalPath) {
            await expect
              .poll(async () => (await page.title()).toLowerCase(), { timeout: DATA_WAIT_MS })
              .toContain(pageConfig.expectedTitleSubstring.toLowerCase());
          }
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

      if (pageConfig.requirePosts) {
        test('home feed renders posts (not stuck loading)', async ({ page }) => {
          await page.goto(pageConfig.path, { waitUntil: 'domcontentloaded' });
          const count = await expectPostsRendered(page);
          console.log(`${pageConfig.path}: ${count} post links rendered`);
        });
      }

      if (pageConfig.requireImplants) {
        test('implant directory lists implants', async ({ page }) => {
          await page.goto(pageConfig.path, { waitUntil: 'domcontentloaded' });
          const count = await expectImplantsListed(page);
          console.log(`${pageConfig.path}: ${count} implant links rendered`);
        });
      }

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

          if (pageConfig.requireDetailPage) {
            expect(detailPath, 'No implant detail page link found on the directory').toBeTruthy();
          }

          if (detailPath) {
            console.log(`Discovered implant detail page: ${detailPath}`);

            await expectImplantDetailRendered(page, detailPath);
            await page.waitForLoadState('networkidle').catch(() => undefined);

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
