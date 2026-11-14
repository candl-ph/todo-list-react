"use client";

import { useState } from "react";
import type { TodoStore } from "@/hooks/use-todos";
import { projectCounts, projectStatuses, projectStatusLabels, type Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ProjectDetails({ project, store }: { project: Project; store: TodoStore }) {
  const [mode, setMode] = useState<"overview" | "notes" | null>(null);
  const [draft, setDraft] = useState(project);
  const [error, setError] = useState("");
  const counts = projectCounts(project, store.todos);
  const disabled = !store.writable || store.busy;
  const begin = (next: "overview" | "notes") => { setDraft(project); setError(""); setMode(next); };
  const cancel = () => { setDraft(project); setMode(null); setError(""); };
  return <section className="mb-8 space-y-5" aria-label="Project details">
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{projectStatusLabels[project.status]}{project.archived ? " · Archived" : ""}</span><span>{counts.total ? `${counts.completed}/${counts.total} tasks completed` : "No tasks yet"}</span></div>
    {counts.total > 0 && <progress aria-label="Project progress" className="h-2 w-full accent-primary" value={counts.completed} max={counts.total} />}
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Overview</h2><Button size="sm" variant="outline" disabled={disabled || mode !== null} onClick={() => begin("overview")}>Edit overview</Button></div>
      <p className="mb-4 break-all text-xs text-muted-foreground">Agent list key: <code>{project.list}</code></p>
      {mode === "overview" ? <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        const problem = await store.updateProject(project.id, { title: draft.title, summary: draft.summary, goals: draft.goals, status: draft.status, links: draft.links, archived: draft.archived }, draft.version);
        if (problem) setError(problem); else cancel();
      }}>
        <label className="block space-y-1 text-sm">Title<Input required maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="block space-y-1 text-sm">Summary<Textarea maxLength={2000} value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} /></label>
        <label className="block space-y-1 text-sm">Goals<Textarea maxLength={10000} rows={5} value={draft.goals} onChange={event => setDraft({ ...draft, goals: event.target.value })} /></label>
        <label className="block space-y-1 text-sm">Status <select aria-label="Project status" className="rounded-md border bg-background p-2" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Project["status"] })}>{projectStatuses.map(status => <option key={status} value={status}>{projectStatusLabels[status]}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.archived} onChange={event => setDraft({ ...draft, archived: event.target.checked })} />Archived</label>
        <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Reference links</legend>{draft.links.map((link, index) => <div key={index} className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1" required aria-label={`Link ${index + 1} label`} maxLength={200} value={link.label} placeholder="Label" onChange={event => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><Input className="min-w-0 flex-1" required type="url" aria-label={`Link ${index + 1} URL`} maxLength={2048} value={link.url} placeholder="https://…" onChange={event => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item) })} /><Button type="button" variant="ghost" aria-label={`Remove link ${index + 1}`} onClick={() => setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })}>Remove</Button></div>)}<Button type="button" size="sm" variant="outline" disabled={draft.links.length >= 50} onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })}>Add reference link</Button></fieldset>
        <div className="flex gap-2"><Button disabled={disabled}>Save overview</Button><Button type="button" variant="ghost" disabled={store.busy} onClick={cancel}>Cancel</Button></div>
      </form> : <div className="space-y-4 text-sm"><p className="whitespace-pre-wrap break-words text-muted-foreground">{project.summary || "Add a summary of your idea."}</p><div><h3 className="mb-2 font-medium">Goals</h3><p className="whitespace-pre-wrap break-words text-muted-foreground">{project.goals || "Describe what success looks like."}</p></div>{project.links.length > 0 && <ul className="space-y-2">{project.links.map((link, index) => <li key={index}><a className="break-words text-primary underline" href={link.url} target="_blank" rel="noreferrer">{link.label}</a></li>)}</ul>}</div>}
    </div>
    <div className="rounded-xl border bg-card p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-semibold">Notes</h2><Button variant="outline" size="sm" disabled={disabled || mode !== null} onClick={() => begin("notes")}>Edit notes</Button></div>
      {mode === "notes" ? <form className="space-y-3" onSubmit={async event => {
        event.preventDefault();
        const problem = await store.updateProject(project.id, { notes: draft.notes }, draft.version);
        if (problem) setError(problem); else cancel();
      }}><Textarea aria-label="Project notes" rows={14} maxLength={100000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /><p className="text-xs text-muted-foreground">{draft.notes.length.toLocaleString()} / 100,000 characters</p><div className="flex gap-2"><Button disabled={disabled}>Save notes</Button><Button type="button" variant="ghost" disabled={store.busy} onClick={cancel}>Cancel</Button></div></form> : <p className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">{project.notes || "Keep requirements, research, and decisions here."}</p>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <h2 className="pt-2 text-lg font-semibold">Tasks</h2>
  </section>;
}
