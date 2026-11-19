import { apiSession } from "@/lib/http";
import { beginTotpSetup } from "@/modules/auth/service";

export const POST = apiSession(async ({ ctx }) => beginTotpSetup(ctx));
