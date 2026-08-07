import { describe, expect, it } from "vitest";
import { PERMISSIONS, UserRole } from "../types";
import { getPermissionsByRole, normalizeUserPermissions } from "./store";

describe("role permission defaults", () => {
  it("keeps the public viewer away from image cloud and grants meeting-room read access", () => {
    const permissions = getPermissionsByRole(UserRole.VIEWER);

    expect(permissions).toContain(PERMISSIONS.VIEW_PHYSICIAN);
    expect(permissions).toContain(PERMISSIONS.VIEW_MEETING_ROOM);
    expect(permissions).not.toContain(PERMISSIONS.VIEW_CLOUD_SCHEDULE);
    expect(permissions).not.toContain(PERMISSIONS.EDIT_CLOUD_SCHEDULE);
    expect(permissions).not.toContain(PERMISSIONS.EDIT_MEETING_ROOM);
  });

  it("preserves meeting-room booking access for standard staff roles", () => {
    const permissions = getPermissionsByRole(UserRole.RADIOGRAPHER_STAFF);

    expect(permissions).toContain(PERMISSIONS.VIEW_MEETING_ROOM);
    expect(permissions).toContain(PERMISSIONS.EDIT_MEETING_ROOM);
  });

  it("removes stale image-cloud access when a viewer is updated in realtime", () => {
    const permissions = normalizeUserPermissions(UserRole.VIEWER, [
      PERMISSIONS.VIEW_CLOUD_SCHEDULE,
      PERMISSIONS.EDIT_CLOUD_SCHEDULE,
    ]);

    expect(permissions).toEqual(getPermissionsByRole(UserRole.VIEWER));
  });
});
