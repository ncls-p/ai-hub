import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function getSession() {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: headerList,
  });
  return session;
}
