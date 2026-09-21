import { createFromSource } from "fumadocs-core/search/server";
import { docsSource } from "@/lib/docs-source";

export const dynamic = "force-static";

const search = createFromSource(docsSource);

export const GET = search.staticGET;
