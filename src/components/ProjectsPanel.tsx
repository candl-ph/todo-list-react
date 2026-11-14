"use client";

import { useState } from "react";
import type { TodoStore } from "@/hooks/use-todos";
import { categoryValue } from "@/lib/todo-store";
import { projectCounts, projectStatuses, projectStatusLabels } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectsPanel({ store, search, navigate }: { store: TodoStore; search: string; navigate: (view: string) => void }) {
  const [status, setStatus] = useState("all");
  const [archived, setArchived] = useState(false);
  const [list, setList] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const projects = store.projects.filter(project => (archived || !project.archived) && (status === "all" || project.status === status) &&
    `${project.title} ${project.list} ${project.summary} ${project.goals} ${project.notes}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="space-y-6">
    <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={async event => {
      event.preventDefault(); setError("");
      const result = await store.createProject(list, title.trim() ? { title } : {});
      if (result.error) { setError(result.error); return; }
      const key = store.categories.find(name => name.toLowerCase() === list.trim().toLowerCase()) ?? list.trim();
      navigate(categoryValue(key));
    }}>
      <h2 className="font-medium">Start a project</h2>
      <p className="text-sm text-muted-foreground">Use an existing list name to upgrade it, or enter a new one. Its list key stays fixed so agents can keep finding it.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">List key<Input required list="project-list-keys" value={list} placeholder="e.g. recipe-app" onChange={event => setList(event.target.value)} /></label><label className="space-y-1 text-sm">Project title<Input maxLength={200} value={title} placeholder="Optional display title" onChange={event => setTitle(event.target.value)} /></label></div>
      <datalist id="project-list-keys">{store.categories.filter(name => !store.projects.some(project => project.list === name)).map(name => <option key={name} value={name} />)}</datalist>
      <Button disabled={!list.trim() || !store.writable || store.busy}>Create or upgrade list</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
    <div className="flex flex-wrap items-center gap-4"><label className="text-sm">Status <select aria-label="Filter projects by status" className="rounded-md border bg-background p-2" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{projectStatuses.map(value => <option key={value} value={value}>{projectStatusLabels[value]}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Include archived</label></div>
    <div className="grid gap-4 sm:grid-cols-2">{projects.map(project => {
      const counts = projectCounts(project, store.todos);
      return <button key={project.id} onClick={() => navigate(categoryValue(project.list))} className="min-w-0 space-y-3 rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary focus-visible:outline focus-visible:outline-primary">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-words font-semibold">{project.title}</span><span className="text-xs text-muted-foreground">{projectStatusLabels[project.status]}{project.archived ? " · Archived" : ""}</span></div>
        <p className="line-clamp-2 break-words text-sm text-muted-foreground">{project.summary || "Open this project to develop your idea."}</p>
        <p className="text-xs text-muted-foreground">{counts.total ? `${counts.completed}/${counts.total} tasks completed` : "No tasks yet"}</p>
        {counts.total > 0 && <progress aria-label={`${project.title} progress`} className="h-2 w-full accent-primary" max={counts.total} value={counts.completed} />}
      </button>;
    })}</div>
    {!projects.length && <p role="status" className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No projects match. Create a project or adjust your filters.</p>}
  </div>;
}
