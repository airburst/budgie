import { ApiError } from "./errors";

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("bad_request");
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  return parseJson(await request.text());
}
