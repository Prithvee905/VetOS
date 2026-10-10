import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignInPanel } from "./sign-in-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

test("shows the product name", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SignInPanel />
    </QueryClientProvider>
  );
  expect(screen.getByRole("heading", { name: "VetOS" })).toBeInTheDocument();
});
