import { NextResponse } from "next/server";
import { z } from "zod";
import { agentFailure, commitAgentChange, requireAgent } from "@/lib/agent-api";
import { readDocument } from "@/lib/db";
import { agentName } from "@/lib/todo-store";
import { createProject, projectCounts, projectFieldsSchema, projectKey } from "@/lib/projects";

export const dynamic = "force-dynamic";
const createSchema = projectFieldsSchema.partial().extend({ list: z.string().trim().min(1), agent: z.string() }).strict();
export async function GET(request: Request) {
  try {
    const auth = await requireAgent(request);
    if ("error" in auth && auth.error) return auth.error;
    const params = new URL(request.url).searchParams;
    const list = params.get("list");
    const archived = params.get("includeArchived") ?? "true";
    if ((list !== null && !list.trim()) || !["true", "false"].includes(archived)) return NextResponse.json({ error: "Use a nonempty list key and includeArchived=true or false." }, { status: 400 });
    const { data } = await readDocument(auth.userId);
    const projects = data.projects.filter(project => (!list || projectKey(project.list) === projectKey(list)) && (archived === "true" || !project.archived));
    return NextResponse.json({ projects: projects.map(project => ({ ...project, counts: projectCounts(project, data.todos) })) });
  } catch (error) { return agentFailure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAgent(request);
    if ("error" in auth && auth.error) return auth.error;
    const { list, agent, ...fields } = createSchema.parse(await request.json().catch(() => null));
    const editor = agentName(agent);
    const id = crypto.randomUUID();
    const now = Date.now();
    const saved = await commitAgentChange(auth.userId, current => createProject(current, list, fields, editor, id, now));
    if (saved instanceof NextResponse) return saved;
    return NextResponse.json(saved.data.projects.find(project => project.id === id));
  } catch (error) { return agentFailure(error); }
}
