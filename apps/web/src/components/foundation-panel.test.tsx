import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { SignInPanel } from "./sign-in-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

test("shows the product name", () => {
  render(<SignInPanel />);
  expect(screen.getByRole("heading", { name: "VetOS" })).toBeInTheDocument();
});
