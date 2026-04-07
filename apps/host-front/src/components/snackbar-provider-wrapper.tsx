"use client";

import { SnackbarProvider } from "notistack";

export default function SnackbarProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SnackbarProvider
            maxSnack={3}
            anchorOrigin={{
              vertical: "top",
              horizontal: "center", // Changed from "right" to "center"
            }}
            autoHideDuration={3000}
            >
    {children}
    </SnackbarProvider>;
}