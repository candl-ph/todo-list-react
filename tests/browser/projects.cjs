// Run against a disposable local app. Optional login fixtures enable the account/agent check.
const assert = require('node:assert/strict');
const { mkdir, readFile } = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test');
const origin = process.env.TODOLIZT_TEST_ORIGIN;
if (!origin || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Set TODOLIZT_TEST_ORIGIN to a disposable localhost app.');
const artifacts = process.env.TODOLIZT_TEST_ARTIFACTS || '/tmp/todolizt-projects-browser';
(async () => {
  await mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(value => localStorage.setItem('theme', value), theme);
      async function navigate(name) {
        if (width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await page.getByRole('navigation', { name: 'Views', exact: true }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
      }
      const key = `browser-project-${width}-${theme}-${Date.now()}`;
      console.log(`CHECK ${theme} ${width}: project workflow`);
      await page.goto(`${origin}/?view=projects`);
      await expect(page.getByRole('heading', { name: 'Start a project' })).toBeVisible();
      await page.getByLabel('List key', { exact: true }).fill(key);
      await page.getByLabel('Project title', { exact: true }).fill('Recipe project');
      await page.getByRole('button', { name: 'Create or upgrade list' }).click();
      await expect(page.getByRole('heading', { name: 'Recipe project', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit overview', exact: true }).click();
      await page.getByLabel('Title', { exact: true }).fill('Recipe planner');
      await page.getByLabel('Summary', { exact: true }).fill('Plan dinner without waste');
      await page.getByLabel('Goals', { exact: true }).fill('Capture recipes\nBuild ingredient search');
      await page.locator('select').selectOption('active');
      await page.getByRole('button', { name: 'Add reference link' }).click();
      await page.getByLabel('Link 1 label', { exact: true }).fill('Reference');
      await page.getByLabel('Link 1 URL', { exact: true }).fill('https://example.com/recipes');
      await page.getByRole('button', { name: 'Save overview' }).click();
      await expect(page.getByRole('heading', { name: 'Recipe planner', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Reference', exact: true })).toHaveAttribute('href', 'https://example.com/recipes');
      await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
      await page.getByLabel('Project notes', { exact: true }).fill('Requirements\n<script>window.unwanted=true</script>');
      await page.getByRole('button', { name: 'Save notes' }).click();
      await expect(page.getByText('Requirements\n<script>window.unwanted=true</script>', { exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => window.unwanted), undefined);
      for (const text of ['Research recipes', 'Build search']) {
        await page.getByLabel('New task', { exact: true }).fill(text);
        await page.getByRole('button', { name: 'Add task', exact: true }).click();
        await expect(page.getByLabel(`Task: ${text}`, { exact: true })).toBeVisible();
      }
      await page.getByRole('checkbox', { name: 'Mark Research recipes complete', exact: true }).click();
      await expect(page.getByText('1/2 tasks completed', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Put on hold: Build search', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Resume Build search', exact: true })).toBeVisible();
      await navigate('All Tasks');
      await page.getByLabel('New task', { exact: true }).fill('Build unrelated');
      await page.getByRole('button', { name: 'Add task', exact: true }).click();
      await expect(page.getByLabel('Task: Build unrelated', { exact: true })).toBeVisible();
      await page.getByLabel('Search every list', { exact: true }).fill('Build');
      await expect(page.getByText('2 tasks found in every list', { exact: true })).toBeVisible();
      await navigate('Projects');
      await page.getByRole('main').getByRole('button').filter({ hasText: 'Recipe planner' }).click();
      await page.getByLabel('Search project tasks', { exact: true }).fill('Build');
      await expect(page.getByText('1 task found in this project', { exact: true })).toBeVisible();
      await page.getByLabel('Search project tasks', { exact: true }).clear();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Recipe planner', exact: true })).toBeVisible();
      await expect(page.getByText('Requirements\n<script>window.unwanted=true</script>', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit overview', exact: true }).click();
      await page.getByLabel('Archived', { exact: true }).check();
      await page.getByRole('button', { name: 'Save overview' }).click();
      await navigate('Projects');
      await expect(page.getByRole('main').getByRole('button').filter({ hasText: 'Recipe planner' })).toHaveCount(0);
      await page.getByLabel('Include archived', { exact: true }).check();
      await page.getByRole('main').getByRole('button').filter({ hasText: 'Recipe planner' }).click();
      await page.getByRole('button', { name: 'Edit overview', exact: true }).click();
      await page.getByLabel('Archived', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Save overview' }).click();
      if (width >= 1024) {
        const projectLink = page.getByRole('navigation', { name: 'Projects', exact: true }).getByRole('button', { name: 'Recipe planner', exact: true });
        await projectLink.scrollIntoViewIfNeeded();
        await expect(projectLink).toBeVisible();
      }
      await page.evaluate(() => { window.scrollTo(0, 0); const sidebar = document.querySelector('aside'); if (sidebar) sidebar.scrollTop = 0; });
      await page.screenshot({ path: `${artifacts}/${theme}-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal overflow');
      await navigate('Settings');
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export backup', exact: true }).click();
      const download = await downloaded;
      const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
      assert.equal(backup.version, 2); assert.equal(backup.data.projects[0].list, key);
      assert.equal(backup.data.projects[0].title, 'Recipe planner');
      await page.getByLabel('Restore from a TodoLizt backup', { exact: true }).setInputFiles({ name: 'projects.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
      await expect(page.getByText(/1 existing projects will be skipped/)).toBeVisible();
      await page.getByRole('button', { name: 'Merge backup', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Merge backup', exact: true })).toHaveCount(0);
      const legacy = { format: 'daylight-backup', version: 1, exportedAt: new Date().toISOString(), data: { todos: [{ id: `legacy-${key}`, text: 'Legacy import', completed: false, createdAt: Date.now() }], customCategories: [], trash: [] } };
      await page.getByLabel('Restore from a TodoLizt backup', { exact: true }).setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
      await expect(page.getByText(/1 new tasks, 0 Trash items, and 0 projects/)).toBeVisible();
      await page.getByRole('button', { name: 'Merge backup', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Merge backup', exact: true })).toHaveCount(0);

      // Merge guest projects into an account and verify access through a new agent token.
      if (width === 1280 && theme === 'dark' && process.env.TODOLIZT_TEST_EMAIL && process.env.TODOLIZT_TEST_PASSWORD) {
        await page.getByLabel('Email', { exact: true }).fill(process.env.TODOLIZT_TEST_EMAIL);
        await page.getByLabel('Password', { exact: true }).fill(process.env.TODOLIZT_TEST_PASSWORD);
        await page.getByRole('button', { name: 'Log in', exact: true }).click();
        await expect(page.getByRole('complementary', { name: 'Task navigation' }).getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
        const tokenResponse = await context.request.post(`${origin}/api/tokens`, { data: { label: 'browser compatibility check' } });
        assert.equal(tokenResponse.status(), 200);
        const token = (await tokenResponse.json()).token;
        await expect.poll(async () => {
          const response = await context.request.get(`${origin}/api/agent/projects?list=${key}`, { headers: { authorization: `Bearer ${token}` } });
          return (await response.json()).projects.length;
        }).toBe(1);
        const projectResponse = await context.request.get(`${origin}/api/agent/projects?list=${key}`, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(projectResponse.status(), 200);
        const project = (await projectResponse.json()).projects[0];
        assert.equal(project.notes, backup.data.projects[0].notes);
        const taskResponse = await context.request.get(`${origin}/api/agent/tasks?status=all&list=${key}`, { headers: { authorization: `Bearer ${token}` } });
        assert.equal((await taskResponse.json()).tasks.length, 2);
        // Concurrent agent editing must preserve the browser draft and reject a stale save.
        await page.goto(`${origin}/?view=${encodeURIComponent(`category:${key}`)}`);
        await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
        await page.getByLabel('Project notes', { exact: true }).fill('Browser draft');
        const edited = await context.request.patch(`${origin}/api/agent/projects/${project.id}`, { headers: { authorization: `Bearer ${token}` }, data: { agent: 'codex', version: project.version, notes: 'Agent context' } });
        assert.equal(edited.status(), 200);
        await page.getByRole('button', { name: 'Save notes', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: /changed/ })).toBeVisible();
        await expect(page.getByLabel('Project notes', { exact: true })).toHaveValue('Browser draft');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByText('Agent context', { exact: true })).toBeVisible();
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${theme} ${width}: create, edit, notes, tasks, progress, search, archive, restore, reload, backup`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
