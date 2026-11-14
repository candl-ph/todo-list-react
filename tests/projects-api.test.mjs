import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const origin = process.env.TODOLIZT_TEST_ORIGIN;
const database = process.env.TODOLIZT_TEST_DATABASE_URL;
const secret = process.env.TODOLIZT_TEST_AUTH_SECRET;
test('project and legacy task HTTP APIs remain compatible and account isolated', { skip: !origin || !database || !secret }, async () => {
  // This suite creates fixture accounts: require a dedicated local database explicitly.
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
  assert.equal(new URL(database).pathname, '/projects_check');
  const pool = new pg.Pool({ connectionString: database });
  const users = [];
  async function fixture() {
    const id = randomUUID(); users.push(id);
    const token = randomUUID(); const email = `${id}@example.test`;
    await pool.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)', [id, email, 'test-only']);
    await pool.query('INSERT INTO api_tokens (user_id,token_hash,label) VALUES ($1,$2,$3)', [id, createHash('sha256').update(token).digest('hex'), 'project compatibility test']);
    const payload = Buffer.from(JSON.stringify({ userId: id, email, exp: Date.now() + 60000 })).toString('base64url');
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    return { token, cookie: `todolizt_session=${payload}.${signature}` };
  }
  async function call(path, { token, cookie, method = 'GET', body } = {}) {
    const response = await fetch(`${origin}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  try {
    await pool.query(readFileSync(new URL('../scripts/schema.sql', import.meta.url), 'utf8'));
    const a = await fixture(); const b = await fixture();
    assert.equal((await call('/api/agent/projects')).status, 401);
    assert.equal((await call('/api/agent/projects', { token: 'invalid' })).status, 401);
    const task = await call('/api/agent/tasks', { token: a.token, method: 'POST', body: { text: 'Existing task', list: 'compat-project', agent: 'codex' } });
    assert.equal(task.status, 200);
    const created = await call('/api/agent/projects', { token: a.token, method: 'POST', body: { list: 'COMPAT-PROJECT', title: 'Project', notes: 'Context', agent: 'codex' } });
    assert.equal(created.status, 200);
    const id = created.body.id;
    const path = `/api/agent/projects/${id}`;
    assert.equal(created.body.list, 'compat-project');
    assert.equal((await call('/api/agent/projects', { token: a.token, method: 'POST', body: { list: 'compat-project', agent: 'cursor' } })).status, 409);
    assert.deepEqual((await call('/api/agent/projects', { token: b.token })).body.projects, []);
    assert.equal((await call(path, { token: b.token })).status, 404);
    assert.equal((await call(path, { token: b.token, method: 'PATCH', body: { agent: 'cursor', version: 1, notes: 'Wrong account' } })).status, 404);
    assert.equal((await call(path, { token: a.token, method: 'PATCH', body: { agent: 'cursor', version: 1, links: [{ label: 'Bad', url: 'file:///bad' }] } })).status, 400);
    assert.equal((await call(path, { token: a.token, method: 'PATCH', body: { agent: 'cursor', version: 1, list: 'renamed' } })).status, 400);
    const [projectEdit, taskEdit] = await Promise.all([
      call(path, { token: a.token, method: 'PATCH', body: { agent: 'cursor', version: 1, notes: 'Updated context', archived: true } }),
      call(`/api/agent/tasks/${task.body.id}/update`, { token: a.token, method: 'POST', body: { agent: 'codex', text: 'Concurrent task edit' } }),
    ]);
    assert.equal(projectEdit.status, 200); assert.equal(taskEdit.status, 200);
    assert.equal((await call(path, { token: a.token, method: 'PATCH', body: { agent: 'cursor', version: 1, notes: 'Stale' } })).status, 409);
    assert.equal((await call('/api/agent/projects?list=compat-project', { token: a.token })).body.projects.length, 1);
    assert.equal((await call('/api/agent/projects?includeArchived=false', { token: a.token })).body.projects.length, 0);
    const listed = await call('/api/agent/tasks?status=open&agent=codex&list=compat-project', { token: a.token });
    assert.equal(listed.body.tasks[0].text, 'Concurrent task edit');
    assert.equal((await call(`/api/agent/tasks/${task.body.id}/claim`, { token: a.token, method: 'POST', body: { agent: 'cursor' } })).status, 409);
    for (const action of ['release', 'claim', 'complete']) {
      assert.equal((await call(`/api/agent/tasks/${task.body.id}/${action}`, { token: a.token, method: 'POST', body: { agent: 'cursor' } })).status, 200);
    }
    const detail = await call(path, { token: a.token });
    assert.deepEqual(detail.body.counts, { total: 1, completed: 1 });
    assert.equal(detail.body.notes, 'Updated context');
    let document = (await call('/api/data', { cookie: a.cookie })).body;
    delete document.data.projects;
    assert.equal((await call('/api/data', { cookie: a.cookie, method: 'PUT', body: document })).status, 200);
    assert.equal((await call(path, { token: a.token })).body.notes, 'Updated context');
    document = (await call('/api/data', { cookie: a.cookie })).body;
    delete document.data.projects; document.data.customCategories = [];
    assert.equal((await call('/api/data', { cookie: a.cookie, method: 'PUT', body: document })).status, 409);
    assert.equal((await call(path, { token: a.token })).body.list, 'compat-project');
  } finally {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await pool.end();
  }
});
