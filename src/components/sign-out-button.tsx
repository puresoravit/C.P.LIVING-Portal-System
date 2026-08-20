"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="w-full text-sm text-gray-600 hover:text-red-600 px-3 py-2 text-left"
    >
      ออกจากระบบ
    </button>
  );
}
