import { randomUUID } from "../../src/utils/uuid";

describe("uuid", () => {
    describe("randomUUID", () => {
        it("should generate a UUID using crypto.randomUUID", () => {
            const uuid = randomUUID();
            
            expect(uuid).toBeDefined();
            expect(typeof uuid).toBe("string");
            expect(uuid.length).toBeGreaterThan(0);
        });

        it("should generate valid UUID v4 format", () => {
            const uuid = randomUUID();
            
            // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
            // where y is one of [8, 9, a, b]
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuid).toMatch(uuidRegex);
        });

        it("should generate unique UUIDs on multiple calls", () => {
            const uuid1 = randomUUID();
            const uuid2 = randomUUID();
            const uuid3 = randomUUID();
            
            expect(uuid1).not.toBe(uuid2);
            expect(uuid1).not.toBe(uuid3);
            expect(uuid2).not.toBe(uuid3);
        });

        it("should generate UUIDs with correct length", () => {
            const uuid = randomUUID();
            
            // Standard UUID format is 36 characters (32 hex + 4 hyphens)
            expect(uuid).toHaveLength(36);
        });

        it("should fallback to timestamp if crypto.randomUUID is unavailable", () => {
            // Save original randomUUID
            const originalRandomUUID = global.crypto.randomUUID;
            
            // Remove randomUUID to trigger fallback
            delete (global.crypto as any).randomUUID;
            
            const uuid = randomUUID();
            
            // Should be a timestamp string
            expect(uuid).toBeDefined();
            expect(typeof uuid).toBe("string");
            expect(uuid).toMatch(/^\d+$/); // Should be all digits
            
            // Restore original randomUUID
            (global.crypto as any).randomUUID = originalRandomUUID;
        });

        it("should use crypto.randomUUID when available", () => {
            // Spy on crypto.randomUUID
            const mockRandomUUID = jest.spyOn(global.crypto, "randomUUID");
            
            randomUUID();
            
            expect(mockRandomUUID).toHaveBeenCalled();
            
            mockRandomUUID.mockRestore();
        });

        it("should generate different UUIDs in rapid succession", () => {
            const uuids = new Set();
            const count = 100;
            
            for (let i = 0; i < count; i++) {
                uuids.add(randomUUID());
            }
            
            // All should be unique
            expect(uuids.size).toBe(count);
        });

        it("should handle concurrent UUID generation", async () => {
            const promises = Array.from({ length: 50 }, () => 
                Promise.resolve(randomUUID())
            );
            
            const uuids = await Promise.all(promises);
            const uniqueUuids = new Set(uuids);
            
            expect(uniqueUuids.size).toBe(50);
        });
    });
});
