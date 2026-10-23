import { respostaDoLlms } from "@/lib/site-publico/llms";

export const dynamic = "force-dynamic";

export function GET() {
  return respostaDoLlms(false);
}
