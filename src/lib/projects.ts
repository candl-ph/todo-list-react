import { z } from "zod";
import type { TodoData } from "./todo-store";
import type { Todo } from "../types/todo";

export const projectStatuses = ["idea", "planning", "active", "on-hold", "completed"] as const;
export const projectStatusLabels = { idea: "Idea", planning: "Planning", active: "Active", "on-hold": "On hold", completed: "Completed" };
export const projectFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(2000), goals: z.string().max(10000), notes: z.string().max(100000),
  links: z.array(z.object({ label: z.string().trim().min(1).max(200), url: z.string().url().max(2048).refine(value => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS link.") }).strict()).max(50),
  status: z.enum(projectStatuses), archived: z.boolean(),
});
export const projectSchema = projectFieldsSchema.extend({
  id: z.string().min(1), list: z.string().trim().min(1),
  createdAt: z.number().finite(), updatedAt: z.number().finite(),
  version: z.number().int().positive().safe(), lastEditedBy: z.string().trim().min(1).max(64),
});
export type Project = z.infer<typeof projectSchema>;
export type ProjectFields = z.infer<typeof projectFieldsSchema>;
export const projectKey = (list: string) => list.trim().toLowerCase();
export const projectsSchema = z.array(projectSchema).refine(projects =>
  new Set(projects.map(project => project.id)).size === projects.length &&
  new Set(projects.map(project => projectKey(project.list))).size === projects.length,
  "Project IDs and list keys must be unique.");
export class ProjectError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409) { super(message); this.status = status; }
}
export function projectCounts(project: Project, todos: Todo[]) {
  const tasks = todos.filter(todo => projectKey(todo.category ?? "") === projectKey(project.list));
  return { total: tasks.length, completed: tasks.filter(todo => todo.completed).length };
}
export function findProject(data: TodoData, id: string) {
  const project = data.projects.find(item => item.id === id);
  if (!project) throw new ProjectError("That project was not found.", 404);
  return project;
}
export function createProject(data: TodoData, list: string, fields: Partial<ProjectFields>, editor: string, id = crypto.randomUUID(), now = Date.now()): TodoData {
  const key = list.trim();
  if (!key) throw new ProjectError("List key cannot be empty.", 400);
  if (data.projects.some(project => projectKey(project.list) === projectKey(key))) throw new ProjectError("That list is already a project.", 409);
  const known = ["Work", "Personal", "Shopping", ...data.customCategories].find(name => projectKey(name) === projectKey(key));
  const project = projectSchema.parse({ title: known ?? key, summary: "", goals: "", notes: "", links: [], status: "idea", archived: false,
    ...fields, id, list: known ?? key, createdAt: now, updatedAt: now, version: 1, lastEditedBy: editor });
  return { ...data, customCategories: known ? data.customCategories : [...data.customCategories, key], projects: [...data.projects, project] };
}
export function updateProject(data: TodoData, id: string, fields: Partial<ProjectFields>, expectedVersion: number, editor: string, now = Date.now()): TodoData {
  const current = findProject(data, id);
  if (current.version !== expectedVersion) throw new ProjectError("This project changed. Your draft has been kept. Cancel to load the latest version, then retry.", 409);
  const patch = projectFieldsSchema.partial().strict().parse(fields);
  if (!Object.keys(patch).length) throw new ProjectError("Choose a project field to update.", 400);
  const project = projectSchema.parse({ ...current, ...patch, updatedAt: now, version: current.version + 1, lastEditedBy: editor });
  return { ...data, projects: data.projects.map(item => item.id === id ? project : item) };
}

// Older account clients know only tasks/lists. Keep project metadata and protect its fixed keys.
export function preserveLegacyProjects(current: TodoData, incoming: TodoData): TodoData {
  for (const project of current.projects) {
    if (!["Work", "Personal", "Shopping", ...incoming.customCategories].includes(project.list)) {
      throw new ProjectError("Reload TodoLizt to manage project lists. Their agent keys cannot be removed or renamed.", 409);
    }
  }
  return { ...incoming, projects: current.projects };
}
