import { NextResponse } from "next/server";
import { z } from "zod";
import { agentFailure, commitAgentChange, requireAgent } from "@/lib/agent-api";
import { readDocument } from "@/lib/db";
import { agentName } from "@/lib/todo-store";
import { findProject, projectCounts, projectFieldsSchema, updateProject } from "@/lib/projects";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const updateSchema = projectFieldsSchema.partial().extend({ agent: z.string(), version: z.number().int().positive().safe() }).strict();
export async function GET(request: Request, context: Context) {
  try {
    const auth = await requireAgent(request);
    if ("error" in auth && auth.error) return auth.error;
    const { id } = await context.params;
    const { data } = await readDocument(auth.userId);
    const project = findProject(data, id);
    return NextResponse.json({ ...project, counts: projectCounts(project, data.todos) });
  } catch (error) { return agentFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await requireAgent(request);
    if ("error" in auth && auth.error) return auth.error;
    const { id } = await context.params;
    const { agent, version, ...fields } = updateSchema.parse(await request.json().catch(() => null));
    const editor = agentName(agent);
    const saved = await commitAgentChange(auth.userId, current => updateProject(current, id, fields, version, editor));
    if (saved instanceof NextResponse) return saved;
    return NextResponse.json(findProject(saved.data, id));
  } catch (error) { return agentFailure(error); }
}
