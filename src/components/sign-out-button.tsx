"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({
  className = "w-full text-sm text-gray-600 hover:text-red-600 px-3 py-2 text-left",
  label = "ออกจากระบบ",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className={className}>
      {label}
    </button>
  );
}
