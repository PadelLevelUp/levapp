import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import { startViewAs } from "@/lib/viewAs";

vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { name: "Maria Costa" } }) }));

import { ViewAsBanner } from "./ViewAsBanner";

afterEach(() => sessionStorage.clear());

describe("the view-as banner", () => {
  it("is absent in an ordinary session", () => {
    render(<ViewAsBanner />);
    expect(screen.queryByTestId("view-as-banner")).toBeNull();
  });

  it("names the user and says read-only, with only a close button", () => {
    startViewAs("aaa.bbb.ccc");
    render(<ViewAsBanner />);
    const banner = screen.getByTestId("view-as-banner");
    expect(banner).toHaveTextContent("Maria Costa");
    expect(banner).toHaveTextContent(/só leitura|read only/);
    expect(banner.querySelectorAll("button")).toHaveLength(1);
  });
});
