import { api } from "./api";
import { track } from "./analytics";
import { invalidateWorkspaceCatalog } from "./workspaceCatalog";

/** Create a project (optionally with an opening prompt) and return its id. */
export async function createProject(opts: {
  workspaceId: string;
  /** Explicit name; when omitted the API AI-generates one from the prompt. */
  name?: string;
  prompt?: string;
}): Promise<{ id: string; name: string; prompt?: string }> {
  const prompt = opts.prompt?.trim() || undefined;
  const name = opts.name?.trim().slice(0, 60) || undefined;
  const project = await api.post<{ id: string; name: string }>("/v1/projects", {
    ...(name ? { name } : {}),
    prompt,
    workspaceId: opts.workspaceId,
    // Every caller opens the project next, so its sandbox can start now.
    startSandbox: true,
  });
  invalidateWorkspaceCatalog({ workspaceId: opts.workspaceId });
  track("project_created");
  return { id: project.id, name: project.name, prompt };
}
