const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProject, updateProject, findProject, projectCounts, preserveLegacyProjects, projectSchema } = require('../src/lib/projects.ts');
const { emptyTodoData, parseTodoData, addAgentTask, updateAgentTask, claimAgentTask, completeAgentTask, releaseAgentTask, selectAgentTasks, renameCategory, deleteCategory, trashTodos, restoreTrash, createBackup, parseBackup, mergeBackup, mergeGuestTasks, loadTodoData, saveTodoData, commitTodoChange, DATA_KEY } = require('../src/lib/todo-store.ts');
const seed = () => createProject(emptyTodoData(), 'recipe-app', { title: 'Recipes', notes: 'Requirements' }, 'codex', 'project', 10);
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('upgrades lists without changing active tasks, claims, notes, or Trash', () => {
  const task = { id: 'task', text: 'Build', category: 'recipe-app', completed: false, createdAt: 1, agent: 'codex', note: 'Keep' };
  const data = { ...emptyTodoData(), customCategories: ['recipe-app'], todos: [task], trash: [{ todo: { ...task, id: 'deleted' }, deletedAt: 10 }] };
  const upgraded = createProject(data, 'RECIPE-APP', {}, 'user', 'project', 10);
  assert.deepEqual(upgraded.todos, data.todos);
  assert.deepEqual(upgraded.trash, data.trash);
  assert.equal(upgraded.projects[0].list, 'recipe-app');
  assert.equal(upgraded.projects[0].status, 'idea');
  assert.equal(upgraded.projects[0].lastEditedBy, 'user');
  assert.throws(() => createProject(upgraded, 'Recipe-App', {}, 'user'), error => error.status === 409);
  assert.equal(createProject(emptyTodoData(), 'work', {}, 'user').projects[0].list, 'Work');
});
test('title, lifecycle, and archive edits keep list keys and task state fixed', () => {
  let data = addAgentTask(seed(), { text: 'Build', list: 'recipe-app', agent: 'codex' }, 11, 'task').data;
  for (const status of ['planning', 'active', 'on-hold', 'completed']) {
    data = updateProject(data, 'project', { title: 'New title', status }, data.projects[0].version, 'cursor', 20);
  }
  data = updateProject(data, 'project', { archived: true }, data.projects[0].version, 'user');
  assert.equal(data.projects[0].list, 'recipe-app');
  assert.equal(data.projects[0].lastEditedBy, 'user');
  assert.equal(data.todos[0].completed, false);
  assert.equal(selectAgentTasks(data.todos, 'open', 'codex', 'recipe-app').length, 1);
  data = updateProject(data, 'project', { archived: false }, data.projects[0].version, 'user');
  assert.equal(data.projects[0].archived, false);
  assert.throws(() => renameCategory(data, 'recipe-app', 'renamed'), /agent list key/);
  assert.throws(() => deleteCategory(data, 'recipe-app'), /Archive/);
});
test('project edits reject stale versions, missing projects, unknown fields, and unsafe content', () => {
  const data = updateProject(seed(), 'project', { notes: 'New notes' }, 1, 'cursor');
  assert.throws(() => updateProject(data, 'project', { notes: 'Stale' }, 1, 'codex'), error => error.status === 409);
  assert.equal(data.projects[0].notes, 'New notes');
  assert.throws(() => findProject(data, 'missing'), error => error.status === 404);
  for (const fields of [{ title: '' }, { status: 'other' }, { list: 'different' }, { notes: 'x'.repeat(100001) }, { links: [{ label: 'Bad', url: 'javascript:alert(1)' }] }]) {
    assert.throws(() => updateProject(data, 'project', fields, 2, 'codex'));
  }
  assert.throws(() => parseTodoData({ ...data, projects: [...data.projects, { ...data.projects[0], id: 'different' }] }));
  assert.throws(() => parseTodoData({ ...data, customCategories: [] }));
  assert.equal(projectSchema.parse({ ...data.projects[0], notes: '<script>plain text</script>' }).notes, '<script>plain text</script>');
});
test('agent task actions continue to work and preserve project context, including in Trash', () => {
  let data = addAgentTask(seed(), { text: 'Build', list: 'RECIPE-APP' }, 11, 'task').data;
  data = claimAgentTask(data, 'task', 'codex').data;
  data = updateAgentTask(data, 'task', { agent: 'codex', status: 'pending' }).data;
  data = releaseAgentTask(data, 'task', 'codex').data;
  data = completeAgentTask(data, 'task', 'cursor').data;
  assert.deepEqual(projectCounts(data.projects[0], data.todos), { total: 1, completed: 1 });
  const trashed = trashTodos(data, ['task']);
  assert.deepEqual(projectCounts(data.projects[0], trashed.todos), { total: 0, completed: 0 });
  assert.deepEqual(restoreTrash(trashed, ['task']).projects, seed().projects);
  data = addAgentTask(data, { text: 'Move me', list: 'recipe-app', agent: 'codex' }, 12, 'move').data;
  data = updateAgentTask(data, 'move', { agent: 'codex', list: 'Other' }).data;
  assert.deepEqual(projectCounts(data.projects[0], data.todos), { total: 1, completed: 1 });
  assert.equal(data.projects[0].notes, 'Requirements');
});
test('version 2 backup round trips projects; version 1 imports empty project metadata', () => {
  const data = seed();
  assert.deepEqual(parseBackup(createBackup(data)), data);
  const legacy = JSON.parse(createBackup(emptyTodoData()));
  legacy.version = 1; delete legacy.data.projects;
  assert.deepEqual(parseBackup(JSON.stringify(legacy)).projects, []);
});
test('backup and login merges add projects without replacing duplicate IDs or keys', () => {
  const data = seed();
  const incoming = createProject(emptyTodoData(), 'recipe-app', { notes: 'Do not replace' }, 'cursor', 'other');
  assert.equal(mergeBackup(data, incoming).projects.length, 1);
  assert.equal(mergeBackup(data, incoming).projects[0].notes, 'Requirements');
  const distinct = createProject(emptyTodoData(), 'another', {}, 'cursor', 'another');
  const result = mergeGuestTasks(data, distinct);
  assert.equal(result.projects, 1);
  assert.equal(result.data.projects.length, 2);
  assert.deepEqual(mergeBackup(result.data, distinct), result.data);
});
test('browser storage migrates once and old tabs cannot overwrite the new project snapshot', () => {
  const original = JSON.stringify({ ...emptyTodoData(), revision: 8 });
  const saved = storage({ 'todo-data-v1': original });
  const loaded = loadTodoData(saved);
  assert.equal(loaded.revision, 8);
  assert.equal(saved.getItem('todo-data-v1'), original);
  saveTodoData(saved, seed(), 9);
  saved.setItem('todo-data-v1', JSON.stringify({ ...emptyTodoData(), revision: 99 }));
  assert.equal(loadTodoData(saved).data.projects[0].notes, 'Requirements');
  assert.equal(loadTodoData(saved).revision, 9);
  assert.notEqual(saved.getItem(DATA_KEY), null);
});
test('legacy browser account saves retain project metadata and cannot remove or rename keys', () => {
  const current = seed();
  const incoming = parseTodoData({ todos: [], customCategories: ['recipe-app'], trash: [] });
  assert.deepEqual(preserveLegacyProjects(current, incoming).projects, current.projects);
  assert.throws(() => preserveLegacyProjects(current, emptyTodoData()), error => error.status === 409);
});
test('coordinated task and project writes preserve both changes', async () => {
  const saved = storage(); saveTodoData(saved, seed(), 1);
  let tail = Promise.resolve();
  const locks = { request(_name, callback) { const result = tail.then(callback); tail = result.catch(() => {}); return result; } };
  await Promise.all([
    commitTodoChange(saved, locks, current => addAgentTask(current, { text: 'Task', list: 'recipe-app' }).data),
    commitTodoChange(saved, locks, current => updateProject(current, 'project', { notes: 'Updated' }, 1, 'codex')),
  ]);
  const result = loadTodoData(saved).data;
  assert.equal(result.todos.length, 1);
  assert.equal(result.projects[0].notes, 'Updated');
});

test('import reconciles case variants of project list keys for tasks and Trash', () => {
  const current = seed();
  let incoming = createProject(emptyTodoData(), 'RECIPE-APP', {}, 'cursor', 'duplicate');
  incoming = addAgentTask(incoming, { text: 'Imported task', list: 'RECIPE-APP' }, Date.now(), 'imported').data;
  const merged = mergeBackup(current, incoming);
  assert.equal(merged.todos[0].category, 'recipe-app');
  assert.deepEqual(merged.customCategories, ['recipe-app']);
  assert.deepEqual(projectCounts(current.projects[0], merged.todos), { total: 1, completed: 0 });
  const deleted = mergeBackup(current, trashTodos(incoming, ['imported']));
  assert.equal(deleted.trash[0].todo.category, 'recipe-app');
});
