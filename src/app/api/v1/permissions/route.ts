import { apiFull } from "@/lib/http";
import { PERMISSIONS } from "@/modules/roles-permissions/registry";

export const GET = apiFull(async () => ({ items: PERMISSIONS }));
